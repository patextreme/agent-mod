---
id: TASK-6
title: Make exitPrompt a standalone chain step (rename from exitCondition)
status: Done
assignee: []
created_date: '2026-04-19 07:43'
updated_date: '2026-04-19 13:18'
labels:
  - refactor
dependencies: []
documentation:
  - extensions/chain/src/schema.ts
  - extensions/chain/src/index.ts
  - .pi/chains/backlog-groom.yaml
  - .pi/chains/backlog-review.yaml
  - AGENTS.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Currently, every chain step requires a `prompt` field, and `exitCondition` is an optional field on that step. This forces every step to send a prompt message to the model, even when the step's only purpose is to evaluate a condition for chain termination.

We want to enable more flexible chain definitions where a step can consist of only an exit/condition evaluation — without requiring a prompt. This supports conditional handoff patterns where the chain only needs to check whether to exit, not send additional instructions.

The existing `exitCondition` field name is misleading: its value is sent to the model as a prompt for evaluation, not a passive condition, so it should be renamed to `exitPrompt` to reflect its actual nature.

**Desired outcomes:**
- Steps can be defined with only an exit evaluation (no `prompt` field required), enabling standalone exit-checking steps
- Steps can be defined with only a prompt (no exit evaluation), as they work today
- When no step type is specified, the step defaults to prompt-only behavior, maintaining backward compatibility with existing chain definitions
- The `exitCondition` field is renamed to `exitPrompt` across all source code, schemas, chain definitions, and documentation
- An invalid step (having both `prompt` and `exitPrompt`, or neither) is rejected with a descriptive error
- When an exit step's evaluation does not trigger the exit, the exit evaluation exchange must not affect the model's context for subsequent steps (conversation context is reset to the point before the exit evaluation was sent)

**Essential context:** The exit evaluation mechanism currently works by enabling the `chain_exit` tool, sending an evaluation message to the model, and processing the result. This overall approach should be preserved — the task focuses on enabling standalone exit steps, clarifying the field naming, and introducing a way to distinguish step types. Existing chain definitions that currently combine `prompt` and `exitCondition` on the same step (such as backlog-groom and backlog-review) will need to be restructured into separate steps.

**Example of expected behavior (YAML):**

A step that previously had both `prompt` and `exitCondition` becomes two separate steps:

```yaml
# Before (old schema, no longer valid):
steps:
  - prompt: Review items based on user input.
    exitCondition: There are no issues with severity >= 6

# After (new schema — prompt type is default, exitPrompt type is explicit):
steps:
  - prompt: Review items based on user input.
  - type: exitPrompt
    exitPrompt: There are no issues with severity >= 6
  - prompt: Proceed to fix the issues with severity >= 6.
```
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Passes npm run format
- [x] #2 Passes npm run lint
- [x] #3 Passes npm run typecheck
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Chain step schema supports two step types distinguished by a `type` field: `prompt` (with required `prompt` field) and `exitPrompt` (with required `exitPrompt` field); when `type` is omitted, the step defaults to `prompt`; existing chain definitions with only a `prompt` field continue to validate successfully without changes
- [x] #2 No exitCondition references: The old exitCondition field name no longer appears anywhere in source code, schemas, chain definitions, or documentation; schema validation rejects exitCondition with a descriptive error
- [x] #3 Standalone exitPrompt steps work: A step with `type: exitPrompt` and no `prompt` field evaluates the exit condition by sending the exitPrompt value as an evaluation message to the model (preserving the existing `chain_exit` tool mechanism), without a separate `prompt` field; when the evaluation does not trigger exit, the model's context for subsequent steps is unaffected by the exit evaluation exchange
- [x] #4 Mutual exclusivity enforced by schema: Steps with neither `prompt` nor `exitPrompt`, or with both, are rejected by schema validation with a descriptive error
- [x] #5 $ARGUMENTS substitution works in both prompt and exitPrompt fields
- [x] #6 Complete migration of chain definitions: backlog-groom.yaml and backlog-review.yaml are restructured to use separate prompt and exitPrompt steps per the new schema; no step has both prompt and exitPrompt
- [x] #7 Documentation updated: AGENTS.md describes the type field, its two possible values, the default-to-prompt behavior when type is omitted, and the new step schema with examples
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Refactor schema: create `chainStepPromptSchema` and `chainStepExitPromptSchema` as `z.strictObject` variants with `z.discriminatedUnion`, add `z.preprocess` to inject `type: "prompt"` when absent
2. Update runtime dispatch: replace flat iteration with type-aware branching on `step.type` — prompt steps send message and wait; exitPrompt steps enable `chain_exit`, send evaluation message, wait, disable tool, reset context if no exit
3. Apply `$ARGUMENTS` substitution to both `prompt` and `exitPrompt` fields using `replaceAll`
4. Migrate chain definitions: split combined `prompt`+`exitCondition` steps in backlog-groom.yaml and backlog-review.yaml into separate prompt and exitPrompt steps
5. Update AGENTS.md: document `type` field, its two values, default-to-prompt behavior, and new step schema with examples
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Step type discriminator design:** Use a `type` field to distinguish between `prompt` steps and `exitPrompt` steps. This is the recommended approach for schema validation because:
- `z.discriminatedUnion` provides better error messages and type narrowing than alternatives
- A `type` field makes the step kind explicit in YAML/JSON, improving readability for chain authors
- The field naming is self-documenting: `prompt` type has a `prompt` field, `exitPrompt` type has an `exitPrompt` field

