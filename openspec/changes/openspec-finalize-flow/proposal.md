# Proposal

## Why

Already-verified OpenSpec changes still require a clear, unattended path to synchronize their delta specs and archive their planning artifacts. Users also need one invocation to groom, implement, verify, and finalize a change without manually chaining flows. Verification must remain separate from finalization, while archival must not race synchronization or accept an unsupported sync-success claim.

## What Changes

- Add an `openspec-finalize` acpx flow with explicit synchronization, independent sync assessment, and archive stages.
- Add an `openspec-all` acpx flow composing `groom → implement → verify → finalize` for the same explicitly selected active repo-local change, advancing only after each stage succeeds.
- Preserve the constituent flows' acceptance policies, separate repair budgets, and human escalation. Escalations remain visible and actionable during the single invocation; unsuccessful outcomes stop the pipeline before later stages.
- Keep both new flows and the existing constituent flows independently invocable.
- Accept only an explicitly selected active repo-local change; standalone finalization asserts that implementation verification has already passed, while `openspec-all` reaches finalization only after verification succeeds.
- Synchronize every status-resolved delta, preserving unaffected main-spec content, then require a conclusive independent read-only assessment before archival.
- The finalization stage performs no implementation verification, repair loop, workflow confirmations, or human steering. Ambiguity or unsafe inputs stop finalization; this does not suppress escalation in earlier `openspec-all` stages.
- Archive without performing another sync, preserving the entire change directory and rejecting destination collisions.
- Report phase-specific completion and partial failure; preserve existing and newly made edits without Git state management or rollback. Explicit reruns reassess the current active change.
- Document invocation, authorization boundaries, and recovery; leave existing verify flows and ordinary sync/archive skills unchanged.

## Capabilities

### New Capabilities

- `openspec-finalize`: Unattended finalization of already-verified active local changes through explicit spec synchronization, independent synchronization acceptance, and archival.
- `openspec-all`: Single-invocation orchestration of grooming, implementation, verification, and finalization with transparent constituent-stage escalation and stop-on-unsuccessful behavior.

### Modified Capabilities

None. Existing grooming and verification behavior is unchanged.

## Impact

- New entrypoint, composition, helpers, and colocated tests under `flows/openspec-finalize/`, plus orchestration and integration tests under `flows/openspec-all/`.
- Reuse local-target and command/data helpers from `flows/shared/` where their contracts fit; do not alter verification acceptance or repair behavior.
- Update `README.md`, `AGENTS.md`, and the domain glossary to distinguish finalization, synchronization, and archival.
- Use existing acpx/Pi/OpenSpec prerequisites and recursive test discovery; no new extension or dependency is planned.
- During finalization, writes are limited to the selected delta capabilities' main specs and the selected change's archive move. Earlier `openspec-all` stages retain their existing authorized planning and implementation edit scopes. Existing dirty work remains the starting state.
