# Spec Delta

## Purpose

Finalize already-verified active local OpenSpec changes through explicit spec synchronization, independent synchronization acceptance, and safe archival without human interaction.

## ADDED Requirements

### Requirement: Explicit local target
The flow SHALL accept only an explicit `changeId` naming an active repo-local change resolved from the invocation directory. It MUST reject missing, archived, store-backed, symlinked, or escaping targets before writes and recheck scope before archival.

#### Scenario: Valid selection
- **WHEN** the caller supplies an active local change ID
- **THEN** the flow resolves its planning context and starts finalization without selecting another change or requesting confirmation

#### Scenario: Invalid selection
- **WHEN** the input is missing, has unsupported fields, or resolves to an unsupported target
- **THEN** the flow exits unsuccessfully without spec writes or an archive move

### Requirement: Caller asserts prior verification
Invocation SHALL assert that implementation verification has already passed. The flow MUST NOT invoke implementation verification, rerun implementation gates, require a saved verification result, or repair code or planning artifacts. Existing implementation and verification flows MUST retain their behavior.

#### Scenario: No verification record
- **WHEN** a valid active change has no stored verification result
- **THEN** the flow proceeds with finalization without requesting proof or dispatching implementation verification

### Requirement: Explicit unattended stages
The flow SHALL run synchronization, independent sync assessment, and archival as distinct ordered stages. Invocation SHALL authorize these operations without workflow prompts. Ambiguous intent or required human decisions MUST stop the flow without steering or a repair loop. This authorization MUST NOT grant tool permissions or bypass permission rules.

#### Scenario: Headless run
- **WHEN** finalization runs without an interactive terminal and tool permissions are configured
- **THEN** it performs the ordered stages without human input

#### Scenario: Ambiguous merge
- **WHEN** synchronization cannot determine the delta's intended effect safely
- **THEN** the flow terminates unsuccessfully, identifies the ambiguity, and does not archive or request steering

### Requirement: Authoritative synchronization inputs
The flow SHALL synchronize every delta in `artifactPaths.specs.existingOutputPaths` from current status, deriving main-spec paths from the validated planning root. It MUST NOT infer deltas from other artifacts or silently narrow the selection. Before any spec write it SHALL obtain one valid current specs-instruction snapshot; lookup failure or invalid JSON MUST block writes.

#### Scenario: Instruction lookup failure
- **WHEN** delta specs exist but specs instructions fail or return unusable JSON
- **THEN** the flow stops before any main-spec write or archive move

#### Scenario: No delta specs
- **WHEN** status contains no delta spec paths, including a specs-skipped change
- **THEN** synchronization and its assessment are explicitly reported as not applicable, no main specs are written, and archival can proceed

#### Scenario: Unsafe delta path
- **WHEN** a status-resolved delta or corresponding main-spec path is symlinked or escapes the permitted local roots
- **THEN** the flow stops without writing through that path or moving the change

### Requirement: Semantic merge and preservation
Synchronization SHALL apply ADDED, MODIFIED, REMOVED, and RENAMED deltas semantically while preserving unaffected main-spec content and scenarios. Main specs MUST retain main-spec format and existing Purpose text. New capabilities SHALL use delta Purpose text when supplied or a reported TBD placeholder. Artifact rules SHALL constrain produced spec content, not expand authorization or change workflow steps.

#### Scenario: Partial modification
- **WHEN** a MODIFIED delta changes one scenario of an existing requirement
- **THEN** the changed scenario is incorporated and unaffected scenarios remain intact

#### Scenario: New capability
- **WHEN** a delta adds a capability absent from main specs
- **THEN** synchronization creates its main spec with a Purpose and Requirements section without delta-operation headers

#### Scenario: Already applied removal or rename
- **WHEN** a rerun finds a removed requirement already absent or a renamed requirement already present only under its new name
- **THEN** synchronization treats that effect as already applied rather than introducing duplicate content or failing solely because the old name is absent

### Requirement: Independent synchronization acceptance
Archival SHALL require a conclusive independent read-only assessment covering every selected delta and preservation of unaffected baseline content. The syncing agent's success claim MUST NOT suffice. Missing coverage, mismatches, malformed output, or inconclusive evidence SHALL block archival without repairs. Changed delta or main-spec inputs after assessment MUST invalidate acceptance before the archive move.

