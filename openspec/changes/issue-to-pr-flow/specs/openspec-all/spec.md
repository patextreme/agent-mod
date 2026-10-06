# OpenSpec All Spec Delta

## MODIFIED Requirements

### Requirement: Explicit local pipeline target
The flow SHALL accept only an explicit `changeId` naming an active repo-local change resolved from the invocation directory by default, or from an explicitly supplied canonical workspace when embedded. All stages MUST operate on that same change and canonical workspace. Missing, archived, store-backed, symlinked, escaping, or unsupported input SHALL fail before any stage writes.

#### Scenario: Selected active change
- **WHEN** the caller supplies a supported active local change
- **THEN** the flow starts grooming and keeps that change and workspace identity throughout the pipeline

#### Scenario: Unsupported selection
- **WHEN** input is missing, includes unsupported fields, or selects an unsupported target
- **THEN** the flow exits unsuccessfully without starting a write-capable stage

#### Scenario: Native prepared workspace
- **WHEN** an enclosing flow supplies a workspace produced by its preparation step
- **THEN** pipeline preflight resolves the active change there and all constituent agents, commands and file operations use that canonical workspace without changing the process-global directory

### Requirement: Constituent behavior preservation
Composition SHALL preserve each constituent flow's acceptance policy, authorized edit scope, fresh-session behavior, timeouts, and separate revision or repair budget. It MUST NOT weaken verification or substitute implementation completion for verification acceptance. Existing standalone flows SHALL remain independently invocable with unchanged behavior. Hosted continuation MUST conserve each stage's consumed budget and initial-apply accounting separately.

#### Scenario: Independent repair budgets
- **WHEN** implementation has consumed repairs before verification starts
- **THEN** verification starts with its own fresh repair budget and does not count implementation repairs

#### Scenario: Verification acceptance remains strict
- **WHEN** implementation succeeds but verification finds a blocking issue or lacks required evidence
- **THEN** the pipeline follows verification's existing repair or escalation behavior instead of proceeding to finalization

#### Scenario: Hosted budget restoration
- **WHEN** an enclosing attempt re-enters the active pipeline after escalation
- **THEN** each constituent retains its own consumed attempt accounting rather than receiving another free initial apply or fresh repair allowance

### Requirement: Transparent human escalation
Grooming, implementation, and verification SHALL retain their existing terminal steering by default, with stage, issues, recommendations and scoped questions visible. Embedded callers SHALL be able to supply equivalent scoped handling, including durable pending questions and later operator answers. Answers MUST reach the originating stage's authorization logic. Composition MUST NOT silently answer, suppress, broaden authorization or waive evidence.

#### Scenario: Escalation answered
- **WHEN** a constituent stage requires a consequential decision and valid complete steering is supplied
- **THEN** that stage continues within the supplied authorization and the pipeline advances only after its eventual success

#### Scenario: Incomplete steering
- **WHEN** steering leaves a required issue unanswered
- **THEN** the constituent stage retains its existing incomplete-answer handling and the pipeline does not authorize that cycle's edits or advance

#### Scenario: No terminal available
- **WHEN** a stage needs steering, no interactive terminal is available and no hosted durable handling is supplied
- **THEN** the pipeline reports `needs_human`, preserves prior edits, and leaves all later stages unstarted

#### Scenario: Hosted asynchronous steering
- **WHEN** hosted handling persists a pending decision instead of collecting a live answer
- **THEN** the current pipeline stops as `needs_human` and an enclosing continuation must validate supplied answers against fresh stage assessment before authorizing work

### Requirement: Explicit restart and independent entrypoints
A new standalone `openspec-all` invocation SHALL start again at groom against the current active tree with fresh stage budgets, without skipping stages using previous results. Standalone entrypoints SHALL remain available for intentional later-stage recovery. Embedded re-entry SHALL start at groom with caller-conserved budgets and fresh evidence. Neither pipeline nor finalization SHALL manage Git or checkpoint/report files. Archived targets MUST remain invalid.

#### Scenario: Restart after partial failure
- **WHEN** the caller reruns the standalone pipeline for a still-active change after resolving a failure
- **THEN** grooming begins anew with current files and no automatic stage skipping

#### Scenario: Intentional finalization retry
- **WHEN** the caller invokes standalone finalization for a still-active already-verified change after an archive failure
- **THEN** finalization follows its own restart contract without requiring another full pipeline invocation

#### Scenario: Restart after archival
- **WHEN** the caller selects a change already archived by a successful pipeline
- **THEN** the new invocation rejects the inactive target without editing specs or archived artifacts

#### Scenario: Hosted continuation responsibilities
- **WHEN** the enclosing issue attempt starts another native invocation for an active change
- **THEN** it owns durable records and Git lifecycle while the pipeline obtains fresh current-tree evidence without replaying saved transcripts as acceptance
