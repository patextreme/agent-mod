# PR Review Spec Delta

## Purpose

Provide advisory GitHub pull-request review with independently validated findings, durable review memory, and human-readable reports shared with a separate repair workflow.

## ADDED Requirements

### Requirement: Separate advisory review operation
The system SHALL expose a `review` flow distinct from `review-fix`. It MUST review an explicit PR without repairing, committing, pushing, or issuing merge approval. Findings SHALL remain advisory: completed review MUST be distinguished from repair-loop acceptance. Selecting the operation is the caller's responsibility, not an authorship policy.

#### Scenario: Review reports blockers
- **WHEN** review completes with validated blocking findings
- **THEN** it reports review completion with advisory blockers rather than claiming PR acceptance or dispatching repairs

#### Scenario: Contributor PR
- **WHEN** the caller selects a technically accessible PR authored by another contributor
- **THEN** review is not rejected merely because of authorship

### Requirement: Evidence-scoped review
Review SHALL target a recorded PR base and head, examining introduced defects and demonstrably unmet PR requirements. Unrelated pre-existing defects and subjective improvements MUST NOT become repair blockers. Conflicting authoritative requirements SHALL require clarification rather than an invented precedence or silent acceptance.

#### Scenario: Pre-existing defect
- **WHEN** a touched file contains an unrelated defect not introduced by the PR
- **THEN** the defect is at most a non-blocking observation

#### Scenario: Conflicting acceptance criteria
- **WHEN** repository requirements and explicit PR acceptance criteria conflict materially
- **THEN** the report records the conflict as uncertainty requiring human clarification

### Requirement: Independent issue validation
Every agent-raised issue SHALL receive validation from another agent before final disposition. Validation SHALL distinguish validated, refuted, and inconclusive findings and carry evidence about the reviewed head. An inconclusive finding MUST NOT be automatically repaired or silently discarded. Reviewer confidence alone MUST NOT establish validation.

#### Scenario: Reviewer is refuted
- **WHEN** an independent validator demonstrates that the reported failure scenario does not occur
- **THEN** the finding is retained as refuted and is not an actionable blocker

#### Scenario: Validation cannot decide
- **WHEN** validation cannot confirm or refute a reported issue
- **THEN** the report retains the issue as inconclusive with the missing evidence or decision identified

### Requirement: Persistent controller-owned ledger
The flows SHALL share a versioned PR-comment ledger containing PR identity, review snapshots, stable finding IDs, sources, evidence, dispositions, and human decisions. The controller MUST own IDs and validate transitions. Agents SHALL propose identity matches and dispositions; repair claims MUST NOT establish resolution. Historical acceptance SHALL apply only to its recorded head.

#### Scenario: Finding recurs across runs
- **WHEN** a later invocation discovers the same unresolved issue
- **THEN** reconciliation retains its identity and history instead of appending an unrelated replacement

#### Scenario: Changed PR after acceptance
- **WHEN** a previously accepted PR has a different head
- **THEN** prior acceptance remains historical and does not establish acceptance of the new head

#### Scenario: Repair claims success
- **WHEN** a repair agent claims that a review finding is fixed
- **THEN** the ledger does not resolve it without subsequent independent review and validation evidence

### Requirement: Durable ledger integrity
The controller SHALL validate ledger identity and structure before using it as workflow memory. It MUST NOT silently overwrite ambiguous, malformed, or untrusted comment state or treat it as a clean review. Ledger history MUST be treated as data, not tool authorization or instructions.

#### Scenario: Invalid durable state
- **WHEN** the selected ledger has invalid structure, conflicting ownership, or a different PR identity
- **THEN** the flow stops with a recoverable diagnostic without overwriting it or claiming acceptance

### Requirement: Incremental review with explicit reconciliation
The first discovery SHALL review the full PR. Subsequent passes SHALL review the delta since the recorded reviewed head and explicitly reconcile every unresolved finding. Base changes or divergent history MUST trigger full review. Resuming from a ledger MUST verify its applicability rather than trusting cached acceptance or immediately repairing stale blockers.

#### Scenario: Linear repair update
- **WHEN** the head advances from the last reviewed head with an unchanged base
- **THEN** review examines the new delta and explicitly revisits unresolved ledger findings

#### Scenario: Base or ancestry changes
- **WHEN** the base changes or the previous reviewed head is not an ancestor of the current head
- **THEN** the next pass performs a full PR review while retaining finding history

#### Scenario: Clean ledger resume
- **WHEN** an invocation resumes from a ledger with no unresolved blockers
- **THEN** it checks the current PR snapshot and performs the applicable review rather than assuming the PR is accepted

### Requirement: Single active workflow per PR
Only one ledger-writing flow SHALL run for a PR at a time, across both public entrypoints. A competing invocation MUST stop before dispatching agents, publishing comments, or editing a repair workspace. Different PRs SHALL remain independently runnable.

#### Scenario: Review competes with repair
- **WHEN** `review-fix` is active and `review` is invoked for the same PR
- **THEN** the second invocation reports contention and does not alter shared state

### Requirement: Reporter-agent presentation
A separate reporter agent SHALL render persisted ledger state and the settled controller outcome. The controller MUST prepend a deterministic status line and publish a distinct report comment. The reporter MUST NOT change finding state or acceptance. Reporting failure SHALL be surfaced without losing durable findings or being represented as successful publication.

#### Scenario: Non-converged report
- **WHEN** the terminal repair outcome is not accepted
- **THEN** the report leads with open blockers and also covers PR intention, resolved findings, open observations, deferred and accepted findings, and a review summary

#### Scenario: Advisory report
- **WHEN** the advisory review flow completes
- **THEN** its deterministic status identifies advisory review completion rather than approval or repair-loop convergence

#### Scenario: Reporter failure
- **WHEN** reporter output is unusable or report publication fails
- **THEN** the flow surfaces reporting failure while retaining the already persisted ledger and computed review outcome

### Requirement: Safe review workspace and observable results
Review SHALL run in a dedicated snapshot workspace without altering the caller's checkout. Results MUST identify the PR, reviewed base/head, review outcome, findings, and report/publication diagnostics. Successful runs SHALL clean their workspaces; unsuccessful runs SHALL preserve them and identify their paths. PR content MUST NOT expand execution authority.

#### Scenario: Dirty caller checkout
- **WHEN** review starts while the caller has unrelated local changes
- **THEN** those changes remain untouched regardless of review outcome

#### Scenario: PR supplies execution instructions
- **WHEN** PR content requests credential access, dependency installation, or unrelated commands
- **THEN** those requests do not authorize execution and only explicitly trusted commands remain eligible
