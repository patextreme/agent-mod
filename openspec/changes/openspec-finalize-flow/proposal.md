# Proposal

## Why

Already-verified OpenSpec changes still require a clear, unattended path to synchronize their delta specs and archive their planning artifacts. Verification must remain separate from finalization, while archival must not race synchronization or accept an unsupported sync-success claim.

## What Changes

- Add an `openspec-finalize` acpx flow with explicit synchronization, independent sync assessment, and archive stages.
- Accept only an explicitly selected active repo-local change; invocation asserts that implementation verification has already passed.
- Synchronize every status-resolved delta, preserving unaffected main-spec content, then require a conclusive independent read-only assessment before archival.
- Perform no implementation verification, repair loop, workflow confirmations, or human steering. Ambiguity or unsafe inputs stop the run.
- Archive without performing another sync, preserving the entire change directory and rejecting destination collisions.
- Report phase-specific completion and partial failure; preserve existing and newly made edits without Git state management or rollback. Explicit reruns reassess the current active change.
- Document invocation, authorization boundaries, and recovery; leave existing verify flows and ordinary sync/archive skills unchanged.

## Capabilities

### New Capabilities

- `openspec-finalize`: Unattended finalization of already-verified active local changes through explicit spec synchronization, independent synchronization acceptance, and archival.

### Modified Capabilities

None. Existing grooming and verification behavior is unchanged.

## Impact

- New entrypoint, composition, helpers, and colocated tests under `flows/openspec-finalize/`.
- Reuse local-target and command/data helpers from `flows/shared/` where their contracts fit; do not alter verification acceptance or repair behavior.
- Update `README.md`, `AGENTS.md`, and the domain glossary to distinguish finalization, synchronization, and archival.
- Use existing acpx/Pi/OpenSpec prerequisites and recursive test discovery; no new extension or dependency is planned.
- At runtime, writes are limited to the selected delta capabilities' main specs and the selected change's archive move. Existing dirty work remains the starting state.
