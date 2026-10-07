# Spec Delta

## Purpose

Finalize a successfully verified OpenSpec change inside the issue-to-PR route before PR delivery by delegating to the installed built-in `openspec-archive-change` and `openspec-sync-specs` skills, so one PR carries the implementation, synchronized main specs, and complete archived change artifacts.

## ADDED Requirements

### Requirement: Delegated built-in finalization stage
The OpenSpec route SHALL run finalization as a delegated stage between accepted verification and delivery, reusing the installed built-in `openspec-archive-change` skill and its `openspec-sync-specs` dependency for the same worktree, change and store identity. Orchestration SHALL resolve these dependencies before dispatch; missing prerequisites SHALL pause with the missing prerequisite rather than inventing or substituting a procedure.

#### Scenario: Accepted verification dispatches finalization
- **WHEN** implementation verification is accepted for the routed change
- **THEN** orchestration delegates the built-in archive procedure with the same worktree, change and store identity before any delivery dispatch

#### Scenario: Finalization prerequisite is missing
- **WHEN** the built-in `openspec-archive-change` or `openspec-sync-specs` skill cannot be resolved in the invoking environment
- **THEN** orchestration pauses naming the missing prerequisite instead of inventing a path or substituting another procedure

### Requirement: Built-in assessment accepted without a separate assessor
Finalization SHALL accept the built-in archive procedure's post-sync comparison as synchronization acceptance, with no separate finalizer skill and no fresh independent sync assessor. The built-in no-delta path SHALL be preserved: a change whose status resolves no applicable delta specs proceeds to archival without synchronization.

#### Scenario: Post-sync comparison is conclusive
- **WHEN** the delegated archive procedure reports its post-sync comparison without conflicts
- **THEN** finalization accepts that comparison as synchronization assessment and does not dispatch a separate assessor

#### Scenario: Change has no applicable delta specs
- **WHEN** the selected change resolves no applicable delta specs
- **THEN** the built-in no-delta path applies and archival proceeds without synchronization

### Requirement: Invocation-scoped authorization with pause conditions
Issue-to-PR invocation SHALL constitute explicit authorization to synchronize main specs and archive the whole change after accepted verification, and that preauthorization SHALL be passed to the delegated archive procedure rather than silently bypassing its prompts. Incomplete planning artifacts or tasks, synchronization conflicts, and finalization failures SHALL still pause for resolution. Needed synchronization MUST NOT be skipped while claiming PR readiness.

#### Scenario: Preauthorization reaches the archive procedure
- **WHEN** orchestration delegates finalization after accepted verification
- **THEN** the built-in archive procedure receives the invocation's explicit sync/archive preauthorization instead of orchestration silently bypassing its prompts

#### Scenario: Incomplete planning artifacts or tasks pause finalization
- **WHEN** the delegated finalization encounters incomplete change artifacts or unchecked tasks
- **THEN** orchestration pauses before synchronization or archival instead of treating invocation as authorization to override the warnings

#### Scenario: Synchronization conflict or failure pauses
- **WHEN** delegated synchronization reports a conflict or failure
- **THEN** orchestration pauses with the blocker and preserved state instead of archiving or advancing to delivery

#### Scenario: Needed synchronization cannot be skipped for readiness
- **WHEN** applicable delta specs remain unsynchronized and finalization has not completed them
- **THEN** the route cannot present the branch as PR-ready while skipping that synchronization

### Requirement: Delivery gated on confirmed archival
Delivery SHALL NOT begin until actual archival is confirmed for the selected target and the authorized synchronized main-spec updates are in place. Failed, blocked, ambiguous, or partial finalization SHALL NOT advance to delivery or claim completion; safe work and operation receipts SHALL be preserved and blockers surfaced.

#### Scenario: Unconfirmed archival blocks delivery
- **WHEN** the delegated archive reports success but source absence and archived presence are not both confirmed
- **THEN** orchestration does not dispatch delivery and instead surfaces the unconfirmed state with evidence

#### Scenario: Archive failure preserves work
- **WHEN** archival fails after synchronization completed
- **THEN** the synchronization result and other safe work are preserved, delivery does not start, and the exact blocker is reported

### Requirement: Delivered OpenSpec PR contents and receipts
On the OpenSpec route, the delivered commit and PR SHALL include the implementation, applicable synchronized main-spec updates, and the complete archived change artifacts. The final report SHALL describe finalization outcomes with accurate receipts covering synchronization results, the archived change location, and delivered contents.

#### Scenario: Delivered head carries all finalization contents
- **WHEN** delivery is accepted on the OpenSpec route
- **THEN** the delivered commit and PR contain the implementation, the applicable synchronized main-spec updates, and the complete archived change artifacts

#### Scenario: Report reflects finalization outcomes
- **WHEN** orchestration reports completion
- **THEN** the report includes finalization receipts identifying what was synchronized, where the change was archived, and what the delivered head contains

### Requirement: Archived-evidence review sources
PR review/repair SHALL receive the archived change location and the relevant main specs and SHALL load archived planning artifacts as requirements evidence alongside the originating issue. Archival MUST NOT make requirements unavailable or exempt repairs from validation.

#### Scenario: Archived planning evidence is loaded for review
- **WHEN** review/repair is prepared after finalization archived the change
- **THEN** the delegate receives the archived change location and relevant main specs and treats the archived planning artifacts as requirements evidence

### Requirement: Archived-scoped repair boundaries
In-scope repairs SHALL keep the change archived. Behavior-changing repairs SHALL check code, archived artifacts, and main specs together, update affected documents, and rerun affected validation before final-head acceptance; they MUST NOT reopen or rearchive the change or rerun the whole lifecycle for code-only corrections. New requirements or consequential design changes SHALL require user authorization.

#### Scenario: In-scope repair stays archived
- **WHEN** review/repair corrects an in-scope finding that does not change behavior
- **THEN** the change remains archived and the correction proceeds without reopening, rearchiving, or restarting the lifecycle

#### Scenario: Behavior-changing repair checks all sources together
- **WHEN** an authorized repair changes behavior
- **THEN** code, archived planning artifacts, and main specs are checked together, affected documents are updated, and affected validation is rerun before final-head acceptance

#### Scenario: New intent requires authorization
- **WHEN** a finding implies new requirements or a consequential design change beyond the approved scope
- **THEN** review/repair requests user authorization instead of editing the change's intent autonomously

### Requirement: Idempotent finalization resume
Resume and reconciliation SHALL cover already-finalized changes, partial synchronization, partial archival, and partially completed delivery. Orchestration SHALL reconcile actual state and receipts rather than blindly replaying finalization, producing duplicate archives, or replaying completed operations.

#### Scenario: Already-finalized change is not re-archived
- **WHEN** resume finds the selected change already archived from an earlier finalization
- **THEN** orchestration reconciles against the archived artifacts without moving them again or creating a duplicate archive

#### Scenario: Partial synchronization is completed idempotently
- **WHEN** resume finds synchronization partially applied
- **THEN** remaining effects are completed without replaying already-applied effects

#### Scenario: Partial delivery is reconciled without replay
- **WHEN** resume finds finalization complete but delivery partially completed
- **THEN** orchestration finishes the remaining delivery steps using existing receipts instead of repeating completed operations
