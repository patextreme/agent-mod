# openspec-groom Specification

## Purpose

Coordinate bounded grooming of existing OpenSpec changes through structural validation, semantic review, safe planning repairs, and human steering for consequential decisions.

## Requirements

### Requirement: Local active change input
The grooming flow SHALL accept a `changeId` for an existing active change in the local OpenSpec workspace resolved from the invocation directory. It MUST reject missing, archived, or non-local changes before attempting revisions.

#### Scenario: Valid active change
- **WHEN** grooming receives an existing active local change ID
- **THEN** it resolves that change's existing planning-artifact paths and starts validation

#### Scenario: Invalid target
- **WHEN** the target is missing, archived, or belongs to an alternate store
- **THEN** grooming exits unsuccessfully without editing artifacts

### Requirement: Structural validation and repair
The flow SHALL validate before every semantic review and after each revision. It SHALL attempt to repair validation errors in existing planning artifacts within the shared revision budget. If repair requires creating missing artifacts, it MUST stop unsuccessfully and explain the missing-artifact limitation.

#### Scenario: Mechanical validation error
- **WHEN** an existing artifact has a repairable structural error
- **THEN** grooming assesses and repairs it before restarting validation

#### Scenario: Missing artifact required for repair
- **WHEN** resolving validation errors requires creating a missing planning artifact
- **THEN** grooming stops without creating it and identifies what is missing

### Requirement: Critical-only semantic completion
The flow SHALL perform semantic review using the `openspec-review` criteria and classify its prose through a decision node as `critical`, `clear`, or `inconclusive`. It SHALL succeed only after validation passes and a conclusive review contains no Critical findings. Major findings, other blockers, and review readiness labels MUST NOT independently prevent completion.

#### Scenario: No Critical findings
- **WHEN** validation passes and a conclusive review has Major findings but no Critical findings, including an outstanding product or architecture decision
- **THEN** grooming succeeds and reports remaining findings without claiming implementation readiness, and that Major decision does not independently reach repair or human steering

#### Scenario: Critical findings present
- **WHEN** the review contains a Critical finding
- **THEN** grooming enters resolution assessment rather than reporting success

#### Scenario: Ambiguous review
- **WHEN** the review output is incomplete, unusable, or indeterminate about whether Critical findings exist, rather than merely reporting an unresolved change decision
- **THEN** the decision is inconclusive and grooming fails rather than assuming it is clear

### Requirement: Consequential decisions require steering
The flow SHALL attempt autonomous corrections grounded in existing intent and project conventions. It MUST escalate architectural, design, product, high-stakes, or materially conflicting decisions. This policy SHALL apply to both structural and Critical-finding repairs. All escalated issues in a cycle MUST be resolved by human steering before any fixes from that cycle are applied together.

#### Scenario: Autonomous correction
- **WHEN** all proposed repairs follow established intent without a consequential decision
- **THEN** grooming proceeds to one coordinated update attempt without requesting steering

#### Scenario: Mixed repairs
- **WHEN** a cycle includes both mechanical corrections and a product decision
- **THEN** grooming conclusively identifies all escalated decisions with recommendations without choosing their answers and waits for steering before applying any cycle fixes

### Requirement: Interactive steering contract
When steering is needed, the flow SHALL require an interactive terminal and allow seven days for the steering step. It SHALL require answers covering every escalated issue; blank or incomplete input MUST NOT authorize an update. Cancellation, timeout, or absence of a terminal SHALL terminate unsuccessfully without that cycle's edits.

#### Scenario: Complete steering
- **WHEN** the human answers every escalated issue before the seven-day deadline
- **THEN** the flow authorizes the corresponding resolutions and proceeds to update

#### Scenario: Incomplete steering
- **WHEN** the human submits blank input or leaves an escalated issue unanswered
- **THEN** the flow requests the missing steering without applying fixes

