# Issue-to-PR Spec Delta

## Purpose

Turn an actionable issue in the invoking GitHub repository into an isolated, verified implementation and a remotely green, ready-for-review pull request, with scoped human escalation and recoverable progress.

## ADDED Requirements

### Requirement: Canonical local-repository issue intake
The flow SHALL accept an explicit GitHub issue belonging to the invoking repository and resolve canonical repository identity before side effects. It MUST reject cross-repository, inaccessible or ambiguous targets. It SHALL snapshot the title, body and explicitly selected clarification comments; their content MUST NOT authorize execution-policy changes.

#### Scenario: Selected issue
- **WHEN** a usable issue belongs to the invoking repository
- **THEN** the flow records its canonical identity and selected request content before planning

#### Scenario: Unsupported or hostile input
- **WHEN** the issue belongs elsewhere or its text requests credential access, permission bypass or arbitrary setup commands
- **THEN** unsupported targets are rejected and issue text does not expand execution authority

### Requirement: Native isolated workspace ownership
The outer flow SHALL provision one isolated checkout from a configurable base branch resolved to a commit, with a unique working branch. All planning, implementation, commands and finalization MUST use that workspace. Caller branch, index and working files MUST remain unchanged. Worktree isolation MUST NOT be represented as security sandboxing.

#### Scenario: Parallel distinct issues
- **WHEN** two independent issues run from the same repository
- **THEN** they receive separate workspaces and branches without switching or editing the caller checkout

#### Scenario: Dirty caller checkout
- **WHEN** the caller has uncommitted work
- **THEN** that work remains untouched and is not silently imported into the committed-baseline workspace

### Requirement: Complete planning before pipeline entry
The flow SHALL create a complete active repo-local OpenSpec change from the captured request before invoking the full pipeline. It SHALL resolve reversible implementation details autonomously and escalate consequential behavior or scope ambiguity. It MUST NOT interpret structural validity or Critical-only grooming acceptance as permission to invent missing product intent.

#### Scenario: Actionable request
- **WHEN** request intent is sufficient
- **THEN** complete schema-required artifacts exist before grooming, implementation, verification and finalization begin in order

#### Scenario: Missing product intent
- **WHEN** planning requires choosing externally visible behavior not established by the request
- **THEN** the choice is escalated and dependent implementation does not proceed without a scoped answer

### Requirement: Preserved OpenSpec acceptance
The embedded pipeline SHALL retain constituent edit scopes, independent verification, synchronization assessment and guarded archival. Implementation completion alone MUST NOT authorize publication. The outer flow SHALL distinguish finalized artifacts from active changes and MUST NOT treat an archived target as valid input to an active-change entrypoint.

#### Scenario: Verification failure
- **WHEN** implementation finishes but verification is blocking or inconclusive
- **THEN** finalization and publication do not proceed on that claim

#### Scenario: Successful finalization
- **WHEN** all pipeline stages succeed
- **THEN** publication includes the implementation, archived change and synchronized main specs after applicable final-tree gates pass

### Requirement: Shared scoped escalation
The flow SHALL use shared human escalation for consequential uncertainty, unrelated failures and unexpected external edits. Interactive answers SHALL use the existing terminal pattern; asynchronous answers SHALL be correlated to persisted pending questions on a later invocation. Complete valid answers MUST authorize only their explicit scope, never waive required evidence or tool permissions.

#### Scenario: Human answers later
- **WHEN** the flow exits with pending questions and an operator later provides complete current answers
- **THEN** the same issue attempt can continue after validation without requiring the original process to remain alive

#### Scenario: Partial or stale answer
- **WHEN** an answer batch is incomplete, unknown or stale
- **THEN** no dependent repair or publication is authorized

### Requirement: Safe controller publication
The controller SHALL commit only validated attempt-owned changes, publish through normal non-force pushes and create a draft PR against the selected base branch. It SHALL verify remote identity and head around publication and preserve recoverable receipts. It MUST NOT duplicate a PR merely because a response was lost or delegate publication authority to issue prose.

#### Scenario: First publication
- **WHEN** local pipeline acceptance and final-tree gates are current
- **THEN** the controller pushes the working branch and creates a draft PR linked to the issue

#### Scenario: Uncertain publication result
- **WHEN** publication may have completed before interruption
- **THEN** continuation reconciles remote state before retrying, rather than creating duplicate commits or PRs blindly

### Requirement: Current-head CI acceptance
Success SHALL require repository-required CI checks and explicitly configured gates to be green for the latest PR commit. Missing, inaccessible, pending or indeterminate evidence MUST NOT count as green. Neither human answers nor local tests alone SHALL waive required remote checks. Accepted evidence MUST identify the evaluated PR head and base.

#### Scenario: Earlier head was green
- **WHEN** the PR advances after checks passed
- **THEN** earlier green evidence does not establish acceptance of the new head

