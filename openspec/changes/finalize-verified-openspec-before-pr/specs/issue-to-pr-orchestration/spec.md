# Spec Delta: issue-to-pr-orchestration

## MODIFIED Requirements

### Requirement: Selected implementation path
Direct execution SHALL delegate research, planning, scoped implementation and relevant checks, then independent diff/acceptance validation. OpenSpec execution SHALL select an unambiguous existing change/store and delegate groom, implement, verify and finalize sequentially, keeping `orc-openspec-verify` verification-only and owning finalization of the verified change in this skill before delivery. After grooming it SHALL separately validate structure and assess readiness; it MUST NOT create a missing change automatically.

#### Scenario: OpenSpec change is missing
- **WHEN** an OpenSpec-labeled issue lacks an unambiguous existing change
- **THEN** orchestration asks the user to supply/select one rather than generating a change or bypassing that route

#### Scenario: Grooming leaves readiness blockers
- **WHEN** grooming has zero Critical findings but readiness remains unresolved
- **THEN** orchestration separately assesses the blockers before accepting progression

#### Scenario: Accepted verification leads to finalization before delivery
- **WHEN** OpenSpec verification is accepted with zero Critical and zero Warning findings
- **THEN** orchestration delegates finalization for the same change/store in the same worktree before dispatching delivery, and the verification stage performed no synchronization or archival

### Requirement: Single-issue lifecycle limit
Completion SHALL require verified delivery, complete review/repair and passing required gates at the final head; on the OpenSpec route it SHALL additionally require confirmed finalization with synchronized main specs and complete archived change artifacts included in the delivered head. The final report SHALL identify issue, route, workspace/branch, selected change/store, PR, head, checks, findings, finalization receipts and blockers. Issue-to-PR invocation on the OpenSpec route SHALL authorize main-spec synchronization and whole-change archival after accepted verification; merging, worktree cleanup and queue selection SHALL remain separate requests outside this skill.

#### Scenario: Successful delivery stops before merge and archive
- **WHEN** the final PR head satisfies delivery, review, finalization and gate requirements
- **THEN** orchestration reports completion with finalization receipts while retaining the worktree and leaving merging and worktree removal to the user

#### Scenario: Authorization does not override finalization blockers
- **WHEN** verification is not accepted, or finalization reports incomplete artifacts/tasks, conflicts, or failures
- **THEN** orchestration pauses rather than synchronizing, archiving, or claiming PR readiness under invocation authorization alone
