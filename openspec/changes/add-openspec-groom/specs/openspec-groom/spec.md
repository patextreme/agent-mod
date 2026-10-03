# OpenSpec Grooming Spec Delta

## Purpose

Prepare an existing OpenSpec change by repairing Critical review findings in its planning artifacts, while reserving unresolved judgment calls for humans and making bounded-run outcomes explicit.

## ADDED Requirements

### Requirement: Saved workflow invocation and inputs
The saved workflow SHALL be named `openspec-groom` and accept a required non-empty `changeId` and optional `maxIterations`, defaulting to five repair rounds. The limit MUST be a positive integer. It SHALL be launched through the existing pi-subagents workflow tool without a new launcher command.

#### Scenario: Default invocation
- **WHEN** an agent invokes `openspec-groom` with a valid existing change ID and no limit
- **THEN** the workflow performs an initial review and permits at most five repair rounds

#### Scenario: Invalid input or unavailable change
- **WHEN** the change ID is absent, escapes the selected planning root, cannot resolve to an active change, or the limit is not a positive integer
- **THEN** the workflow stops unresolved with the input or resolution error
- **AND** it does not edit any artifact

### Requirement: Structured semantic review
Each review SHALL use the existing `openspec-review` skill's read-only semantic checks and produce schema-validated `{ findings: [...] }` data. Findings MUST include an ID, severity, category, artifact location, issue, and recommendation. Severity MUST preserve `Critical`, `Major`, and `Minor`; workflow presentation MUST NOT change standalone skill output.

#### Scenario: Review report with artifact references
- **WHEN** the reviewer completes a review
- **THEN** its findings have unique IDs within that review and include the required fields
- **AND** the workflow receives validated structured data rather than parsing a Markdown report
- **AND** the reviewer makes no artifact edits

### Requirement: Critical-only gate and honest success
Only findings with severity exactly `Critical` SHALL enter a grooming batch. A successful outcome MUST follow a completed valid review with zero Critical findings. Success MUST NOT claim that non-Critical blockers are cleared or that the change is otherwise ready to implement.

#### Scenario: Major blocker remains
- **WHEN** a valid review contains a Major finding designated as a blocker but no Critical finding
- **THEN** grooming stops successfully without repairing that finding
- **AND** the result reports the residual finding and distinguishes zero-Critical success from implementation readiness

#### Scenario: Critical finding without Blocker category
- **WHEN** a valid review contains a Critical finding whose category is not Blocker
- **THEN** that finding enters the grooming batch

### Requirement: Whole-batch evaluation
The workflow SHALL evaluate every Critical finding in a review before repairing the batch. Evaluation MUST return schema-validated dispositions and proposed artifact repairs for every finding ID, distinguishing autonomous repairs from human escalations. Missing, duplicate, or unknown dispositions MUST stop the run unresolved.

#### Scenario: Mixed batch
- **WHEN** a review contains one mechanically resolvable Critical finding and two findings requiring human judgment
- **THEN** all three receive an evaluation disposition before any artifact revision
- **AND** the proposed repairs and escalations refer to their originating finding IDs

### Requirement: Conservative autonomy
Autonomous repairs SHALL follow an unambiguous recorded decision or verified fact. Missing product intent, conflicting authoritative statements, unresolved architecture choices, and high-stakes trade-offs MUST be escalated rather than selected autonomously. A reviewer's recommendation alone MUST NOT authorize such a decision.

#### Scenario: Recorded requirement header
- **WHEN** a delta's header is wrong and the correct target is unambiguously established by the current spec
- **THEN** the evaluator can propose the mechanically justified correction autonomously

#### Scenario: Contradictory product scope
- **WHEN** the proposal and delta specs disagree on a product boundary without an authoritative recorded decision
- **THEN** the evaluator requests a human decision with the competing interpretations and their consequences

### Requirement: All decisions precede batch application
The workflow SHALL obtain all required human decisions through the human-escalation bridge before applying any repair in the current batch, including autonomous repairs. It MUST preserve decision provenance and MUST NOT substitute a model's answer for an unavailable, cancelled, or human-aborted response.