#### Scenario: Steering unavailable
- **WHEN** steering is required but no terminal is available, or the human cancels or times out
- **THEN** the flow terminates with the applicable non-success outcome and preserves prior cycles' edits

### Requirement: Scoped update authorization
The flow SHALL use a dedicated flow-owned updater prompt to authorize revisions of existing planning artifacts without per-artifact confirmation, limited to assessed structural or Critical resolutions and supplied human steering. It MUST NOT invoke or modify the built-in `openspec-update-change` skill for autonomous repairs, nor override its confirmation policy through wrapper instructions. Ordinary invocations of that skill MUST remain unchanged and require confirmation for every artifact revision. Authorization MUST NOT grant tool permissions, create missing artifacts, or permit unrelated edits.

#### Scenario: Authorized grooming update
- **WHEN** the flow supplies explicit authorization and the assessed resolutions with any required steering
- **THEN** a fresh Pi session receives the flow-owned updater prompt and applies only those planning revisions without additional artifact confirmation or invoking the built-in update skill

#### Scenario: Ordinary update invocation
- **WHEN** the built-in `openspec-update-change` skill is invoked ordinarily
- **THEN** its unchanged policy shows each proposed artifact revision and waits for human confirmation before writing

#### Scenario: Invalid cycle authorization
- **WHEN** the authorized change or paths do not match the selected change's existing planning artifacts, steering is incomplete, or a required artifact is missing
- **THEN** the updater stops without applying any cycle fixes and explains the limitation

### Requirement: Fresh Pi phases
The flow SHALL use Pi with a fresh agent session for every phase in every cycle, including review, decisions, assessment, and updates. Reviewers SHALL receive only the change ID as run-specific input. Other phases SHALL receive only current-cycle inputs needed for their task, including current findings and steering, and MUST NOT receive previous-cycle transcripts.

#### Scenario: New cycle
- **WHEN** grooming starts another validation/review cycle
- **THEN** every agent phase starts fresh and the reviewer rereads the change using its ID without prior-cycle findings or transcripts

### Requirement: Shared bounded revision budget
The flow SHALL allow at most ten update attempts shared across structural and Critical repairs. Each updater invocation SHALL consume one attempt. It SHALL verify after attempt ten without allowing further updates, succeed if verification is clear, and otherwise report budget exhaustion. Repeated findings SHALL be reassessed through fresh phases without a separate early-stop rule.

#### Scenario: Mixed repair budget
- **WHEN** two structural repairs and eight Critical repairs have been attempted
- **THEN** no further update is allowed but final validation and, if valid, semantic review still occur

#### Scenario: Final update converges
- **WHEN** validation passes and review finds no Critical issues after update attempt ten
- **THEN** grooming reports success

#### Scenario: Final update does not converge
- **WHEN** validation errors or Critical findings remain after attempt ten
- **THEN** grooming reports budget exhaustion with unresolved issues and no eleventh update

### Requirement: Observable outcomes and safe edits
The flow SHALL emit a concise terminal summary and structured result distinguishing success, budget exhaustion, unavailable steering, cancellation, and failure. Non-success outcomes MUST exit unsuccessfully. It MUST preserve prior edits, perform no commits, stashes, or rollback, and restrict writes to the selected change's existing planning artifacts. It SHALL retain transcripts through acpx without creating separate report files or retrying failed phases automatically.

#### Scenario: Successful summary
- **WHEN** grooming converges
- **THEN** the result identifies the change, consumed attempts, and remaining non-Critical findings

#### Scenario: Agent or command failure
- **WHEN** an agent fails, a command fails operationally, or a phase output cannot be used safely
- **THEN** grooming stops with a failure summary, nonzero exit status, and preserved edits without automatic retry

#### Scenario: Dirty working tree
- **WHEN** grooming starts with existing working-tree modifications
- **THEN** it preserves them, performs no Git state management, and makes only authorized revisions inside the selected change's planning artifacts
