# PR Review Fix Spec Delta

## Purpose

Repair validated pull-request blockers through bounded, human-steered work, independently re-review published changes, and determine acceptance against the exact head's repository CI.

## ADDED Requirements

### Requirement: Explicit repair entrypoint and publication authority
The system SHALL expose `review-fix` as a separate flow reusing shared review logic. Invocation SHALL authorize scoped local repair; push authority MUST be explicit and technically available before repair starts. Missing push authority SHALL be a flow error, not a local-only success. PR authorship MUST NOT determine eligibility. Comment publication SHALL be separately authorized.

#### Scenario: Missing push permission
- **WHEN** the caller invokes repair without push authorization or usable access
- **THEN** the flow fails before dispatching a repair agent

#### Scenario: Caller-selected contributor PR
- **WHEN** the caller explicitly selects an accessible contributor PR and grants repair/push authority
- **THEN** the flow does not reject it merely because another user authored it

### Requirement: Scoped assessed repair
The flow SHALL assess validated blocking review findings and failed CI before repair. Repairs MUST address assessed blockers and necessary supporting changes, batched by root cause where practical. Unrelated observations, refuted findings, and inconclusive findings MUST NOT be autonomously repaired. The repairer MUST NOT rewrite requirements or CI policy to manufacture acceptance.

#### Scenario: Blocker and unrelated observation
- **WHEN** review raises a validated defect and an unrelated style observation
- **THEN** repair addresses the defect without independently cleaning up the observation

#### Scenario: Inconclusive issue
- **WHEN** independent validation cannot decide whether an issue is real
- **THEN** the flow requests disposition instead of dispatching an automatic fix for that issue

### Requirement: Consequential decisions and risk acceptance
Consequential repairs and conflicting requirements SHALL require explicit human decisions. A mixed batch MUST wait for all required decisions before editing. Decisions SHALL persist with scope and rationale. Explicit human acceptance of a review risk SHALL remove that finding from the blocking set; deferral alone MUST NOT. Human decisions MUST NOT waive failing CI.

#### Scenario: Consequential batch
- **WHEN** assessment proposes a public-contract, dependency, or security-policy change alongside mechanical repairs
- **THEN** no batch repair begins until the consequential decisions are explicitly answered

#### Scenario: Accepted versus deferred risk
- **WHEN** a human accepts a validated review risk with rationale but merely defers another blocker
- **THEN** acceptance excludes the accepted risk from blockers and retains the deferred blocker

#### Scenario: Headless decision needed
- **WHEN** a required decision cannot be collected interactively and no explicit answer is supplied
- **THEN** the flow persists needs-decision state and terminates with a needs-human outcome without guessing

### Requirement: CI-backed commit-specific acceptance
The controller SHALL derive repair acceptance only when the current published head equals the reviewed head, repository-configured required CI is green for that head, no unresolved unwaived validated review blockers remain, and no unresolved human-required uncertainty remains. Agent or reporter claims MUST NOT override these conditions. Acceptance MUST NOT mean merge approval.

#### Scenario: Review clean but CI red
- **WHEN** no review blockers remain but required CI fails for the current head
- **THEN** the controller does not accept the PR

#### Scenario: Stale green checks
- **WHEN** CI passes for an older head or the remote head moves after review
- **THEN** the controller does not use that evidence to accept the new head

#### Scenario: Pending or unknown CI
- **WHEN** required CI is pending, unavailable, or cannot be reliably determined
- **THEN** acceptance remains unsupported and the flow waits within its bounds or returns an unsuccessful diagnostic

### Requirement: CI-sourced findings
Failed repository CI SHALL enter the ledger as CI-sourced findings and receive repair assessment even without reviewer findings. CI findings MUST remain distinct from agent-raised review issues. Only corresponding passing checks on the current head SHALL establish their resolution. Pending or unknown checks MUST NOT become speculative repair work.

#### Scenario: Failure without reviewer defect
- **WHEN** review finds no introduced defect but required CI reports a failed check
- **THEN** the failure becomes an actionable CI finding with its check identity and failure evidence

#### Scenario: Claimed CI repair
- **WHEN** an agent claims to fix CI but the corresponding required check still fails
- **THEN** the finding remains unresolved and acceptance stays blocked

### Requirement: Bounded repair and fresh verification
The flow SHALL allow at most ten repair dispatches per invocation, including failed or abandoned dispatches. Initial review MUST NOT consume repair budget. Every normally returning repair SHALL receive fresh independent review and validation before budget exhaustion is enforced. Overall execution MUST be finite, including CI waiting and external-head restarts.

#### Scenario: Last repair succeeds
- **WHEN** repair ten is published and fresh review plus current-head CI support acceptance
- **THEN** the flow succeeds with ten attempts

#### Scenario: Last repair leaves blockers
- **WHEN** fresh review after repair ten leaves actionable blockers
- **THEN** the flow returns limit reached without dispatching an eleventh repair

#### Scenario: Repair fails
- **WHEN** a dispatched repair fails
- **THEN** the attempt is counted and the flow reports failure rather than accepting the repairer's intent

### Requirement: External head movement restarts review
The flow SHALL detect unexpected remote head movement before publishing repairs or acceptance. Stale repair work MUST NOT be pushed or automatically rebased over another update. The flow SHALL preserve abandoned work and continue with a fresh workspace and review of the new head, within its existing attempt and execution bounds.

#### Scenario: Contributor pushes during repair
- **WHEN** the remote head changes while a repair is being prepared
- **THEN** the flow abandons publication of that repair, preserves its workspace, and starts the next pass against the new head

#### Scenario: Repeated external movement
- **WHEN** the head repeatedly changes during the invocation
- **THEN** restarts do not reset consumed repair attempts or evade the overall execution bound

### Requirement: Verified normal publication
The controller SHALL verify repair scope, commit state, publication success, and resulting remote head instead of trusting an agent's prose. Publication MUST use normal pushes without force and MUST NOT merge the PR. A publication failure SHALL be a flow error and MUST NOT lead to an acceptance claim.

#### Scenario: Agent reports push without remote update
- **WHEN** a repair report claims a push succeeded but the intended commit is not the remote head
- **THEN** the controller does not advance accepted evidence or proceed as though the repair was published

### Requirement: Isolated repair lifecycle and outcomes
Repairs SHALL occur in dedicated worktrees without altering the caller's checkout. Successful runs SHALL clean up their active worktree; failures, cancellation, unmet decisions, exhausted bounds, and abandoned repairs SHALL preserve work with reported paths. Results MUST identify PR, outcome, reviewed/published head, attempt count, remaining findings, and reporting diagnostics. Unsuccessful outcomes SHALL exit nonzero.

#### Scenario: Successful repair run
- **WHEN** acceptance is established and terminal reporting succeeds
- **THEN** the active worktree is cleaned and the result reports the accepted head and attempt count

#### Scenario: Failure preserves work
- **WHEN** repair, publication, reporting, or a required decision fails
- **THEN** the workspace is preserved and its path is included in the unsuccessful result

#### Scenario: Caller has local edits
- **WHEN** the caller's original checkout contains unrelated edits
- **THEN** those edits remain untouched on every terminal route
