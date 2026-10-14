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
Implementation SHALL prepare exact task groups, dependencies, risk, and review boundaries from current apply context. Workers SHALL have task-scoped repository access, not file whitelists, and MAY edit required files while preserving unrelated work. Groups SHALL run sequentially, with explicit task-ID chunks when necessary. High-risk or uncertain prerequisites MUST be independently accepted and bookkept before dependent work; justified lower-risk groups MAY share a review boundary.

#### Scenario: Worker needs an unlisted file
- **WHEN** a worker's assigned tasks require editing a file outside any pre-listed set
- **THEN** the worker edits it within the selected action context instead of pausing for ownership reassignment, while preserving unrelated work and recorded intent

#### Scenario: Shared task artifact
- **WHEN** an implementation worker finishes a group
- **THEN** task-checkbox updates remain pending until delegated actual-source/check validation accepts its applicable review boundary, followed by serialized bookkeeping

#### Scenario: Compatible lower-risk groups
- **WHEN** preparation establishes that sequential lower-risk groups can share review without consuming an unverified prerequisite contract
- **THEN** it records the exact task IDs and rationale and independently reviews their combined boundary before marking its tasks complete

#### Scenario: High-risk prerequisite
- **WHEN** dependent work would consume a contract involving authorization, durable state, admission, idempotency, recovery, or another consequential cross-component invariant
- **THEN** implementation stops at a review boundary and releases dependent work only after independent acceptance and bookkeeping of the prerequisite

#### Scenario: Unknown risk
- **WHEN** preparation cannot establish a group's risk or dependency safety
- **THEN** it requires a separate independent review boundary before dependent work instead of assuming low risk

### Requirement: Evidence-backed implementation completion
Implementation SHALL claim completion only after assigned tasks are implemented, independently accepted against actual source, and fresh apply status confirms completion. Task checkboxes MUST remain pending until the applicable review boundary passes. Completion SHALL require fresh final repository-wide checks and integrated semantic review. Summaries or green checks alone MUST NOT establish completion. Commits, pushes, sync, and archive SHALL retain existing authorization requirements.

#### Scenario: Worker reports completion without evidence
- **WHEN** a worker claims its group is complete but diff/check inspection does not support it
- **THEN** the orchestrator does not accept completion or mark those tasks finished

#### Scenario: Groups implemented but not reviewed
- **WHEN** all groups have implementation results but an applicable review boundary has not passed
- **THEN** its tasks remain unbookkept and orchestration does not claim completion

#### Scenario: Final integrated defect
- **WHEN** intermediate boundaries passed but fresh final checks or integrated semantic review identify a technical defect
- **THEN** orchestration repairs and independently verifies affected behavior, reruns affected final checks and review, and reads fresh apply status before claiming completion

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

### Requirement: Explicit dependency and risk review plan
Preparation SHALL record task IDs, dependency edges, risk classifications with rationale, review boundaries, prerequisite release conditions, and discovered check commands. Review scheduling SHALL remain distinct from task headings and worker lifetime. Changed dependencies or risk assumptions MUST trigger plan reconciliation before affected work proceeds.

#### Scenario: Planning headings do not define acceptance
- **WHEN** task headings separate presentation and documentation work with no prerequisite contract between them
- **THEN** preparation can assign them to one justified review boundary while retaining sequential implementation and exact task coverage

#### Scenario: New dependency discovered
- **WHEN** implementation reveals that a batched group consumes an unverified consequential prerequisite
- **THEN** orchestration reconciles the plan and independently accepts that prerequisite before releasing dependent work

### Requirement: Mechanical checks and semantic review
Workers SHALL execute focused repository-provided checks and return exact commands, results, scope, and source binding. Fresh independent reviewers SHALL inspect requirements, actual changes, cross-component contracts, relevant failure behavior, and whether checks cover production paths. Passing checks MUST NOT replace semantic review; blocked required checks MUST NOT establish acceptance.

#### Scenario: Green checks miss admission failure
- **WHEN** checks pass but a fresh reviewer reproduces an admission or idempotency contract violation
- **THEN** the boundary remains unaccepted and the violation enters technical repair

#### Scenario: Repository supplies check commands
- **WHEN** repository instructions and executable configuration define applicable checks
- **THEN** preparation records those commands for focused worker execution and final required checks rather than reconstructing them in every brief

