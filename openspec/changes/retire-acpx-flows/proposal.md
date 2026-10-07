# Proposal

## Why

The agreed direction is a skill-first Pi toolkit, not maintained parallel skill and acpx orchestration implementations. Once `migrate-factory-skills` is delivered, remove the old runtime surface and explicitly document the functionality and guarantees that are not replaced.

## What Changes

- **BREAKING**: Remove all five acpx flow entrypoints and the entire `flows/` implementation, shared helpers, fixtures and flow-only tests.
- **BREAKING**: Remove the acpx dependency, exported `acpx-flow` skill, flow-specific npm/TypeScript/Nix wiring, and current flow instructions/layout documentation.
- Retire the five existing OpenSpec flow capabilities through complete REMOVED deltas and `retire_capabilities: true`; do not delete their main specs by hand during implementation.
- Keep `pi-acp`, its package/build checks/documentation, existing extensions/prompts, `openspec-review`, migrated skills and unrelated tests/dependencies.
- Document the deliberate loss of acpx structured results, deterministic guards/budgets, persisted traces and finalize/all entrypoints; do not claim drop-in equivalence.
- Close flow-only GitHub issues #32, #36 and #42–44 only after retirement lands. Retain #39's review-skill work and reconcile its obsolete groom-flow scope independently.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec-groom`: Retire the acpx grooming capability; the separately migrated `orc-openspec-groom` has source-defined behavior.
- `openspec-implement`: Retire the acpx implementation capability; use the separately migrated task-group orchestration skill.
- `openspec-verify`: Retire the acpx verification capability; use the separately migrated verification/repair skill.
- `openspec-finalize`: Retire the acpx finalization contract; skill-based finalization is delivered in `orc-issue-to-pr` per #49, superseding the standalone-finalizer approach tracked by #47 (closed as not planned).
- `openspec-all`: Retire the single native acpx pipeline; no packaged full-lifecycle orchestrator exists (pipeline tracking #48 closed without delivering one), so the delivered stage skills are invoked explicitly.

## Impact

- Depends on delivery of `migrate-factory-skills`; removal does not implement the superseded acpx plans or the future lifecycle skills.
- Touches `flows/`, `skills/acpx-flow/`, `package*.json`, `tsconfig.json`, `nix/modules/pi-package.nix`, `README.md`, `AGENTS.md` and any current flow-specific terminology/documentation.
- Dependency changes require a valid lockfile, refreshed Nix npm dependency hash and full Nix checks. Keep TypeScript/tsx/Pi development dependencies needed by retained extensions/tests.
- Preserve historical archived and superseded planning and external acpx run history; do not delete user worktrees, branches, traces or global tooling.
- This is package-surface retirement, not removal of ACP integration. `nix/packages/pi-acp/` and its flake integration remain intact.
