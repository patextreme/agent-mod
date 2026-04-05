---
id: TASK-1
title: Support always-allow in the permission extension
status: Done
assignee: []
created_date: '2026-04-05 10:49'
updated_date: '2026-04-05 11:22'
labels: []
dependencies: []
references:
  - >-
    https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an "always-allow" capability to the permission extension so that certain commands can be permanently allowed without prompting the user each time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each rule in `PERMISSION_RULES` has a unique numeric `id` (1-based running integer). The `PermissionRule` interface includes the `id` field.
- [x] #2 A `Set<number>` always-allow set is created inside the extension factory function closure. No file I/O or persistence — reset on pi restart.
- [x] #3 Unmatched commands (outside sandbox) always prompt the user with `["Yes", "No"]` — no "Always allow" option and no sentinel ID.
- [x] #4 The `ask`-rule path presents `["Yes", "Always allow", "No"]` instead of `["Yes", "No"]`.
- [x] #5 When "Always allow" is chosen, the rule's ID is added to the set and the command is allowed. Subsequent invocations matching the same rule skip the prompt entirely.
- [x] #6 Sandbox behavior unchanged: when `PI_SANDBOX=true`, unmatched commands remain auto-allowed (no change to existing behavior).
- [x] #7 The extension does not read from or write to any file as part of the always-allow feature.
- [x] #8 `npm run check && npm run typecheck` all pass with zero errors.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Single file change: `extensions/permission.ts`

### Step 1: Add `id` field to `PermissionRule`
- Add a numeric `id` field to the `PermissionRule` interface
- Number each existing rule in `PERMISSION_RULES` with running integers (1, 2, 3, …)
- No sentinel ID — unmatched commands have no `id` and are never "always allowed"

### Step 2: In-memory always-allow set
- Declare `const alwaysAllowed: Set<number> = new Set()` at the top of the extension factory function
- The set lives purely in the extension closure — no file I/O, no persistence across pi restarts
- No load/save helpers needed

### Step 3: Update `tool_call` handler logic
- After finding a matching `ask` rule → check if `rule.id` is in the `alwaysAllowed` set → skip prompt, allow immediately
- For `ask` rules not yet in the set → change UI prompt from `["Yes", "No"]` to `["Yes", "Always allow", "No"]`
- When user picks "Always allow" → add the rule's `id` to the `alwaysAllowed` set → allow the command
- Unmatched commands (outside sandbox) → always prompt with `["Yes", "No"]` (unchanged from current behavior)
- Sandbox behavior: unchanged

### Key design decisions
- **Storage**: In-memory `Set<number>` inside the extension closure — lost on pi restart, which is intentional (session-scoped allow-list)
- **Scope**: Only matched `ask` rules support "Always allow" — unmatched commands always prompt to avoid accidental YOLO mode
- **ID scheme**: Running integer starting at 1 — simple and stable
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added "always-allow" capability to the permission extension in `extensions/permission.ts`. Changes:

- Added `id: number` field to `PermissionRule` interface
- Numbered all 19 rules with running integers (1–19)
- Added in-memory `Set<number>` (`alwaysAllowed`) in the extension closure
- `ask` rules now present `["Yes", "Always allow", "No"]` options
- Choosing "Always allow" adds the rule ID to the set; subsequent matches skip the prompt
- Unmatched commands and sandbox behavior remain unchanged

All acceptance criteria met. `npm run check && npm run typecheck` pass with zero errors.
<!-- SECTION:FINAL_SUMMARY:END -->