### Requirement: Targeted implementation repair verification
Implementation findings SHALL record violated requirements, source references, reproduction or regression evidence, expected behavior, affected contracts, and regression scope. Fresh repair reviewers SHALL inspect actual repairs and affected contracts first and justify sufficient scope. Architecture changes, widened impact, invalid evidence, or uncertain impact MUST expand review to the affected boundary or wider scope. Genuine decisions and recurring no-progress findings SHALL still pause.

#### Scenario: Local repair preserves other accepted evidence
- **WHEN** a regression-backed repair has bounded impact and unchanged evidence outside the affected contracts
- **THEN** a fresh reviewer verifies the finding and affected contracts and justifies targeted acceptance without automatically repeating the entire group's review

#### Scenario: Repair impact is uncertain
- **WHEN** a repair changes shared architecture or the reviewer cannot establish bounded impact
- **THEN** review expands to the affected boundary and dependent contracts instead of accepting the repair from a narrow regression alone

#### Scenario: No reproduction available
- **WHEN** a finding lacks a usable reproduction or failing regression
- **THEN** its record states the limitation and acceptance requires independent source-bound investigation rather than an invented test result

### Requirement: Bounded implementation worker lifetime
Implementation SHALL default to a fresh worker per task group, independently of review batching. Preparation SHALL define configurable context/handoff policy using reliable host signals when available and explicit task-ID chunks for unusually large groups otherwise. Cumulative billed input tokens MUST NOT stand in for context occupancy. Workers SHALL checkpoint remaining work at safe boundaries rather than indefinitely extending a context.

#### Scenario: No context telemetry
- **WHEN** the host exposes no reliable context-occupancy signal
- **THEN** preparation uses fresh group workers and explicit bounded task chunks without promising automatic token-threshold detection

#### Scenario: Context threshold approached
- **WHEN** a reliable host signal approaches the configured handoff threshold
- **THEN** the worker preserves progress and records a safe-boundary handoff for a fresh worker without marking unfinished or unverified tasks complete

### Requirement: Durable handoff and writer exclusion
Preparation SHALL select a configurable repository-local, gitignored per-change record location and verify it is ignored before writing. Handoffs SHALL bind task coverage, changed files, remaining work, commands/results, source state, findings, and blockers to the selected action context. Replacement writers MUST wait for confirmed writer termination and reconciliation of mutating subprocesses. Missing safe storage or uncertain writer quiescence SHALL pause.

#### Scenario: Safe continuation
- **WHEN** a writer finishes with a durable handoff and its mutating subprocesses are confirmed stopped
- **THEN** a fresh worker reconciles actual source and task state before continuing the remaining assigned work

#### Scenario: Interrupted writer may still be active
- **WHEN** a writer was interrupted and host evidence cannot establish that it and its mutating subprocesses stopped
- **THEN** orchestration preserves progress and pauses without launching a competing writer

#### Scenario: Record location is not ignored
- **WHEN** the selected record location is not demonstrably gitignored
- **THEN** orchestration obtains a safe location or pauses before writing and does not publish handoff or run evidence as planning artifacts

### Requirement: Source-bound reusable implementation evidence
Evidence SHALL bind source including dirty changes, task/requirement scope, assumptions, and commands/results. Resume SHALL reconcile state before reuse. Source, shared-contract, dependency, or check-configuration changes MUST invalidate affected evidence; uncertain impact MUST invalidate the affected boundary. Implementation, checks, acceptance, and bookkeeping SHALL have distinct statuses. Final checks and integrated review MUST be fresh.

#### Scenario: Unrelated edit preserves evidence
- **WHEN** an unrelated edit leaves the recorded source scope and prerequisite assumptions unchanged
- **THEN** orchestration can reuse that evidence after reconciliation without discarding every result

#### Scenario: Dirty prerequisite changes
- **WHEN** the commit remains unchanged but dirty source modifies an accepted prerequisite contract
- **THEN** orchestration invalidates affected acceptance and dependent evidence, prevents further dependent release, and re-verifies before treating affected tasks as complete

#### Scenario: Check configuration changes
- **WHEN** relevant dependency or check configuration changes after a passing check
- **THEN** affected check evidence is invalidated and applicable commands are rediscovered or rerun against current state