#### Scenario: No usable required-check policy
- **WHEN** the required-check policy cannot be established
- **THEN** the flow escalates or reports an unsuccessful bounded outcome rather than assuming an empty policy is green

### Requirement: Bounded issue-scoped CI repair
The flow SHALL investigate failed required CI and automatically repair only within issue intent and approved design. Every dispatched repair SHALL consume a persisted finite budget and receive fresh local verification before normal publication. Pending CI MUST NOT trigger speculative edits. Unrelated failures, unavailable evidence and exhausted budgets SHALL escalate without claiming success.

#### Scenario: Repairable regression
- **WHEN** failed CI identifies an implementation defect within the issue's scope and budget remains
- **THEN** scoped repair, fresh verification, normal push and current-head CI reassessment occur

#### Scenario: Unrelated infrastructure failure
- **WHEN** making CI green would require unrelated changes or weakening check policy
- **THEN** the flow escalates rather than modifying policy or expanding scope autonomously

#### Scenario: Final repair succeeds
- **WHEN** the last permitted repair passes fresh verification and current-head required CI
- **THEN** the flow can succeed without an additional repair dispatch

### Requirement: Archived-result reverification
Repairs or base integration after finalization SHALL invalidate prior implementation acceptance and require fresh completeness, correctness, coherence and gate evidence against the resulting tree and preserved planning artifacts. This MUST NOT bypass archived-target rejection in existing flows, rerun archival as inferred success, or rewrite approved artifacts merely to make verification pass.

#### Scenario: CI repair after archive
- **WHEN** CI repair changes implementation after the change was archived
- **THEN** the resulting implementation is independently reverified against its archived artifacts before being published as a verified revision

### Requirement: Target-branch movement
The flow SHALL detect relevant target-branch movement, incorporate the changed target and revalidate the resulting implementation before acceptance. Conflicts or scope-changing integration SHALL escalate. Integration and waiting SHALL remain bounded; stale base evidence MUST NOT support a current success claim.

#### Scenario: Target advances during CI
- **WHEN** the target branch advances before readiness acceptance
- **THEN** the working branch incorporates it as needed and obtains fresh applicable local and remote evidence for the resulting head/base

#### Scenario: Integration conflict
- **WHEN** changed target content conflicts with the issue implementation
- **THEN** the attempt retains both sides and escalates without silently choosing a consequential resolution

### Requirement: External-head protection
Unexpected changes to the working PR branch SHALL stop autonomous publication and trigger escalation. External work MUST be preserved and MUST NOT be force-overwritten. Continued work SHALL require explicit human direction and fresh state validation.

#### Scenario: Human pushes while CI runs
- **WHEN** the remote head differs from the flow's last confirmed published head
- **THEN** the flow records the movement, preserves work and escalates before further edits or pushes

### Requirement: Durable attempt continuation
The flow SHALL persist attempt identity, captured request, baseline, workspace, pending decisions, completed effects and consumed budgets. A valid continuation SHALL preserve the attempt and cumulative limits while rechecking actual state. Materially invalid request or baseline SHALL require a fresh attempt with prior work retained. Persisted records MUST NOT imply native graph resume.

#### Scenario: Interrupted attempt continues
- **WHEN** a later invocation selects a valid prior attempt
- **THEN** it reconciles local and remote effects, preserves consumed budgets and proceeds from a safe domain phase

#### Scenario: Changed issue intent
- **WHEN** the requested continuation materially changes the captured intent
- **THEN** the flow does not silently reuse old authorizations or acceptance; a fresh attempt is required and prior evidence is retained

### Requirement: Single-writer and preserved results
Supported concurrent execution SHALL use single-host ownership keyed by canonical repository and issue, with physical-workspace protection for reuse. Overlapping same-issue writers MUST be rejected. Dirty, abandoned and uncertain workspaces SHALL be retained with recovery paths; cleanup MUST be explicit and limited to owned resources. Cross-host safety MUST NOT be claimed without shared coordination.

#### Scenario: Duplicate invocation
- **WHEN** a second participating invocation targets an owned issue or workspace
- **THEN** it fails before dispatching writers or publication

#### Scenario: Process dies
- **WHEN** termination leaves uncertain ownership or effects
- **THEN** later recovery reconciles them explicitly rather than stealing ownership or deleting work automatically

### Requirement: Ready-only-after-acceptance outcome
The PR SHALL remain draft until local verification, current-head CI, base freshness and ownership conditions are accepted. Success SHALL require confirmed ready-for-review transition. Results SHALL expose attempt identity, phase, workspace, PR, evaluated revisions, budgets and pending blockers without fabricating completion. Non-success MUST NOT exit successfully.

#### Scenario: Accepted PR
- **WHEN** all acceptance conditions hold and readiness is confirmed remotely
- **THEN** the result reports success with a ready-for-review PR and its accepted revisions

#### Scenario: Escalated CI repair
- **WHEN** required CI remains unresolved
- **THEN** the PR remains draft, the result identifies pending blockers and the invocation exits unsuccessfully
