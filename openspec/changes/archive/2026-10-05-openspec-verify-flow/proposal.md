# Proposal

## Why

Implementation completion establishes finished tasks and passing applicable gates, not independent agreement between implementation and approved OpenSpec artifacts. A dedicated verification flow should find and resolve blocking discrepancies without conflating verification acceptance with syncing or archiving.

## What Changes

- Add the acpx flow `openspec-verify`, using the existing `openspec-verify-change` skill to independently check completeness, correctness, and coherence.
- Require an explicit active repository-local change with completed implementation tasks before verification starts.
- Separate read-only verification, constrained decision classification, read-only resolution assessment, human steering, and scoped implementation repair in fresh sessions.
- Repair CRITICAL and WARNING findings until a conclusive verification has neither severity and no missing required evidence; SUGGESTIONs may remain.
- Allow an initial verification and at most ten repair dispatches, with fresh verification after every successful repair invocation, including repair ten.
- Escalate consequential decisions before any repairs in a mixed batch; fail broken phases without automatic retries.
- Preserve unrelated edits and expose structured outcomes without syncing, archiving, committing, stashing, or rolling back.

## Capabilities

### New Capabilities

- `openspec-verify`: Independent verification and bounded resolution of blocking findings for implemented OpenSpec changes.

### Modified Capabilities

None. The existing verification skill's general archive-readiness guidance is unchanged; this flow adds its own stricter acceptance policy.

## Impact

- **Prerequisite:** `openspec-implement-flow` must land before implementation of this change. It owns the per-flow directory migration, recursive test discovery, and shared infrastructure extraction. This change does not duplicate or rewrite that work.
- Add `flows/openspec-verify/` following the migrated directory convention, reusing actual shared interfaces once available rather than prescribing unfinished exports.
- Add unit and fake-agent real-runner integration coverage, README invocation/setup documentation, and repository layout guidance. Adjust package/Nix test wiring only if the landed prerequisite still requires it.
- Explicitly load/pin `openspec-verify-change` for invocation from other workspaces; do not rename or duplicate the skill.
- Adapt the verification loop from `patextreme/ptah-libs`' OpenSpec playbook, replacing its shared-session behavior, iteration-budget edge case, and automatic sync/archive with local conventions.
- No dependency upgrades or changes to groom/implement behavior are intended.
