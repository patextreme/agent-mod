# Proposal

## Why

The `orc-issue-to-pr` OpenSpec route currently delivers a PR containing only the implementation, then explicitly leaves OpenSpec spec syncing and change archiving to separate requests. OpenSpec PRs therefore cannot carry their synchronized main specs or archived planning artifacts, so requirements evidence is split across the repository history and the review/repair stage has no planning artifacts to check against. Issue #49 asks for finalization inside the same orchestrated run.

## What Changes

- Add a delegated **finalize** stage to the `orc-issue-to-pr` OpenSpec route between **Verify** and **Deliver**; `orc-openspec-verify` remains verification-only.
- Finalization reuses the installed built-in `openspec-archive-change` skill and its `openspec-sync-specs` dependency, including the archive procedure's post-sync comparison and its built-in no-delta path. No separate finalizer skill and no fresh independent sync assessor are introduced.
- Issue-to-PR invocation explicitly authorizes main-spec synchronization and whole-change archival after accepted verification; the preauthorization is passed to the delegated archive procedure rather than silently bypassing its prompts. Incomplete artifacts/tasks, sync conflicts, and failures still pause; needed synchronization cannot be skipped while claiming PR readiness.
- Delivery on the OpenSpec route includes the implementation, applicable synchronized main-spec updates, and the complete archived change artifacts, with accurate finalization receipts in the final report.
- PR review/repair receives the archived change location and relevant main specs: in-scope repairs keep the change archived; behavior-changing repairs check code, archived artifacts, and main specs together and update affected documents/validation before final-head acceptance; new intent requires user authorization.
- Resume/reconciliation covers already-finalized changes, partial sync/archive, and partial delivery without duplicate moves or replayed completed operations.
- The direct-edits route and existing signing, delivery, review/repair, and final-head-gate policies remain unchanged. Merging and worktree removal remain user actions.

## Capabilities

### New Capabilities

- `openspec-pr-finalization`: Pre-delivery finalization of a successfully verified OpenSpec change inside the issue-to-PR route — delegated built-in sync/archive execution, invocation-scoped authorization with pause conditions, delivery gating on confirmed archival, archived-evidence review and repair, delivered PR contents and receipts, and idempotent resume/reconciliation.

### Modified Capabilities

- `issue-to-pr-orchestration`: "Selected implementation path" now sequences finalize after verify on the OpenSpec route (verify stays verification-only). "Single-issue lifecycle limit" now scopes sync/archive authorization to the OpenSpec-route invocation, requires confirmed finalization for OpenSpec-route completion, and leaves only merging and worktree removal as separate requests.

## Impact

- `skills/orc-issue-to-pr/SKILL.md` and `skills/orc-issue-to-pr/references/pseudocode.md` gain the finalize stage, authorization language, and dependency resolution for the built-in archive/sync skills; new bundled reference documents cover the finalization procedure and its receipts/resume handling.
- `skills/orc-pr-review-repair/SKILL.md` (and its references where they describe preparation/repair sources) gains archived-change intent handling.
- `scripts/factory-skills.test.mjs` gains the new reference files in its fixture maps plus model-free contract fixtures for the required finalization scenarios, within the packaging-validation boundary.
- `README.md` toolkit documentation and stage/lifecycle boundaries updated for the finalize stage.
- No changes to flows, extensions, Nix packages, or base-branch/delivery semantics.
