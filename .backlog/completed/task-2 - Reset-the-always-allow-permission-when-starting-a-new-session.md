---
id: TASK-2
title: Reset the always-allow permission when starting a new session
status: Done
assignee:
  - pi
created_date: '2026-04-05 11:31'
updated_date: '2026-04-05 14:35'
labels: []
dependencies: []
documentation:
  - >-
    https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the permission extension, when a user chooses "always-allow", it will persist for the entire session. We want this to be per-session, so when a user starts a new session with `/new`, the permissions should be reset.
<!-- SECTION:DESCRIPTION:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `npm run format` passes (biome format --write .)
- [x] #2 `npm run lint` passes (biome lint .)
- [x] #3 `npm run typecheck` passes (tsc --noEmit)
<!-- DOD:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When a user starts a new session with `/new`, all previously granted "always-allow" permissions are reset
- [x] #2 "Always-allow" permissions only persist within the current session and do not carry over to new sessions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add a `pi.on("session_start", ...)` listener inside `permissionExtension()` that calls `alwaysAllowed.clear()`. This resets all always-allow grants when a new session starts (reason: "new", "resume", "fork", "startup", "reload"). Single change in `extensions/permission.ts`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: single `pi.on("session_start", ...)` handler calling `alwaysAllowed.clear()` in extensions/permission.ts

All DoD checks pass: format, lint, typecheck
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a `session_start` event listener in `permissionExtension()` that calls `alwaysAllowed.clear()`, resetting all always-allow grants when a new session begins. This covers all session lifecycle transitions: startup, new, resume, fork, and reload.
<!-- SECTION:FINAL_SUMMARY:END -->
