# openspec-lifecycle-orchestration Specification

## Purpose

Compose the installed OpenSpec stage skills for one selected change, preserving their policies while authorizing built-in synchronization and confirmed archival under a single lifecycle invocation.

## Requirements

### Requirement: Sticky resolved lifecycle identity
The lifecycle SHALL resolve one repository/worktree, change, planning root and optional store before writes and retain that identity across every stage. It SHALL pass resolved artifact and installed-skill paths to delegates. Ambiguous selection, changed identity or unsafe scope MUST pause for reconciliation rather than select another target.

#### Scenario: Store-backed selection
- **WHEN** the user selects a registered store and an unambiguous change
- **THEN** every applicable command retains that store and delegates use the CLI-resolved planning/artifact paths with the same implementation workspace

#### Scenario: Identity changes between stages
- **WHEN** the resolved root, selected change or expected workspace no longer matches the accepted contract
- **THEN** the next stage remains unstarted and the user receives the discrepancy

### Requirement: External prerequisites before dispatch
The lifecycle SHALL resolve and read its bundled stages and external apply, verify, archive and sync procedures from actual available-skill information. Required tools, nested delegation and host workflow authorization/depth MUST be available before dispatch. Missing prerequisites SHALL pause without invented paths, copied substitutes or a stock-host fallback.

#### Scenario: Installed skill outside the worktree
- **WHEN** an external archive procedure is available at an installed location outside the selected worktree
- **THEN** delegates receive that resolved absolute skill path and separately receive the selected worktree and planning root

#### Scenario: Nested workflow unavailable
- **WHEN** a delegated implementation stage lacks authorized SubagentWorkflow capability or permitted depth
- **THEN** the lifecycle reports the prerequisite and does not flatten, silently substitute or dispatch that stage

### Requirement: Ordered accepted predecessor evidence
The lifecycle SHALL run groom, implement, verify and finalize in order. A later stage MUST require accepted current evidence for its predecessor and the same target; reports alone, unchecked completion claims or mere agent termination SHALL NOT suffice. Implementation task-and-gate completion MUST remain distinct from verification acceptance.

#### Scenario: Implementation complete but verification blocked
- **WHEN** tasks and integrated checks pass but complete verification does not establish zero Critical and Warning findings
- **THEN** finalization remains unstarted and the lifecycle reports verified acceptance as outstanding

#### Scenario: Stale predecessor evidence
- **WHEN** relevant code, artifacts or required check state changes after predecessor acceptance
- **THEN** affected acceptance is re-established before the dependent stage starts

### Requirement: Separate post-groom readiness decision
Critical-free grooming SHALL retain its constituent completion criterion. Before implementation the lifecycle SHALL separately validate structure and assess remaining readiness blockers and decisions. Major/Minor findings MUST be reported without automatic grooming repair or severity promotion; a consequential unresolved decision SHALL pause the affected progression.

#### Scenario: Major decision after successful groom
- **WHEN** a complete fresh grooming report has zero Critical findings but leaves a material design decision unresolved
- **THEN** grooming is reported complete while implementation remains unstarted pending the explicit readiness decision

### Requirement: Constituent scopes and repair accounting
Composition SHALL preserve the installed stage contracts, including Critical-only grooming, dependency-aware task groups with serialized bookkeeping, and fresh complete zero-Critical/zero-Warning verification. Groom/verify SHALL retain no arbitrary round cap and their stalled-progress pauses. The lifecycle MUST NOT import acpx budgets, severity protocols or repair authority.

#### Scenario: Repeated findings without progress
- **WHEN** a constituent detects recurring findings without substantive progress
- **THEN** it pauses under its own contract and composition preserves that outcome instead of resetting or hiding the loop

#### Scenario: Concurrent task groups
- **WHEN** implementation prepares independent groups with disjoint ownership
- **THEN** its own dependency scheduling and independent diff/check validation precede serialized task completion bookkeeping

### Requirement: Transparent human-input propagation
The lifecycle SHALL relay each constituent's complete question, evidence, options and recommendation and pause for the user's scoped answer. Invocation MUST NOT answer consequential decisions, waive required evidence, widen edit authority or override tool permissions. Resume SHALL reconcile state before returning the answer to the affected stage.

#### Scenario: No user answer available
- **WHEN** an agent returns a required human-input branch and no explicit answer is available
- **THEN** the lifecycle preserves safe work, reports the question and leaves dependent stages unstarted

### Requirement: Explicit built-in finalization choice
Lifecycle invocation SHALL explicitly authorize synchronization when needed and archival after accepted verification. The delegated archive procedure SHALL receive that recorded choice while still presenting its sync analysis. Incomplete artifacts/tasks, conflicts or failures MUST pause; authorization SHALL NOT override those warnings or permit skipping needed sync while claiming completion.

