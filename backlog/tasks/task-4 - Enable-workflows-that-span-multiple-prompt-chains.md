---
id: TASK-4
title: Enable workflows that span multiple prompt chains
status: Done
assignee: []
created_date: '2026-04-18 04:01'
updated_date: '2026-04-20 04:13'
labels: []
dependencies:
  - TASK-6
documentation:
  - extensions/chain/src/schema.ts
  - extensions/chain/src/index.ts
  - extensions/chain/src/execution.ts
  - extensions/chain/src/loader.ts
  - .pi/chains/backlog-execute.yaml
  - .pi/chains/backlog-verify.yaml
  - AGENTS.md
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add handoff support to the chain extension, allowing one chain to automatically hand off execution to another chain after completing all steps. This enables workflows that span multiple prompt chains.

**Dependency context — TASK-6 (Done):** Refactored chain steps into a discriminated union schema with `prompt` and `exitPrompt` types. The `exitPrompt` step type evaluates a condition via `chain_exit` tool, with context reset when exit is not triggered. `$ARGUMENTS` substitution works in both step types. The handoff feature builds on this infrastructure.

### New YAML fields

```yaml
description: chain description
steps:
  - prompt: first prompt
  - type: exitPrompt
    exitPrompt: Condition that means we should stop looping
handoffTarget: <name of the target chain>        # optional; if absent, chain stops normally
handoffExitPrompt: <condition to skip handoff>   # optional; requires handoffTarget
```

### Design: `exitPrompt` decoupled from handoff

Step-level `exitPrompt` controls the **loop** only — it never prevents handoff. `handoffExitPrompt` is a separate evaluation that happens at the **handoff boundary** to conditionally skip handoff. Both use the same underlying mechanism: enable `chain_exit`, send evaluation message, check if `chain_exit` was called.

### Decision matrix

| `handoffTarget` | `handoffExitPrompt` | Behavior |
|---|---|---|
| absent | absent | Chain stops normally (current behavior) |
| present | absent | Always hand off (unconditional) |
| present | present | Evaluate — exit skips handoff, no-exit hands off |
| absent | present | **Invalid** — schema rejects this combination |

### Example Chain Definitions

Unconditional handoff (always continues):
```yaml
# .pi/chains/backlog-execute.yaml
description: Execute backlog task
steps:
  - prompt: Start working on $ARGUMENTS. Research what needs to be done and propose a plan.
handoffTarget: backlog-verify
```

Conditional handoff (using `handoffExitPrompt`):
```yaml
# .pi/chains/smart-fix.yaml
description: Analyze and optionally fix
steps:
  - prompt: Analyze the problem described in $ARGUMENTS.
  - type: exitPrompt
    exitPrompt: The analysis is complete
  - prompt: Apply the fix.
handoffTarget: verify-fix
handoffExitPrompt: No code changes were needed for this problem
```
This reads: Run the analyze-fix loop. After all steps complete, evaluate `handoffExitPrompt`. If no code changes were needed → `chain_exit` called → workflow aborts, no handoff. Otherwise → hand off to `verify-fix`.

Multi-chain workflow (backlog-execute → backlog-verify → backlog-finalize):
```yaml
# .pi/chains/backlog-execute.yaml
description: Execute backlog task
steps:
  - prompt: Start working on $ARGUMENTS. Research what needs to be done and propose a plan.
  - prompt: Go ahead
handoffTarget: backlog-verify
```
```yaml
# .pi/chains/backlog-verify.yaml
description: Review the codebase to see if it aligns with the task definition
loop: 20
steps:
  - prompt: Review the codebase for task $ARGUMENTS.
  - type: exitPrompt
    exitPrompt: There are no issues with severity >= 5
  - prompt: Fix the most severe remaining issue (severity >= 5).
handoffTarget: backlog-finalize
```
Note: `backlog-verify` uses step-level `exitPrompt` to break the loop early, but has **no** `handoffExitPrompt` — so it always hands off to `backlog-finalize`. The step-level exit is purely a loop optimization, not a handoff gate.
```yaml
# .pi/chains/backlog-finalize.yaml
description: Review the task record to see if it is properly finalized
loop: 20
steps:
  - prompt: Review the task record for $ARGUMENTS and check finalization.
  - type: exitPrompt
    exitPrompt: There are no issues with severity >= 5
  - prompt: Fix the most severe remaining finalization issue (severity >= 5).
```
`backlog-finalize` has no `handoffTarget` — it is the terminal chain in the workflow.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Passes npm run format
- [x] #2 Passes npm run lint
- [x] #3 Passes npm run typecheck
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Schema accepts optional `handoffTarget` and `handoffExitPrompt` string fields on chain definitions; `handoffExitPrompt` requires `handoffTarget` to be present (schema rejects `handoffExitPrompt` without `handoffTarget`); chains without `handoffTarget` continue to validate and work unchanged
- [x] #2 Unconditional handoff: chain with `handoffTarget` (no `handoffExitPrompt`) automatically hands off to the target chain after completing all steps/loops regardless of step-level `exitPrompt` outcome
- [x] #3 Conditional handoff: chain with `handoffTarget` + `handoffExitPrompt` evaluates the condition after chain completion; if `chain_exit` is called, handoff is skipped; otherwise handoff proceeds
- [x] #4 Step-level `exitPrompt` only breaks the loop — it never prevents handoff from happening
- [x] #5 `chain_exit` from step-level `exitPrompt` breaks the loop; `chain_exit` from `handoffExitPrompt` skips the handoff — both use the same `chain_exit` tool
- [x] #6 Invalid `handoffTarget`: target chain name not found in loaded definitions stops execution with a warning status message
- [x] #7 `$ARGUMENTS` is substituted in `handoffExitPrompt` text and inherited by the target chain (same args passed through to the handoff)
- [x] #8 Context is reset between chains so the target chain starts with fresh conversation context
- [x] #9 Status messages show the chain name during step execution (e.g. `chain: backlog-verify 1/3 step 1/20 loop`) and during handoff transitions (e.g. `chain: backlog-verify → backlog-finalize`)
- [x] #10 AGENTS.md documents `handoffTarget`, `handoffExitPrompt`, unconditional and conditional handoff patterns, the decision matrix, step-level `exitPrompt` decoupling, `chain_exit` interaction, and adds YAML chain definition examples
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extended `chainDefinitionSchema` with optional `handoffTarget` and `handoffExitPrompt` string fields, plus a `.refine()` that rejects `handoffExitPrompt` without `handoffTarget`
2. Extracted `ChainState` interface, `evaluateExitPrompt`, and `evaluateStepExitPrompt` shared helpers into `execution.ts`
3. Refactored `index.ts` — extracted inline execution logic into `executeChain()` recursive function with handoff support
4. Implemented handoff logic: after loop completion, check `handoffTarget` → evaluate optional `handoffExitPrompt` → recurse into target chain
5. Updated chain YAML files (`backlog-execute.yaml` and `backlog-verify.yaml`) with `handoffTarget` fields
6. Updated `AGENTS.md` with handoff documentation including decision matrix, examples, decoupling notes, and status messages
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
### Architecture

