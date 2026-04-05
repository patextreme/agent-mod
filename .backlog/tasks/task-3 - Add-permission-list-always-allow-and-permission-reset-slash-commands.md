---
id: TASK-3
title: Add /permission-list-always-allow and /permission-reset slash commands
status: Done
assignee:
  - pi
created_date: '2026-04-05 14:51'
updated_date: '2026-04-05 15:20'
labels: []
dependencies: []
documentation:
  - >-
    https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add two new slash commands to the permission extension (`extensions/permission.ts`):

1. **`/permission-list-always-allow`** — Lists all currently always-allowed command patterns that the user has approved during this session. Each entry should display the regex pattern from the matching rule so the user can see exactly what is whitelisted.

2. **`/permission-reset`** — Resets (clears) the always-allowed list so the user must re-approve commands on next use.

Both commands operate on the in-memory `alwaysAllowed` set that already exists in the extension.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /permission-list-always-allow lists every always-allowed pattern currently in the session's alwaysAllowed set, showing the regex pattern for each
- [x] #2 /permission-reset clears all entries from the alwaysAllowed set
- [x] #3 When the always-allowed set is empty, /permission-list-always-allow indicates that no commands are always-allowed
- [x] #4 Both commands are registered in the permission extension alongside existing tool_call and session_start handlers
- [x] #5 Passes format → lint → typecheck
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `permission-list-always-allow` command — lists all always-allowed rule IDs resolved to their regex patterns via PERMISSION_RULES lookup. Shows 'no commands' message when empty.
2. Add `permission-reset` command — calls alwaysAllowed.clear() and notifies user.
3. Both registered via pi.registerCommand() inside the extension factory, alongside existing tool_call and session_start handlers.
4. Verify with format → lint → typecheck.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added two slash commands to the permission extension:

- `/permission-list-always-allow` — Lists all always-allowed regex patterns from the current session. Shows "No commands are currently always-allowed" when the set is empty.
- `/permission-reset` — Clears the always-allowed set and notifies the user.

Both commands are registered via `pi.registerCommand()` inside the extension factory function, closing over the existing `alwaysAllowed` set and `PERMISSION_RULES` array. Passes format → lint → typecheck.
<!-- SECTION:FINAL_SUMMARY:END -->
