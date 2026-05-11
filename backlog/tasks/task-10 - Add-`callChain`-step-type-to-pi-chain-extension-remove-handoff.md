---
id: TASK-10
title: 'Add `callChain` step type to pi-chain extension, remove handoff'
status: Done
assignee:
  - GLM
created_date: '2026-05-10 18:22'
updated_date: '2026-05-11 04:55'
labels:
  - chain-extension
  - feature
dependencies: []
documentation:
  - extensions/chain/src/schema.ts
  - extensions/chain/src/execution.ts
  - extensions/chain/src/index.ts
  - .pi/chains/backlog-execute.yaml
  - .pi/chains/backlog-verify.yaml
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Summary

Add a `callChain` step type to the pi-chain extension, enabling chains to invoke other chains as subroutines (composable building blocks). **Remove** the existing `handoffTarget`/`handoffExitPrompt` mechanism entirely (no deprecation period, no backward compatibility).

## Design Decisions

### callChain step schema
- `type: "callChain"` — discriminated union member alongside `prompt` and `exitPrompt`
- `name: string` — target chain name (required, min 1 char)
- `argument?: string` — overrides `$ARGUMENTS` in the child chain (optional; default empty string)

### Context isolation
- Save parent chain's root leaf ID before executing the child chain
- After the child chain completes, reset conversation tree back to the parent leaf
- This ensures each `callChain` step starts fresh, with no pollution from prior child execution

### Scoped exit state
- Exit state (`isExitToolCalled`) is saved before the child chain runs and restored after it returns
- A child chain's `exitPrompt` or `chain_exit` call does NOT propagate to the parent

### Nesting depth limit
- Maximum nesting depth of 10 levels
- If exceeded, emit an error notification and skip the step

### Removal of handoff
- `handoffTarget` and `handoffExitPrompt` are **removed** from the chain definition schema entirely
- All handoff-related code in `execution.ts` (the final block after the step/loop execution) is deleted
- Existing `.pi/chains/*.yaml` files that use `handoffTarget` must be updated to remove it and use `callChain` steps or standalone chains instead

## Files to modify

### `extensions/chain/src/schema.ts`
- Add `chainStepCallChainSchema` (z.strictObject with type, name, argument)
- Add it to the `chainStepSchema` discriminated union
- Remove `handoffTarget` and `handoffExitPrompt` fields from `chainDefinitionSchema`
- Remove the `.refine()` validation that checks `handoffExitPrompt` requires `handoffTarget`

### `extensions/chain/src/execution.ts`
- Add `options?: { depth?: number }` parameter to `executeChain`
- Add `callChain` step handling in the step execution loop:
  - Save parent leaf ID
  - Check depth ≤ 10
  - Look up target chain in `chainDefinitions`
  - Save & restore `isExitToolCalled` around child execution
  - Reset context to parent leaf after child returns
- Remove the entire handoff block (the final `if (handoffTarget ...)` logic after the step/loop)
- Remove the `disableTool(pi, "chain_exit");` / `state.isExitToolCalled = false` cleanup that existed only for handoff evaluation

### `extensions/chain/src/loader.ts`
- No changes needed (no deprecation warning logic exists here currently)

### `extensions/chain/src/index.ts`
- No changes needed — `executeChain` default parameter handles top-level vs sub-call

### `.pi/chains/backlog-execute.yaml`
- Remove `handoffTarget: backlog-verify` — this chain becomes standalone

### `.pi/chains/backlog-verify.yaml`
- Remove `handoffTarget: backlog-finalize` — this chain becomes standalone

### `nix/modules/pi-package.nix`
- No changes needed — all modifications are to existing files already listed

## Existing chain definitions for reference

- `.pi/chains/backlog-execute.yaml` — executes a task (currently hands off to `backlog-verify`)
- `.pi/chains/backlog-verify.yaml` — verifies codebase against task (currently hands off to `backlog-finalize`)
- `.pi/chains/backlog-finalize.yaml` — reviews task record finalization
- `.pi/chains/backlog-groom.yaml` — grooms backlog items (loop + exitPrompt, no handoff)
- `.pi/chains/greeting.yaml` — simple greeting chain