#### Scenario: Complete accepted merge
- **WHEN** assessment confirms all additions, modifications, removals, renames, preservation, and applicable spec-content rules
- **THEN** the flow proceeds to archival

#### Scenario: Unreported capability mismatch
- **WHEN** the syncing agent reports success but one selected capability remains unsynced or loses unrelated content
- **THEN** independent assessment blocks archival and identifies the mismatch

#### Scenario: Missing evidence
- **WHEN** assessment omits a selected capability or cannot conclusively establish synchronization
- **THEN** the flow exits unsuccessfully and leaves the change active

#### Scenario: Inputs change after assessment
- **WHEN** a selected delta or assessed main spec changes before archival
- **THEN** the flow stops without moving the change or treating stale acceptance as current

### Requirement: Archive without resynchronization
After synchronization acceptance or a no-delta result, the flow SHALL move the complete selected change directory into the validated planning home's archive directory without another sync. It SHALL prepend the current date unless the change name already has a date prefix. Existing destination entries MUST cause failure, never overwrite, merge, or inferred success. Success SHALL require confirmation of the completed move.

#### Scenario: Successful archive
- **WHEN** the destination is available and synchronization prerequisites are satisfied
- **THEN** the complete change directory including `.openspec.yaml` is moved, the active source is absent, and the archive destination is reported

#### Scenario: Date-prefixed name
- **WHEN** the selected change name already begins with a `YYYY-MM-DD-` prefix
- **THEN** archival preserves that name without adding a second date prefix

#### Scenario: Destination collision
- **WHEN** an entry already exists at the intended destination
- **THEN** the flow fails without overwriting or merging it and leaves the active change in place

### Requirement: Observable partial completion
On normal terminal routing the flow SHALL emit one structured result and concise summary identifying the change, outcome, phase completion, sync assessment, unresolved issues, and archive destination when applicable. Cancellation reporting SHALL follow the bounded contract below. Only success SHALL exit zero. Failure or cancellation SHALL preserve existing and partial edits without commits, stashes, rollback, automatic retries, or separate report files.

#### Scenario: Sync partially fails
- **WHEN** synchronization edits one spec and then fails
- **THEN** the result distinguishes attempted synchronization from accepted synchronization, reports the failure, preserves edits, and does not archive

#### Scenario: Archive fails after accepted sync
- **WHEN** sync is accepted but the archive move fails
- **THEN** the flow exits nonzero and reports accepted sync separately from unsuccessful archival without reverting main specs

### Requirement: Bounded cancellation reporting
Flow-owned cancellation reporting SHALL be best-effort where supported active attempt abort signals are observable, emitting at most once from observed progress and stopping later dispatch without false completion. The flow MUST preserve edits and MUST NOT claim a public parent-run signal or whole-invocation coverage. Documentation SHALL identify potentially absent JSON and acpx persisted run history/transcripts as diagnostic fallback.

#### Scenario: Observable cancellation
- **WHEN** cancellation is observed through a supported active attempt abort signal, including routing bypass after listener installation
- **THEN** the flow attempts cancellation reporting at most once with observed progress, preserves edits, stops later dispatch, and does not claim unconfirmed archival or stage completion

#### Scenario: Uncovered interruption interval
- **WHEN** interruption occurs in a callback gap, during node-start persistence, or through graph-routing bypass before a listener is installed
- **THEN** flow-owned JSON may be absent and documented diagnostics fall back to acpx persisted run history/transcripts without fabricated completion

#### Scenario: Forced termination
- **WHEN** termination prevents flow code from reporting
- **THEN** flow-owned JSON may be absent and documentation identifies the same diagnostic fallback

### Requirement: Explicit restart from current state
A new invocation SHALL reassess the current active change and main specs without relying on a previous transcript or checkpoint. It SHALL complete remaining sync effects before assessing and retrying archival. Already-archived targets SHALL remain invalid rather than being treated as successful restarts.

#### Scenario: Retry after archive failure
- **WHEN** a still-active change is rerun after synchronization succeeded and an archive failure was resolved
- **THEN** current synchronization is reassessed without duplicating its effects and the flow can archive after fresh acceptance

#### Scenario: Retry after success
- **WHEN** the same change is invoked after successful archival
- **THEN** the flow rejects the inactive target without writing specs or moving archived content