**Mutual exclusivity of prompt and exitPrompt:** Each step must have exactly one of `prompt` or `exitPrompt` — never both and never neither. This should be enforced at the schema validation level so that invalid chain definitions produce a descriptive error at load time rather than failing at runtime.

**Zod discriminatedUnion + default caveat:** `z.discriminatedUnion` requires the discriminator key (`type`) to be present in the parsed data to route to the correct variant. Zod's `.default("prompt")` on the `type` literal inside `chainStepPromptSchema` runs **after** the union has already tried to match — so if `type` is missing entirely, the discriminated union will fail to match either variant before the default kicks in. Use `z.preprocess` (or a similar pre-parse transform) to inject `type: "prompt"` when the `type` key is absent from the input object, before the data reaches `z.discriminatedUnion`.

Example approach:
```typescript
const preprocessDefaultType = z.preprocess(
  (data) => {
    if (typeof data === "object" && data !== null && !("type" in data)) {
      return { ...data, type: "prompt" };
    }
    return data;
  },
  z.discriminatedUnion("type", [chainStepPromptSchema, chainStepExitPromptSchema]),
);
```

Or consider using `z.union` with a custom refinement instead of `z.discriminatedUnion` if the preprocess approach feels too hacky — but the discriminated union is preferred for its better error messages and type narrowing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Refactored chain step schema from a single `chainStepSchema` with required `prompt` + optional `exitCondition` to a discriminated union with two step types:

- **`prompt` type** (default when `type` omitted): has a required `prompt` field — backward compatible
- **`exitPrompt` type**: has a required `exitPrompt` field — enables standalone exit evaluation steps

**Schema changes** (`schema.ts`):
- Created `chainStepPromptSchema` and `chainStepExitPromptSchema` as `z.strictObject` variants
- Used `z.preprocess` to inject `type: "prompt"` when absent, then `z.discriminatedUnion` for routing
- Mutual exclusivity enforced naturally: each variant's strictObject rejects the other's field
- Old `exitCondition` field rejected as unrecognized key
- Exported `ChainStep` type for runtime use

**Runtime changes** (`index.ts`):
- Replaced flat iteration over `promptChain` with type-aware dispatch on `step.type`
- `prompt` steps: send message, wait for turn
- `exitPrompt` steps: enable `chain_exit`, send evaluation message, wait, reset context if no exit
- `$ARGUMENTS` substitution applied to both `prompt` and `exitPrompt` fields

**Chain definition migrations**:
- `backlog-groom.yaml`: split combined `prompt`+`exitCondition` step into separate `prompt` and `exitPrompt` steps
- `backlog-review.yaml`: split combined step in same pattern

**Documentation** (`AGENTS.md`): updated schema examples, field descriptions, and added explanation of `type` field with its two values and default behavior
<!-- SECTION:FINAL_SUMMARY:END -->
