# Finalization receipts

Record and reconcile finalization with receipts, mirroring the delivery-stage reconciliation pattern. Receipts are evidence of what actually happened, not claims; reconcile them against actual git and filesystem state before relying on them.

## Receipt fields

| Field | Content |
| --- | --- |
| Synchronization results | Which main specs were synchronized, the built-in post-sync comparison outcome, or the built-in no-delta path when no applicable delta specs resolved. |
| Archived change location | The archived change directory path, the absent source path under `openspec/changes/`, and the resolved archive destination. |
| Delivered contents | The delivered commit and PR carrying the implementation, the applicable synchronized main-spec updates, and the complete archived change artifacts. |
| Blockers | Exact pause or failure reason, preserved safe work, and remaining steps. |

Include the synchronization and archival fields in the final report; include delivered contents once delivery is verified.

## Resume and reconciliation

Reconcile actual state and receipts instead of blindly replaying finalization, producing duplicate archives, or replaying completed operations.

- **Already-finalized change.** The selected change directory is absent and the archived artifacts are present: reconcile against the archived artifacts and existing receipts without moving them again and without creating a duplicate archive. Treat an existing destination that the built-in procedure reports as a collision as a reconcile-first state, not a retry trigger.
- **Partial synchronization.** Some main-spec updates are applied: complete the remaining synchronization effects without replaying already-applied ones, using the receipts to distinguish them.
- **Partial archival.** Synchronization completed but the change directory is still present: rerun the archival step with the recorded preauthorization after confirming no destination collision.
- **Partially completed delivery.** Finalization is complete and delivery is partially done: finish the remaining delivery steps from the existing receipts — reusing the existing commit/push/PR identities — instead of repeating completed operations.

A partial or blocked run never claims completion. Preserve receipts across resumes and re-verify them against actual state before advancing.
