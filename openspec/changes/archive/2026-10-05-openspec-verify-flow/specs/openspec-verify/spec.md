# Spec Delta

## Purpose

Independently verify implemented OpenSpec changes against their approved artifacts and resolve blocking findings through bounded, human-steerable repairs without syncing or archiving.

## ADDED Requirements

### Requirement: Explicit implemented local target
The flow SHALL require an explicit active repository-local change identifier and completed implementation tasks before starting verification. It MUST reject archived, store-backed, symlinked, escaping, missing, or unusable targets without dispatching verification or repair.

#### Scenario: Completed target
- **WHEN** an explicit active local change has a usable task snapshot with all tasks complete
- **THEN** verification starts for that change in the selected repository

#### Scenario: Incomplete implementation
- **WHEN** the selected change has unchecked implementation tasks
- **THEN** the flow exits unsuccessfully with an incomplete-implementation diagnostic and dispatches no verifier or repairer

#### Scenario: Invalid target
- **WHEN** selection is omitted or resolves to an archived, store-backed, symlinked, escaping, missing, or unusable target
- **THEN** the flow fails before any agent is dispatched

### Requirement: Independent skill-based verification
The flow SHALL use the existing `openspec-verify-change` skill to check available artifacts for completeness, correctness, and coherence. Verification and resolution assessment MUST be read-only. Every agent and classification invocation MUST use a fresh session with explicit current context.

#### Scenario: Verification in another workspace
- **WHEN** the flow runs against a repository other than its package repository
- **THEN** the existing verification skill is explicitly available and the verifier inspects the selected repository and change

#### Scenario: Verification after repair
- **WHEN** a repair invocation returns normally
- **THEN** a fresh verifier checks current implementation rather than relying on the repairer's claim or prior session memory

### Requirement: Conclusive acceptance
The flow SHALL accept only a conclusive verification report with no CRITICAL or WARNING findings and no missing required evidence. SUGGESTION findings MAY remain. Explicitly missing required evidence MUST block acceptance; an incomplete or unusable report MUST fail instead of being treated as clear.

#### Scenario: Suggestions only
- **WHEN** a conclusive report contains only SUGGESTION findings and all required evidence is present
- **THEN** the flow succeeds and reports the remaining suggestions

#### Scenario: Warning despite archive-readiness prose
- **WHEN** a report contains a WARNING and describes the change as ready for archive
- **THEN** the flow treats the warning as blocking and does not accept the report

#### Scenario: Missing required evidence
- **WHEN** an otherwise usable report explicitly identifies a required check that could not be performed
- **THEN** acceptance is blocked and the missing evidence proceeds to resolution assessment

#### Scenario: Unusable report
- **WHEN** the verifier's report is truncated, incomplete, contradictory in a way that prevents classification, or otherwise unusable
- **THEN** the flow exits as failed without repair or automatic retry

### Requirement: Scoped blocking-finding repair
The flow SHALL assess CRITICAL and WARNING findings before repairing them and then verify again. Automatic repairs MUST stay within the approved design and relevant explicit authorization. The repairer MUST NOT independently clean up SUGGESTIONs or rewrite requirements/design merely to make verification pass.

#### Scenario: Mechanical discrepancy
- **WHEN** blocking findings can be resolved within the approved design
- **THEN** read-only assessment prepares scoped repairs and the repairer fixes the discrepancies and runs applicable gates

#### Scenario: Suggestion alongside warning
- **WHEN** verification reports a WARNING and an unrelated SUGGESTION
- **THEN** repairs address the warning and necessary supporting changes, not independent suggestion cleanup

### Requirement: Consequential human steering
Ambiguous requirements, design changes, destructive actions, and missing external access SHALL require explicit human steering before repair. A batch containing consequential and mechanical issues MUST await steering before any repairs. Guidance MUST retain its stated scope across fresh sessions and MUST NOT waive required verification evidence.

#### Scenario: Mixed repair batch
- **WHEN** assessment identifies both mechanical fixes and a design decision requiring human input
- **THEN** no repairs start until explicit steering addresses every escalated issue

#### Scenario: Input unavailable
- **WHEN** required steering cannot be collected because an interactive terminal is unavailable
- **THEN** the flow exits as needs_human without dispatching the pending repair

#### Scenario: Scoped authorization
- **WHEN** a human authorizes a particular resolution
- **THEN** fresh repair and assessment sessions receive relevant guidance without expanding it to unrelated decisions or tool permissions

### Requirement: Bounded repair convergence
The initial verification SHALL consume no repair budget. The flow SHALL allow at most ten repair dispatches, counting failed dispatches. Every normally returning repair MUST receive fresh verification before budget exhaustion is enforced. Blocking findings after repair ten SHALL produce limit_reached; phase failure SHALL retain its failure outcome.

#### Scenario: Tenth repair resolves findings
- **WHEN** repair ten returns normally and fresh verification is accepted
- **THEN** the flow succeeds with ten repair attempts

#### Scenario: Tenth repair leaves findings
- **WHEN** fresh verification after repair ten still identifies blocking findings
- **THEN** the flow exits as limit_reached without an eleventh repair

#### Scenario: Tenth repair crashes
- **WHEN** the tenth repair invocation fails
- **THEN** the dispatch is counted and the flow exits as failed rather than limit_reached

### Requirement: Guarded failures and observable outcomes
The flow SHALL emit changeId, outcome, repairAttempts, summary, and remaining findings or diagnostics. Outcomes SHALL be success, limit_reached, needs_human, cancelled, or failed. Unsuccessful outcomes MUST produce a nonzero CLI exit. Invocation failure, timeout, invalid decision/assessment, and cancellation MUST be handled before output routing, without automatic retries.

#### Scenario: Assessor failure
- **WHEN** assessment fails or returns an invalid resolution packet
- **THEN** the flow emits failed with diagnostics, preserves existing edits, and dispatches no repair

#### Scenario: Cancellation
- **WHEN** an active phase or human steering is cancelled
- **THEN** the flow emits cancelled and exits unsuccessfully without rolling back earlier edits

### Requirement: Verification-only lifecycle boundary
The flow MUST NOT sync specs, archive changes, commit, stash, roll back, or alter unrelated working-tree edits. Verification acceptance SHALL mean only acceptance under this flow's verification policy.

#### Scenario: Successful verification
- **WHEN** verification is accepted
- **THEN** the change remains active and unsynced by this flow, with no commit or archive action

#### Scenario: Dirty working tree
- **WHEN** the run starts with unrelated local edits and later repairs a blocking finding
- **THEN** unrelated edits remain intact regardless of the terminal outcome