#### Scenario: Later escalation is aborted
- **WHEN** the human answers the first escalation but confirms an abort on a later escalation in the same batch
- **THEN** the workflow stops unresolved without applying any repair from that batch
- **AND** previously completed rounds remain unchanged

#### Scenario: Bridge unavailable
- **WHEN** a required escalation cannot reach an interactive parent bridge
- **THEN** the workflow stops unresolved with the unavailable-input reason
- **AND** it does not apply the pending batch

### Requirement: Artifact-only coherent repair
Repairs SHALL update only planning artifacts and planning metadata within the selected change. They MUST NOT implement functionality, modify application code or main specs, edit another change, archive, or commit. The write boundary MUST be enforced beyond prompts, including traversal and symlink escapes. Each batch SHALL be applied coherently before the next review.

#### Scenario: Human decision becomes artifact text
- **WHEN** all batch decisions are available and the fixer applies the approved repairs
- **THEN** the affected proposal, specs, design, or tasks express the chosen behavior coherently
- **AND** the workflow performs a fresh review after the whole batch, not after each finding
- **AND** there is no separate persistent human-decision database

#### Scenario: Out-of-scope write attempt
- **WHEN** a fixer attempts to write application code, a main spec, another change, or a symlink target outside the selected change
- **THEN** the mutation is rejected before that target is changed
- **AND** the workflow reports the failure as unresolved

### Requirement: Bounded repair rounds and final review
A repair round SHALL comprise one whole-batch repair followed by a fresh review. The initial review MUST NOT consume a repair round. The workflow MUST perform the review after its last permitted repair, succeed if that review has zero Critical findings, and otherwise stop unresolved without another repair.

#### Scenario: Success at the boundary
- **WHEN** the initial review has Critical findings and the review after the fifth repair has none under the default limit
- **THEN** the workflow reports success after exactly five repair rounds and six reviews

#### Scenario: Limit exhausted
- **WHEN** the review after the last permitted repair still contains Critical findings
- **THEN** the workflow reports unresolved with the remaining findings
- **AND** it does not apply another repair

### Requirement: Failures are not empty reviews
Missing structured results, invalid dispositions, agent/provider errors, rejected mutations, and failed repairs SHALL stop grooming unresolved. The workflow MUST NOT reinterpret these as an empty findings list or silently retry a partially applied repair. It SHALL identify any known changed artifacts and state uncertainty when complete change accounting is unavailable.

#### Scenario: Structured child returns no result
- **WHEN** a review or evaluator child returns null after the framework's own structured-output correction attempts
- **THEN** the workflow stops unresolved for missing output
- **AND** it does not claim that no Critical findings remain

#### Scenario: Partial repair failure
- **WHEN** a fixer changes one artifact and then fails before completing the batch
- **THEN** the workflow stops unresolved, reports that the batch may be partial and lists known changes
- **AND** it neither retries the repair nor automatically rolls back completed edits

### Requirement: Explicit run report
Every completed run SHALL report success or unresolved, the change ID, completed repair rounds, stop reason, last available review findings, and known changed artifacts. The report MUST distinguish confirmed human abort, execution cancellation, exhausted rounds, and operational failure when the information is available, and remind the operator to run structural OpenSpec validation separately.

#### Scenario: No repairs required
- **WHEN** the initial valid review has zero Critical findings
- **THEN** the report contains success, zero repair rounds, residual non-Critical findings if any, and the structural-validation reminder

#### Scenario: Upstream execution terminates before final return
- **WHEN** the workflow is forcibly stopped before it can return its normal report
- **THEN** the bridge cancels its outstanding requests
- **AND** the available workflow progress and mutation receipts identify cancellation and known edits without claiming convergence

### Requirement: Fresh execution approval
A new grooming execution SHALL review current artifacts and obtain fresh bridge approval for any newly required human judgment. Replaying a cached workflow result MUST NOT authorize another repair or replace fresh human approval; the initial integration MUST reject grooming resume requests that would replay earlier stages.

#### Scenario: Attempt to resume a grooming journal
- **WHEN** an operator requests pi-subagents journal resume for `openspec-groom`
- **THEN** the integration rejects that resume with instructions to start a fresh run
- **AND** previously recorded answers or repair results do not authorize new writes
