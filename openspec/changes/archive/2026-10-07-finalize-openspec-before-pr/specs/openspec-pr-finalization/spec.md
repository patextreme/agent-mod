# Spec Delta

## Purpose

Finalize successfully verified OpenSpec issue work before PR delivery and preserve alignment between implementation, archived planning evidence and main specs during subsequent in-scope review repairs.

## Development and integration context

The requirements below govern execution of the resulting issue-to-PR skill, not this planning session. PR50 is merged at integrated base `origin/main` `0fa734b`, with migration sync/archive verified and actual skill main specs present; the deferred baseline gate is satisfied. The companion `issue-to-pr-orchestration` delta contains full MODIFIED **Selected implementation path** and **Single-issue lifecycle limit** blocks, retaining unaffected direct-route/readiness/delivery/merge/cleanup/queue behavior. Actual PR-review requirements do not conflict with these additive archived-source rules.

Groups 1–4 retain frozen-baseline acceptance; integrated tasks 5.1–5.3 require fresh inspection, gates and diff evidence before acceptance and subsequent verification. Preserve original checkout, verified orphan and manifests. Planning reconciliation authorizes no implementation, main-spec/migration-archive writes or sync/archive/commit/delivery. Operational labels, signing and nested-tool/depth checks remain separate from static development. Tracker setup now exists but targets `main` while preexisting source delivery conventions retain `develop`; no delivery-policy change is authorized here.

## ADDED Requirements

### Requirement: OpenSpec-only pre-delivery stage
Issue-to-PR SHALL place finalize after accepted OpenSpec verification and before deliver, retaining repository/worktree/change/planning-root/store identity. `orc-openspec-verify` SHALL remain verification-only. The direct-edits route and its existing routing, delivery, review and final-head contracts MUST remain unchanged.

#### Scenario: Verified OpenSpec route
- **WHEN** the selected OpenSpec change has complete accepted zero-Critical/zero-Warning verification with required checks and disclosed scope
- **THEN** issue-to-PR dispatches finalization before any delivery of that completed implementation

#### Scenario: Direct-edits route
- **WHEN** exact-label routing selects direct edits
- **THEN** no OpenSpec finalization stage or archive dependency is introduced into that route

### Requirement: Explicit prerequisite resolution
The OpenSpec route SHALL resolve and read externally installed archive/sync procedures before write-capable flow dispatch and pass their absolute paths separately from worktree/planning context. Missing procedures, required nested tools, incompatible depth or unauthorized planning/delivery roots SHALL block dispatch; the route MUST NOT substitute #48, #47 or a separate finalizer.

#### Scenario: Archive dependency missing
- **WHEN** the invoking environment cannot resolve `openspec-archive-change` or `openspec-sync-specs`
- **THEN** orchestration pauses with that missing prerequisite without assuming a home/checkout path or using another procedure

#### Scenario: External planning store cannot be delivered
- **WHEN** main specs and archived artifacts belong to a separate repository outside the authorized PR contents
- **THEN** orchestration pauses for explicit scope/delivery reconciliation before writes instead of claiming those artifacts will be in the selected PR

### Requirement: Invocation authorizes built-in choices
Issue-to-PR invocation SHALL explicitly authorize needed synchronization and whole-change archival after verification acceptance. The archive delegate SHALL receive this choice and retain its combined sync summary and assessment. Needed sync MUST NOT be skipped while claiming PR readiness; tool permissions and other human-input branches SHALL remain independent.

#### Scenario: Applicable sync changes
- **WHEN** archive assessment identifies unsynced deltas
- **THEN** the explicit invocation choice is Sync now and archive only after built-in acceptance, not Archive without syncing

#### Scenario: Already-synced deltas
- **WHEN** the built-in assessment finds every selected delta already applied
- **THEN** orchestration passes the authorized Archive now choice without unnecessary sync replay

### Requirement: Incomplete and unsafe finalization pauses
Incomplete required artifacts/tasks, conflicts, failures and ambiguous finalization evidence SHALL pause the OpenSpec route, preserve safe work and receipts, and leave delivery unstarted. Invocation SHALL NOT serve as confirmation to override built-in incomplete-work warnings, resolve consequential conflicts or claim completion after a partial operation.

#### Scenario: Incomplete tasks after verification report
- **WHEN** current archive preflight finds unchecked tasks despite an earlier verification success report
- **THEN** finalization pauses for evidence/state reconciliation and no delivery is dispatched

### Requirement: Built-in archive and sync contract preservation
Finalization SHALL reuse installed `openspec-archive-change` with its inline synchronous `openspec-sync-specs`, authoritative status delta inventory and selected-root flags. Required valid specs instructions SHALL precede main-spec writes; optional archive operation inputs SHALL retain their advisory behavior. A separate finalization skill or independent sync assessor MUST NOT be added.

#### Scenario: Specs-rule lookup fails
- **WHEN** needed sync cannot obtain valid required specs instructions
- **THEN** main-spec writes and archival stop and delivery remains unstarted

#### Scenario: Sync still in flight
- **WHEN** a sync delegate has not returned with completed evidence
- **THEN** archival does not start or move its source directory out from under that operation

### Requirement: Built-in sync comparison acceptance
Sync acceptance SHALL require the archive procedure's post-sync comparison across every selected capability and all delta effects, retaining unaffected content. Sync-worker claims alone SHALL NOT establish acceptance. Mismatch, failure or inconclusive coverage MUST block archival and delivery without requiring another independent assessor.

