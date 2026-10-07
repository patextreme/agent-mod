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

### Requirement: Dependency-aware task-group implementation
Implementation SHALL prepare exact task groups and dependencies from current apply instructions and context. One whole group SHALL run at a time through implementation, repair, independent verification and bookkeeping. Dependent groups MUST wait for verified completion and confirmed task bookkeeping. Accepted prerequisite evidence SHALL be retained across dispatches and reconciled on resume.

#### Scenario: Shared task artifact
- **WHEN** a worker's group passes independent actual-diff and check validation
- **THEN** a separate bookkeeping agent marks only verified tasks complete and confirms fresh apply progress before the next group starts

#### Scenario: Prerequisite evidence survives resume
- **WHEN** implementation resumes after a prerequisite group was accepted
- **THEN** the orchestrator reconciles actual state and passes the accepted evidence to the next worker rather than relying on a checkbox or stale brief

### Requirement: Task-scoped implementation access
Workers SHALL implement only their assigned tasks and MAY edit necessary repository files within the selected action context while preserving unrelated work and recorded intent. Likely touched files SHALL be advisory rather than edit whitelists.

#### Scenario: Necessary implementation file
- **WHEN** a worker discovers an existing submodule or packaging file required by its assigned tasks but absent from the preparation's likely-file list
- **THEN** it may edit that file within task and action-context scope without a file-ownership approval loop

### Requirement: Evidence-backed implementation completion
Implementation SHALL claim completion only after assigned tasks are implemented and independently checked, integrated required checks pass, and apply status is refreshed. Summaries alone MUST NOT establish completion.

#### Scenario: Worker reports completion without evidence
- **WHEN** a worker claims its group is complete but diff/check inspection does not support it
- **THEN** the orchestrator does not accept completion or mark those tasks finished

### Requirement: Autonomous implementation repair
Technical failures determined by existing requirements, recorded decisions and conventions SHALL receive delegated investigation or repair followed by fresh independent verification while dependent work remains held. Genuine design/product/architecture decisions or external authorization SHALL pause for human input.

#### Scenario: Routine technical failure
- **WHEN** a required check or group verification exposes an intent-preserving implementation defect
- **THEN** the orchestrator sends exact findings and reproduction evidence to a repair worker, then obtains fresh independent verification without requiring human permission for that technical repair

### Requirement: Implementation progress recovery
Recurring findings without edits or new evidence SHALL return to the main orchestrator for investigation and an evidence-backed revised brief, not unchanged redispatch. If no safe next step is established, the run SHALL report a blocked outcome.

#### Scenario: Unchanged recurring finding
- **WHEN** a finding recurs without implementation changes or new evidence justifying a different next step
- **THEN** dispatch returns to the main orchestrator for investigation and a revised brief, and no unchanged implementation retry or success claim is permitted

#### Scenario: Final repair verification fails
- **WHEN** integrated checks trigger a repair whose independent verification remains incomplete or reports unresolved findings
- **THEN** affected prior evidence is invalidated, repair and fresh verification repeat, and green checks or completed checkboxes alone cannot authorize final success

### Requirement: Separate implementation delivery
Implementation workers MUST NOT commit, push, create PRs, sync or archive. Delivery and finalization SHALL remain separate authorized stages.

#### Scenario: Implementation is complete
- **WHEN** all implementation tasks and checks pass
- **THEN** workers return evidence without publishing commits or performing synchronization or archival

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
