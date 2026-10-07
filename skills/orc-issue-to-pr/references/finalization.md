# Finalization contract

The delegated finalization stage of the OpenSpec route. `SKILL.md` stage contract 4 dispatches this stage between accepted verification and delivery; this document defines the contract the delegate follows. Finalization reuses the installed built-in `openspec-archive-change` procedure and its `openspec-sync-specs` dependency. No separate finalizer skill and no fresh independent sync assessor exist.

## Dependency resolution

Before dispatch, resolve `openspec-archive-change` and `openspec-sync-specs` from the invoking environment's available-skill information like the other external procedures: read their SKILL.md files and pass their absolute paths plus the explicit repository, worktree, change, and store context. If either prerequisite cannot be resolved, pause naming the missing prerequisite; do not invent a checkout or home-directory path and do not substitute another procedure. A newly provisioned worktree may not contain these skills yet.

## Invocation-scoped preauthorization

The issue-to-PR invocation constitutes explicit authorization to synchronize main specs and archive the whole change after accepted verification. Pass that preauthorization to the delegated archive procedure; do not use it to silently bypass the procedure's own prompts. The built-in warning and conflict branches still pause. Incomplete planning artifacts or unchecked tasks, synchronization conflicts, and finalization failures pause for resolution regardless of invocation authorization. Needed synchronization cannot be skipped while claiming PR readiness.

## Delegated execution

Run the built-in archive procedure for the same worktree, change, and store identity the route resolved, after accepted verification. Accept the procedure's post-sync comparison as synchronization assessment; dispatch no separate assessor. Preserve the built-in no-delta path: a change whose status resolves no applicable delta specs proceeds to archival without synchronization.

## Archival confirmation

Before any delivery dispatch, confirm actual archival for the selected target: the change directory is absent from `openspec/changes/` and present under the archived destination, and the authorized synchronized main-spec updates are in place. Failed, blocked, ambiguous, or partial finalization does not advance to delivery and does not claim completion.

## Failure handling

When the delegated procedure pauses or fails, preserve all safe work — applied synchronization, partial archival state, and the operation receipts — and surface the exact blocker. Archive failure after completed synchronization preserves the synchronization result and reports the blocker instead of starting delivery or discarding the sync.

## Delivered contents

On the OpenSpec route, the delivered commit and PR include the implementation, the applicable synchronized main-spec updates, and the complete archived change artifacts. Report finalization receipts per [finalization-receipts.md](./finalization-receipts.md).