#### Scenario: Rejected sync after partial edits
- **WHEN** a worker updates some main specs but built-in comparison finds a mismatch
- **THEN** the route preserves those edits, reports sync unaccepted and leaves the change active and delivery unstarted

### Requirement: No-delta finalization remains valid
When built-in status resolves no delta spec paths, finalization SHALL report sync not applicable, request no specs-rule snapshot, write no main specs and perform archival only after other checks pass. Deltas MUST NOT be inferred from proposal, design or tasks.

#### Scenario: No-delta change
- **WHEN** a verified change has specs skipped or an empty authoritative delta inventory
- **THEN** the route can archive and deliver its implementation and complete archived artifacts without fabricated main-spec updates

### Requirement: Actual complete archive gates delivery
Delivery readiness SHALL require confirmed source absence and a complete matching archive destination including `.openspec.yaml` and all change contents. Collisions, move failures, partial moves and unconfirmed moves MUST block delivery. Archive paths SHALL follow the installed procedure's planning-home and date-prefix rules without overwrite or duplicate naming.

#### Scenario: Archive failure after accepted sync
- **WHEN** synchronization is accepted but the move fails
- **THEN** the route reports those states separately and dispatches no delivery

#### Scenario: Matching-looking destination is incomplete
- **WHEN** an archive directory exists but complete selected-change contents or source absence cannot be established
- **THEN** its existence is not treated as finalization success and the route pauses for reconciliation

### Requirement: Authorized finalization contents in PR
OpenSpec delivery SHALL include authorized implementation, applicable main-spec changes and the entire archived selected change, accounting for active-path deletions. It SHALL independently inspect staged/outgoing contents and receipts under existing signing, DCO, branch/base, push and PR conventions. Unrelated baseline changes MUST NOT be swept into delivery by blanket staging.

#### Scenario: Successful delivery package
- **WHEN** finalization is accepted and delivery proceeds
- **THEN** outgoing inspection confirms code, applicable synchronized main specs, complete archived artifacts and active-path removals for the same target in the delivered PR

### Requirement: Archived sources enter PR review
PR review/repair SHALL receive the confirmed archive location, exact artifact inventory, relevant main-spec paths and originating issue as clean requirements sources. Fresh history-free review axes MUST read archived planning evidence rather than require an active change path. Missing required evidence SHALL pause or use explicitly authorized limited coverage, not be silently skipped because archival occurred.

#### Scenario: Spec review after archival
- **WHEN** the active change path no longer exists during PR review
- **THEN** the Spec axis loads the confirmed archived proposal/specs/design/tasks and relevant main specs without reopening the change

### Requirement: In-scope repairs stay archived
Authorized corrections within approved intent SHALL keep the change archived. Code-only corrections SHALL run affected regression/required checks without reopening/rearchiving or rerunning the entire lifecycle. Behavior-affecting corrections SHALL inspect code, archived intent and main specs together, update affected documents when needed, and revalidate affected scope before final-head acceptance.

#### Scenario: Code-only regression correction
- **WHEN** a repair restores implementation to existing approved requirements without changing documented behavior
- **THEN** evidence records code/spec alignment and affected checks while the archived directory remains in place

#### Scenario: Behavior-affecting repair within approved intent
- **WHEN** a qualifying correction changes observable implementation behavior within established authorization
- **THEN** repair checks code against archived artifacts and main specs, reconciles affected documents and reruns relevant validation before fresh review accepts the new head

### Requirement: New consequential intent requires authorization
Archived status SHALL NOT authorize new requirements, consequential design changes or weakened tests/specs. Such proposed repairs SHALL preserve safe work, expose the finding, proposed intent, options and affected evidence, and pause for the user's scoped decision. Archival SHALL NOT make requirements unavailable or exempt corrections from existing repair thresholds.

#### Scenario: Repair needs new product behavior
- **WHEN** a finding cannot be corrected within approved archived intent and existing conventions
- **THEN** repair pauses for authorization and does not alter requirements or start a replacement lifecycle automatically

### Requirement: Resume reconciles finalization and delivery
Resume SHALL reconcile current specs, active/archive contents, accepted reports and actual git/PR receipts before further operations. It SHALL finish only remaining authorized sync/archive/delivery work, re-establish stale evidence and preserve PR run identity and reserved attempts. Ambiguous state MUST pause; completed moves, commits, pushes and PR creation MUST NOT be blindly replayed.

#### Scenario: Finalized before interrupted delivery
- **WHEN** source absence, complete archive and accepted current sync/verification evidence are established but no delivery exists
- **THEN** resume proceeds to remaining delivery without reopening or creating a duplicate archive

#### Scenario: Partial delivery exists
- **WHEN** signed local commits or a pushed branch/PR already account for some authorized delivery operations
- **THEN** resume verifies contents and receipts and completes only missing operations instead of creating duplicates

#### Scenario: Both active and archived trees exist
- **WHEN** resume discovers conflicting source and destination copies or uncertain ownership
- **THEN** it preserves both and asks for reconciliation rather than merging, overwriting or choosing one silently

### Requirement: Final-head and reporting policies preserved
Completion SHALL require existing delivery/review/repair gates at the same final head, retaining cumulative ten-attempt history, material repair thresholds and verified publication receipts. Reports SHALL add sync state, archive path and included evidence to existing outcomes. Merging and worktree removal SHALL remain user actions; archived SHALL mean packaged for review, not merged.

#### Scenario: Repair changes delivered head
- **WHEN** post-archive repair produces a new delivered commit
- **THEN** fresh review, affected document/spec validation and required final-head gates match that SHA, and stale gates cannot establish completion