#### Scenario: Sync needed
- **WHEN** the archive procedure reports applicable unsynchronized deltas after accepted verification
- **THEN** the recorded invocation choice is Sync now followed by archive on acceptance, not Archive without syncing

#### Scenario: Incomplete task or artifact
- **WHEN** archive preflight finds an incomplete required artifact or unchecked task
- **THEN** finalization pauses for reconciliation rather than using invocation as confirmation to proceed with the warning

### Requirement: Installed archive and inline sync reuse
Finalization SHALL follow the resolved installed archive procedure and its synchronous inline sync dependency. It SHALL preserve authoritative status-derived delta paths, selected-root flags, archive advisory-input behavior and the required valid specs-rule snapshot before writes. No new finalization skill, flow-owned replacement or independent sync assessor SHALL be required.

#### Scenario: Required specs instructions fail
- **WHEN** deltas need syncing but specs instructions fail or return invalid JSON
- **THEN** finalization stops before main-spec writes and archival

#### Scenario: Optional archive inputs fail
- **WHEN** optional archive operation guidance cannot be loaded
- **THEN** the built-in procedure continues without those advisory inputs while its controlling completion, sync and move checks remain required

### Requirement: Built-in comparison is sync acceptance
Sync acceptance SHALL require the archive procedure's post-sync comparison of every status-selected delta capability, including intended additions, modifications, removals, renames and preservation of unaffected scenarios. A worker success summary MUST NOT replace that comparison. Failed or inconclusive comparison SHALL block archival without an additional independent assessor.

#### Scenario: Unreported capability mismatch
- **WHEN** sync reports success but the built-in comparison finds a selected capability still differs
- **THEN** the lifecycle reports attempted sync separately from rejected sync acceptance and does not archive

### Requirement: Built-in no-delta and already-synced paths
Finalization SHALL use only the built-in authoritative delta inventory. With no delta paths it SHALL report sync not applicable and proceed without specs-rule lookup or main-spec writes. Already-synced deltas SHALL retain the archive procedure's assessment and explicit Archive now choice without unnecessary sync replay.

#### Scenario: Specs skipped
- **WHEN** status declares specs skipped and resolves no delta paths
- **THEN** finalization reports No delta specs, writes no main spec and can archive after other checks

#### Scenario: Deltas already applied
- **WHEN** built-in assessment establishes all selected deltas are already synced
- **THEN** finalization records that assessment and uses the authorized Archive now choice

### Requirement: Confirmed whole-directory archival
Lifecycle success SHALL require the archive procedure's actual whole-change move and confirmation of source absence, complete destination contents including metadata, and the selected identity. Destination collisions, partial contents or an unconfirmed move MUST NOT establish success or trigger overwrite, merge or an automatic alternate archive name.

#### Scenario: Move result is uncertain
- **WHEN** the move is attempted but source absence and complete destination contents cannot be confirmed
- **THEN** the outcome is partial or blocked, with both paths reported for reconciliation

#### Scenario: Existing archive destination
- **WHEN** the intended date-derived destination already exists
- **THEN** finalization pauses without overwriting or treating its existence alone as prior success

### Requirement: Honest partial lifecycle reporting
The final report SHALL retain target identity, full stage reports, accepted evidence, readiness decisions, counts, checks, skipped scope, sync assessment and archive state/path. Failed, interrupted or blocked work SHALL remain useful and preserved; later stages MUST be marked unstarted. Only all four accepted stages and confirmed archival SHALL establish lifecycle completion.

#### Scenario: Implementation fails after grooming
- **WHEN** grooming and readiness succeeded but implementation fails
- **THEN** the report preserves prior work/evidence and explicitly marks verify and finalize unstarted

### Requirement: Explicit resume reconciles actual state
Resume SHALL inspect current workspace, accepted evidence, selected delta effects and both active/archive paths before continuing. It SHALL re-establish stale evidence, complete only remaining authorized operations and preserve constituent histories. Ambiguous or partially moved state MUST pause. The skill SHALL NOT promise native acpx checkpoints, deterministic CLI results or automatic transactional recovery.

#### Scenario: Sync accepted but archive failed
- **WHEN** the user resumes with an intact active change after an archive failure
- **THEN** current verification and sync state are reconciled and only remaining authorized finalization proceeds without duplicate sync effects

#### Scenario: Already archived with complete matching evidence
- **WHEN** source is absent and a complete matching archive and current accepted stage evidence are confirmed
- **THEN** resume reports observed finalization without moving it again or re-running the active-change lifecycle

#### Scenario: Archived target lacks predecessor evidence
- **WHEN** an archive exists but selected-target verification or sync acceptance cannot be established
- **THEN** the lifecycle reports the evidence gap rather than inferring lifecycle completion or reopening the change
