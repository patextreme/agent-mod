# issue-to-pr-orchestration Specification

## Purpose

Take one explicitly selected GitHub issue through isolated implementation, verified PR delivery and delegated review/repair, retaining source routing and delivery conventions.

## Requirements

### Requirement: Explicit sticky issue routing
Orchestration SHALL delegate issue/repository resolution and reading of body, exact labels and paginated comments. The exact `openspec` label SHALL select OpenSpec execution; other labels SHALL select direct edits. Missing/ambiguous identity or unavailable labels SHALL require input. Identity/route SHALL remain sticky and material later issue changes SHALL be reconciled.

#### Scenario: Exact OpenSpec label
- **WHEN** the selected issue has the exact label `openspec`
- **THEN** orchestration uses the existing-change OpenSpec stages rather than direct implementation

#### Scenario: Similar label is not the routing label
- **WHEN** labels are available but do not contain the exact `openspec` label
- **THEN** orchestration uses direct edits rather than guessing OpenSpec routing from similar names

### Requirement: Verified issue worktree reuse or provisioning
Orchestration SHALL inspect existing worktrees, `issue-<n>` refs and matching PRs before provisioning. It SHALL reuse verified matching state or create one worktree with basename/branch `issue-<n>` from freshly fetched `origin/develop`. Active branch duplication, occupied paths, unexplained changes, ambiguous PRs and closed/merged PRs SHALL require reconciliation.

#### Scenario: Existing partial delivery
- **WHEN** matching worktree or PR state exists from an interrupted attempt
- **THEN** orchestration re-establishes evidenced completion and resumes remaining work instead of creating a duplicate worktree or PR

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

### Requirement: Source-defined delivery conventions
Delivery SHALL validate authorized contents, commit with signing and DCO, push without force to `issue-<n>`, and create/reuse its PR targeting `develop` with the issue closing reference. It SHALL reconcile current `origin/develop` and rerun affected checks when needed. Project instructions and mandatory delivery gates SHALL remain controlling; incompatible policy SHALL block rather than be weakened.

#### Scenario: Base moved before delivery
- **WHEN** the intended merge base no longer matches current `origin/develop`
- **THEN** delegated safe reconciliation and affected validation occur before delivery is accepted

### Requirement: Nested review and final-head evidence
After verified delivery, orchestration SHALL delegate `orc-pr-review-repair` to a separate nested-capable orchestrator, retaining its run history, thresholds and budget on resume. Required separate delivery gates SHALL apply to the final delivered/reviewed head, including a project-required current-head Claude gate when applicable. Stale head-bound gates MUST NOT establish completion.

#### Scenario: Review produces a fixing commit
- **WHEN** delegated review/repair changes the delivered head
- **THEN** earlier head-bound gate evidence is invalidated and applicable final-head gates are re-established

### Requirement: Single-issue lifecycle limit
Completion SHALL require verified delivery, complete review/repair and passing required gates at the final head. The final report SHALL identify issue, route, workspace/branch, selected change/store, PR, head, checks, findings and blockers. Merging and worktree cleanup SHALL remain separate requests; queue selection SHALL not be part of this skill. Spec synchronization and archival SHALL precede OpenSpec delivery but remain separate requests for direct execution.

#### Scenario: Successful OpenSpec delivery stops before merge and cleanup
- **WHEN** the final OpenSpec PR head satisfies delivery and review requirements
- **THEN** orchestration reports completion with sync acceptance or no-delta assessment and complete archive evidence, while retaining the worktree and leaving merge and cleanup untouched

#### Scenario: Successful delivery stops before merge and archive
- **WHEN** the final direct-edits PR head satisfies delivery and review requirements
- **THEN** orchestration reports completion while retaining the worktree and leaving merge, sync and archive untouched
