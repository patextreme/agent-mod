---
id: TASK-9
title: Port pi-tps extension to agent-mod
status: Done
assignee:
  - pat
created_date: '2026-04-29 09:40'
updated_date: '2026-04-29 11:13'
labels:
  - extension
  - nix
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the pi-tps (tokens-per-second tracker) extension from github.com/monotykamary/pi-tps into this repo as a single-file extension, matching the existing permission extension style.

## Context

The pi-tps extension tracks LLM generation speed (tokens/second), time-to-first-token (TTFT), detects inference stalls, and persists structured telemetry per turn. It also provides a `tps-export` command to export telemetry as JSONL.

Source: https://github.com/monotykamary/pi-tps

## What to do

1. Create `extensions/pi-tps/index.ts` — port the main extension file (~532 lines) from the upstream repo.
   - Remove the local event type definitions (`TurnStartEvent`, `TurnEndEvent`, `MessageStartEvent`, `MessageUpdateEvent`, `MessageEndEvent`, `SessionTreeEvent`). These are all exported from `@mariozechner/pi-coding-agent` directly.
   - Update imports to use the properly typed events from `@mariozechner/pi-coding-agent`.
   - The `AssistantMessage` type from `@mariozechner/pi-ai` is already available in `node_modules`.
   - Reformat with Biome after porting (2-space indent).
   - The core logic (timing, stall detection, rehydration, export command) stays the same.

2. Update `nix/modules/pi-package.nix`:
   - Add a `pi-tps` derivation following the same pattern as `pi-permission` (single `index.ts` file copy).
   - Add it to both `packages` and `checks`.

3. Verify:
   - `npm run format` passes
   - `npm run lint` passes
   - `npm run typecheck` passes
   - `nix flake check` passes

## Key conventions

- Single-file extension (no package.json) — matches `extensions/permission/` pattern
- Biome with 2-space indent for formatting
- tsconfig includes `extensions/**/*.ts`, no build step
- Nix build: see the `pi-permission` derivation for the exact pattern to follow

## Reference files

- Existing single-file extension: `extensions/permission/index.ts`
- Existing multi-file extension (for comparison): `extensions/chain/src/`
- Nix build: `nix/modules/pi-package.nix`
- Upstream source: https://github.com/monotykamary/pi-tps/blob/main/extensions/pi-tps/index.ts
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 extensions/pi-tps/index.ts exists and contains the ported extension
- [x] #2 Local event type definitions removed in favor of @mariozechner/pi-coding-agent exports
- [x] #3 nix/modules/pi-package.nix includes a pi-tps derivation in packages and checks
- [x] #4 npm run format passes with no changes
- [x] #5 npm run lint passes with no warnings
- [x] #6 npm run typecheck passes with no errors
- [x] #7 nix flake check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan: Port pi-tps extension to agent-mod

### Step 1: Create `extensions/pi-tps/index.ts`
- Port upstream file, removing 6 local event type definitions (TurnStartEvent, TurnEndEvent, MessageStartEvent, MessageUpdateEvent, MessageEndEvent, SessionTreeEvent)
- Add event types to import from @mariozechner/pi-coding-agent
- Keep all core logic unchanged (timing, stall detection, rehydration, export command)
- Reformat with Biome (2-space indent)

### Step 2: Update `nix/modules/pi-package.nix`
- Add pi-tps derivation following pi-permission pattern (single index.ts copy)
- Add to both packages and checks

### Step 3: Verify
- npm run format, npm run lint, npm run typecheck, nix flake check
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Step 1 complete: created extensions/pi-tps/index.ts with ported extension, removed 6 local event type definitions, updated imports to use @mariozechner/pi-coding-agent exports

Step 2 complete: added pi-tps derivation to nix/modules/pi-package.nix in both packages and checks

Starting Step 3: verification (format, lint, typecheck, nix flake check)

Step 3 complete: all verification passes

- npm run format: passes (biome format, no changes needed)

- npm run lint: passes (fixed node: import protocol, import ordering, template literal)

- npm run typecheck: passes (removed local event type defs; TS infers event types from pi.on() overloads)

- nix flake check: passes (added git add for nix store visibility, all 6 checks pass)

Discovery: MessageEndEvent, MessageStartEvent, MessageUpdateEvent are NOT exported from @mariozechner/pi-coding-agent main entry (only in core/extensions subpath). Resolution: removed all explicit event type annotations and let TypeScript infer from the on() overloads. This achieves the same goal (no local event type definitions) while remaining type-safe.

All 7 acceptance criteria verified. Ready for finalization.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ported pi-tps (tokens-per-second tracker) extension from github.com/monotykamary/pi-tps into agent-mod as a single-file extension.

## Changes
- **extensions/pi-tps/index.ts**: New file — ported extension with all core logic preserved (TPS tracking, TTFT, stall detection, rehydration, tps-export command). Removed all 6 local event type definitions; TypeScript now infers event types from pi.on() overloads. Applied Biome formatting (2-space indent, node: import protocol, import ordering, template literals).
- **nix/modules/pi-package.nix**: Added pi-tps derivation (single index.ts copy pattern, matching pi-permission) in both packages and checks.

## Discovery
MessageEndEvent, MessageStartEvent, MessageUpdateEvent are not exported from the @mariozechner/pi-coding-agent main entry (only in the core/extensions subpath). Instead of keeping local type definitions, removed explicit type annotations and let TypeScript infer from the overloaded pi.on() signatures — achieving the same goal with full type safety.

## Verification
- npm run format ✓
- npm run lint ✓
- npm run typecheck ✓
- nix flake check ✓
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Passes npm run format
- [x] #2 Passes npm run lint
- [x] #3 Passes npm run typecheck
<!-- DOD:END -->
