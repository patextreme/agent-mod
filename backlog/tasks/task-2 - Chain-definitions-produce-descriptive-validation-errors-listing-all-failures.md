---
id: TASK-2
title: Chain definitions produce descriptive validation errors listing all failures
status: Done
assignee: []
created_date: '2026-04-17 04:32'
updated_date: '2026-04-17 05:37'
labels:
  - refactor
dependencies: []
references:
  - >-
    https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/sandbox/package.json
  - 'https://github.com/nicobailon/pi-subagents/blob/main/package.json'
documentation:
  - AGENTS.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The chain extension currently uses imperative validation logic to validate loaded JSON chain definitions. Invalid chains produce a generic warning that doesn't indicate which fields are wrong, making debugging difficult for chain authors.

**Context:** Chain definitions are JSON files in `.pi/chains/` with fields `description` (non-empty string), `loop` (optional positive integer), and `steps` (non-empty array of objects with required `prompt` string and optional `exitCondition` string).

**Desired outcome:** Chain authors should be able to identify and fix all validation errors from the warning message alone, without reading the extension source code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A chain file with an invalid or missing `description` field produces a warning that identifies the field, its expected type (non-empty string), and the received value
- [x] #2 A chain file with an invalid `steps` field (missing, empty, or wrong type) produces a warning that identifies the field, its expected type, and the received value
- [x] #3 A chain file with an invalid `loop` field (not a positive integer) produces a warning that identifies the field, its expected type, and the received value
- [x] #4 A step with a missing or empty `prompt` field produces a warning that identifies the step index, the field, its expected type, and the received value
- [x] #5 A step with an invalid `exitCondition` field (not a string) produces a warning that identifies the step index, the field, its expected type, and the received value
- [x] #6 Each validation failure in a chain file produces an individual, descriptive warning message — verified by loading a chain with multiple invalid fields and confirming the output lists each failure separately with the field path, expected constraint, and received value
- [x] #7 Existing chain JSON files load and function identically (no behavior change for valid chains) — verified by running an existing chain end-to-end before and after changes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `zod` to `package.json` **`dependencies`** (not `devDependencies`). Per pi package conventions, runtime dependencies must be in `dependencies` — pi runs `npm install` when installing packages, which only installs `dependencies`.
2. Run `npm install` to generate updated lockfile
3. Define `chainStepSchema` and `chainDefinitionSchema` Zod schemas encoding the validation rules. Use `.strictObject()` on both schemas so unknown fields produce validation errors (prevents typos like `"descritpion"` from being silently stripped)
4. Derive `ChainDefinition` type via `z.infer` (`ChainStep` alias omitted — unused since nested type is inferred)
5. Replace `validateChainDefinition` call with `chainDefinitionSchema.safeParse(raw)` in `loadChainDefinitions`, using Zod's structured error issues for warning messages
6. Delete `validateChainDefinition` function and manual interfaces
7. Verify with `npm run check && npm run typecheck`
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Used `z.strictObject()` on both schemas so unknown fields (e.g. typos like `descritpion`) produce validation errors instead of being silently stripped.

Zod v4's `ZodIssue.path` types as `PropertyKey[]` (includes `symbol`), requiring a cast to `(string | number)[]` for `getValueAtPath`. Added the cast in `formatValidationIssues`.

Omitted standalone `ChainStep` type alias — it was unused since `ChainDefinition.steps[n]` is already fully typed through Zod inference. Biome flagged it as an unused variable.

Added `.trim()` to `description` and `prompt` schemas (`z.string().trim().min(1)`) to reject whitespace-only strings, matching the original imperative validator's `.trim() === ""` check. Without this, a chain with `"   "` as a description or prompt would pass validation — a behavioral regression from the pre-Zod code.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced imperative chain definition validation with Zod schema-based validation that reports all failures individually.

**What changed:**
- `extensions/chain.ts`: Removed the `validateChainDefinition` function (~68 lines) and manual `ChainStep`/`ChainDefinition` interfaces. Added `chainStepSchema` and `chainDefinitionSchema` Zod schemas using `strictObject()` to reject unknown fields, and `trim().min(1)` on `description` and `prompt` to reject whitespace-only strings. Added `getValueAtPath` helper and `formatValidationIssues` to convert Zod issues into descriptive warning messages including field path, expected constraint, and received value. `loadChainDefinitions` now uses `chainDefinitionSchema.safeParse()` and iterates all issues instead of returning on the first failure.
- `package.json`: Added `zod` (^3.25.28 || ^4) to `dependencies`.

**Why:** Chain authors could only see one error at a time and had to read the extension source to understand what was wrong. Now every validation issue is reported with enough context to diagnose and fix the problem from the warning alone.

**Tests:** `npm run check` (biome lint + format) and `npm run typecheck` both pass clean.

**Risks:** Zod v3/v4 compatibility range is wide. Currently resolves to v4 in the project's dependency tree. The `PropertyKey[]` cast on `issue.path` is a minor v4 type quirk that could be revisited if Zod tightens this type in a future release.

**Follow-up changes (review pass):**
- Injected a `warn` callback into `loadChainDefinitions` instead of calling `console.warn` directly, enabling warning capture for surfacing in the UI.
- Added a `resources_discover` handler to re-validate chain files on session start/reload and surface the first validation warning via `ctx.ui.setStatus("chain", ...)`.
- Fixed a bug where `resources_discover` redundantly reassigned `chainDefinitions` — commands are registered once at init and close over the original definitions, so the reloaded data was unused. The handler now calls `loadChainDefinitions` only for warning capture. Changed `chainDefinitions` from `let` to `const` accordingly.
<!-- SECTION:FINAL_SUMMARY:END -->