After this change, `handoffTarget` is removed from all chain definitions. Chains that previously relied on handoff either become standalone or are composed via a parent orchestration chain using `callChain` steps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 callChain step type is parsed and validated in the schema
- [x] #2 A chain with callChain steps invokes the target chain as a subroutine
- [x] #3 Context is reset to parent leaf after child chain returns
- [x] #4 A child chain's exit does not propagate to the parent chain
- [x] #5 Nesting deeper than 10 levels produces an error notification and skips the step
- [x] #6 Omitting argument defaults to empty string (not inherited from parent)
- [x] #7 handoffTarget and handoffExitPrompt are removed from the chain definition schema
- [x] #8 All handoff-related code is removed from execution.ts (no backward compat path)
- [x] #9 Existing .pi/chains/*.yaml files no longer contain handoffTarget
- [x] #10 All existing checks pass: npm run check, npm run typecheck, nix flake check
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Overview
Add `callChain` step type to chain extension schema and execution engine. Remove `handoffTarget`/`handoffExitPrompt` entirely.

### Files to change (5 modified, 0 created)

1. **`extensions/chain/src/schema.ts`** — Add `chainStepCallChainSchema`, add to discriminated union; remove `handoffTarget`, `handoffExitPrompt` from `chainDefinitionSchema`; remove `.refine()`
2. **`extensions/chain/src/execution.ts`** — Add `options?: { depth?: number }` param; add `callChain` step handler (save/restore leaf, save/restore exit state, depth check ≤ 10, child lookup); update steps `.map()` for callChain; remove entire handoff block
3. **`.pi/chains/backlog-execute.yaml`** — Remove `handoffTarget: backlog-verify`
4. **`.pi/chains/backlog-verify.yaml`** — Remove `handoffTarget: backlog-finalize`
5. **No changes**: `index.ts`, `loader.ts`, `nix/modules/pi-package.nix`

### Execution order
1. schema.ts → 2. execution.ts → 3. yaml files → 4. verify (npm run check, npm run typecheck, nix flake check)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
schema.ts: Added chainStepCallChainSchema, added to discriminated union. Removed handoffTarget/handoffExitPrompt from chainDefinitionSchema, removed .refine().

execution.ts: Added options?: { depth?: number } param. Added callChain step handler with depth check (≤10), child chain lookup, save/restore isExitToolCalled, context reset to parent leaf. Updated steps .map() for callChain. Removed entire handoff block (~30 lines).

YAML files: Removed handoffTarget from backlog-execute.yaml and backlog-verify.yaml.

Verification: npm run check ✓, npm run typecheck ✓, nix flake check ✓ (all 6 derivations built successfully).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary

Added `callChain` step type to the pi-chain extension, enabling chains to invoke other chains as subroutines with full context isolation, scoped exit state, and a nesting depth limit of 10. Removed the `handoffTarget`/`handoffExitPrompt` mechanism entirely with no backward compatibility.

### What changed

- **`extensions/chain/src/schema.ts`** — Added `chainStepCallChainSchema` (type: "callChain", name, optional argument) to the discriminated union. Removed `handoffTarget` and `handoffExitPrompt` from `chainDefinitionSchema`. Removed the `.refine()` validator.
- **`extensions/chain/src/execution.ts`** — Added `options?: { depth?: number }` parameter to `executeChain`. Added callChain step handler: saves/restores parent leaf ID, checks depth ≤ 10 (notify + skip if exceeded), looks up target chain, saves/restores `isExitToolCalled` around child execution, resets context after child returns. Removed the entire 30-line handoff block. Updated steps `.map()` to handle all three step types.
- **`.pi/chains/backlog-execute.yaml`** — Removed `handoffTarget: backlog-verify`
- **`.pi/chains/backlog-verify.yaml`** — Removed `handoffTarget: backlog-finalize`

### Why

Chains are now composable building blocks via `callChain` instead of opaque one-way handoffs. This provides clearer control flow, context isolation, and the ability to build orchestrator chains.

### Tests

- `npm run check` ✓ (biome)
- `npm run typecheck` ✓ (tsc --noEmit)
- `nix flake check` ✓ (all 6 derivations)

### Risks / Follow-ups

- No existing chain files used `callChain` yet — that's opt-in. The backlog chains (execute → verify → finalize) are now standalone and would need an orchestrator chain to compose them again.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Passes npm run format
- [x] #2 Passes npm run lint
- [x] #3 Passes npm run typecheck
- [x] #4 Passes nix flake check
<!-- DOD:END -->
