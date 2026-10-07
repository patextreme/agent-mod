# openspec-skill-orchestration Specification

## Purpose

Coordinate delegated OpenSpec grooming, task-group implementation and verification/repair using the selected change's intent and source-defined completion criteria.

## Requirements

### Requirement: Delegated stage ownership
OpenSpec orchestration SHALL delegate investigation, review, edits and checks to subagents while retaining evidence acceptance and escalation with the orchestrator. Selected repository/change/store identity SHALL remain consistent across a stage. Ambiguous selection or consequential choices SHALL pause for human input rather than invent intent.

#### Scenario: Consequential correction
- **WHEN** a stage cannot determine a safe correction from existing intent or recorded decisions
- **THEN** it preserves safe work, reports the exact decision and asks the user before resuming with the same reconciled target

### Requirement: Critical-only grooming
Grooming SHALL alternate fresh read-only review and separate Critical-finding planning repairs. A complete review with zero Critical findings SHALL end grooming even when Major/Minor findings, readiness blockers or a NEEDS REVISION label remain. Incomplete review or indeterminate severity MUST NOT establish success.

#### Scenario: Major decision remains
- **WHEN** a complete fresh review finds zero Critical findings and an outstanding Major architecture decision
- **THEN** grooming finishes and reports that decision without treating grooming as implementation readiness

#### Scenario: Incomplete review
- **WHEN** a returned review lacks necessary coverage or a usable severity assessment
- **THEN** grooming obtains the missing investigation or pauses with the limitation instead of declaring success

### Requirement: Source-defined grooming boundary
Grooming SHALL restrict repairs to Critical findings in the selected planning artifacts and preserve explicit intent. It MUST NOT implement code, independently repair unrelated severities, sync or archive. Structural validation SHALL remain a separate action, and the final report SHALL remind the user of that limitation.

#### Scenario: Grooming completes
- **WHEN** fresh semantic review establishes zero Critical findings
- **THEN** the report includes rounds, edited files, remaining severity counts and separate structural-validation guidance without claiming structural validity

### Requirement: Sequential whole-group implementation
Implementation SHALL prepare exact task groups and their dependencies from current apply instructions and context. Workers SHALL receive task-scoped repository access within the selected action context rather than file-ownership whitelists, and MAY edit whatever their assigned tasks require while preserving unrelated work. Task groups SHALL run one at a time, each released only after the preceding group's completion is independently verified and bookkept.

#### Scenario: Worker needs an unlisted file
- **WHEN** a worker's assigned tasks require editing a file outside any pre-listed set
- **THEN** the worker edits it within the selected action context instead of pausing for ownership reassignment, while preserving unrelated work and recorded intent

#### Scenario: Shared task artifact
- **WHEN** an implementation worker finishes a group
- **THEN** delegated actual-diff/check validation precedes serialized task-checkbox bookkeeping, preventing unverified edits to shared task state

### Requirement: Evidence-backed implementation completion
Implementation SHALL claim completion only after assigned tasks are implemented, a fresh read-only verifier inspects the actual changes and checks, and apply status is refreshed. Summaries alone MUST NOT establish completion. Sync and archive SHALL remain separate requests.

#### Scenario: Worker reports completion without evidence
- **WHEN** a worker claims its group is complete but diff/check inspection does not support it
- **THEN** the orchestrator does not accept completion or mark those tasks finished

### Requirement: Autonomous technical repair
Implementation SHALL return fixable technical failures within recorded intent to an implementation worker with the exact findings and reproduction, then re-verify the actual changes without a human approval round. Design, product, architecture or authorization decisions SHALL pause affected work and dependents. Recurring findings without edits or new evidence SHALL pause for human input rather than redispatch unchanged work.

#### Scenario: Technical check failure
- **WHEN** verification reports a fixable technical failure within existing intent
- **THEN** an implementation worker repairs it and a fresh verifier re-inspects the actual changes

#### Scenario: Recurring findings without progress
- **WHEN** the same findings recur with no edits and no new evidence
- **THEN** implementation reports the impediment and asks the user instead of redispatching unchanged work

### Requirement: Critical-and-Warning verification acceptance
Verification SHALL use a fresh read-only agent following the externally supplied verification procedure. Success SHALL require complete verification with zero Critical and zero Warning findings and applicable required evidence. Suggestions SHALL remain report-only. Skipped optional scope SHALL be disclosed; interrupted review, unread available artifacts or blocked required checks MUST NOT establish success.

#### Scenario: Warning-only report
- **WHEN** the underlying procedure calls a Warning-only result archive-ready
- **THEN** orchestration still requires repair and fresh verification rather than accepting it

#### Scenario: Missing optional artifact
- **WHEN** the verification procedure justifies skipping a genuinely optional unavailable artifact
- **THEN** the final report discloses limited scope without representing skipped checks as passed

### Requirement: Scoped verification repair and progress
Verification repairs SHALL address Critical and Warning findings within existing intent, leaving unrelated work and Suggestions intact. Fresh verification SHALL inspect actual changes and prior findings after repair. Grooming and verification SHALL have no arbitrary round cap, but failures, blocked decisions and recurring findings without substantive progress SHALL pause rather than repeat unchanged work indefinitely.

#### Scenario: Routine repair and fresh acceptance
- **WHEN** an intent-preserving correction is supported by requirements and conventions
- **THEN** a separate repair agent performs it, runs relevant checks, and a fresh verifier determines whether findings are clear

#### Scenario: No substantive progress
- **WHEN** findings recur without substantive progress
- **THEN** the stage reports the impediment and requests human input without claiming success or resetting into an unchanged loop

### Requirement: Verification lifecycle reporting
Verification SHALL report selected change/store, review/repair rounds, actual edited files, final counts, checks, skipped scope and unresolved questions. It SHALL distinguish success from blocked or partial work and leave synchronization and archival to separate requests.

#### Scenario: Verified change remains active
- **WHEN** verification reaches its acceptance criteria
- **THEN** it reports the evidence without syncing, archiving, or asserting checks that were not performed