Extract the execution logic from the command handler into a reusable `executeChain(name, definition, args, ctx)` function. The command handler calls `executeChain` for the first chain; `executeChain` recurses for handoffs.

### `exitPrompt` evaluation — shared helper

Both step-level `exitPrompt` and `handoffExitPrompt` use the same evaluation path:
1. Enable `chain_exit` tool
2. Send evaluation message: "You will check the following condition. If the condition is met, please call the chain_exit tool; otherwise, do nothing.\nCondition: <prompt>"
3. Wait for turn to complete
4. Disable `chain_exit` tool
5. Check `isExitToolCalled` — if true, the condition was met

Extract this into a shared helper (e.g. `evaluateExitPrompt`). For step-level, reset context to before the evaluation if exit was NOT called. For handoff-level, no context reset needed — just proceed or skip.

### Key scoping rules

- `chainRootLeafId` is captured inside `executeChain` so each chain gets its own root context — handoff resets context to the current chain's root before recursing, giving the target chain a clean slate.
- `isExitToolCalled` and `isUserAborted` are reset at the start of `executeChain` so each chain starts with fresh state; `chain_exit` tool is disabled at the start of each chain.
- Step-level `exitPrompt` breaks only the **loop** — after the loop exits (whether via exit or completion), `executeChain` checks `handoffExitPrompt` if present.
- `chain_exit` from `handoffExitPrompt` aborts the workflow — no further handoff or execution.

### Cycles

Cycles are intentionally allowed — `handoffExitPrompt` / `chain_exit` provide the termination mechanism for workflow loops (e.g. execute → verify → execute → ...). Chain authors are responsible for ensuring termination. User abort is the safety net for runaway chains.

### Status messages

Include the chain name: `chain: <name> <stepIdx>/<total> step <loopIdx>/<loopN> loop` during execution, and `chain: <source> → <target>` during handoff transition.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added handoff support to the chain extension, enabling multi-chain workflows.

**Schema changes** (`schema.ts`):
- Added optional `handoffTarget` and `handoffExitPrompt` string fields to `chainDefinitionSchema`
- Added `.refine()` validation rejecting `handoffExitPrompt` without `handoffTarget`
- Backward compatible — chains without handoff fields continue to work unchanged

**Execution helpers** (`execution.ts`):
- Added `ChainState` interface for shared mutable state (`isExitToolCalled`, `isUserAborted`)
- Extracted `evaluateExitPrompt()` — shared evaluation logic enabling `chain_exit`, sending condition message, checking result
- Added `evaluateStepExitPrompt()` — wraps `evaluateExitPrompt` with context reset when exit not called (step-level behavior)

**Runtime refactoring** (`index.ts`):
- Extracted inline command handler logic into `executeChain(name, definition, args, ctx)` recursive function
- Step-level `exitPrompt` breaks the loop only — `isExitToolCalled` reset after loop so handoff is not affected
- After loop: if `handoffTarget` present, evaluate optional `handoffExitPrompt` — exit skips handoff, no-exit proceeds
- Invalid `handoffTarget` shows warning status message and stops execution
- Context reset between chains via `resetContext` to chain root before recursing
- `$ARGUMENTS` substituted in `handoffExitPrompt` and passed through to target chain
- Status messages include chain name during execution and handoff transitions

**Chain definition updates**:
- `backlog-execute.yaml`: added `handoffTarget: backlog-verify`
- `backlog-verify.yaml`: added `handoffTarget: backlog-finalize`
- `backlog-finalize.yaml`: unchanged (terminal chain)

**Documentation** (`AGENTS.md`):
- Documented `handoffTarget`, `handoffExitPrompt`, decision matrix, decoupling from step-level `exitPrompt`, `chain_exit` interaction, context reset, cycles, status message format
- Added unconditional, conditional, and multi-chain workflow YAML examples
<!-- SECTION:FINAL_SUMMARY:END -->
