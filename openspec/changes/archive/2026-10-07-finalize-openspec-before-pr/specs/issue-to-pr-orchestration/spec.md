# Spec Delta

## MODIFIED Requirements

### Requirement: Selected implementation path
Direct execution SHALL delegate research, planning, scoped implementation and relevant checks, then independent diff/acceptance validation. OpenSpec execution SHALL select an unambiguous existing change/store and delegate groom, implement, verify and finalize sequentially before delivery. After grooming it SHALL separately validate structure and assess readiness; it MUST NOT create a missing change automatically.

#### Scenario: OpenSpec change is missing
- **WHEN** an OpenSpec-labeled issue lacks an unambiguous existing change
- **THEN** orchestration asks the user to supply/select one rather than generating a change or bypassing that route

#### Scenario: Grooming leaves readiness blockers
- **WHEN** grooming has zero Critical findings but readiness remains unresolved
- **THEN** orchestration separately assesses the blockers before accepting progression

#### Scenario: Verified OpenSpec implementation awaits finalization
- **WHEN** the selected OpenSpec implementation has accepted current verification evidence
- **THEN** orchestration requires accepted built-in synchronization or its no-delta/already-synced assessment and confirmed whole-change archival before delivery

### Requirement: Single-issue lifecycle limit
Completion SHALL require verified delivery, complete review/repair and passing required gates at the final head. The final report SHALL identify issue, route, workspace/branch, selected change/store, PR, head, checks, findings and blockers. Merging and worktree cleanup SHALL remain separate requests; queue selection SHALL not be part of this skill. Spec synchronization and archival SHALL precede OpenSpec delivery but remain separate requests for direct execution.

#### Scenario: Successful OpenSpec delivery stops before merge and cleanup
- **WHEN** the final OpenSpec PR head satisfies delivery and review requirements
- **THEN** orchestration reports completion with sync acceptance or no-delta assessment and complete archive evidence, while retaining the worktree and leaving merge and cleanup untouched

#### Scenario: Successful delivery stops before merge and archive
- **WHEN** the final direct-edits PR head satisfies delivery and review requirements
- **THEN** orchestration reports completion while retaining the worktree and leaving merge, sync and archive untouched
