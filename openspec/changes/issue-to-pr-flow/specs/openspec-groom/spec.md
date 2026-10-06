# openspec-groom Spec Delta

## MODIFIED Requirements

### Requirement: Local active change input
The grooming flow SHALL accept a `changeId` for an existing active change in the local OpenSpec workspace resolved from the invocation directory by default, or an explicitly supplied workspace when embedded. It MUST reject missing, archived, or non-local changes before attempting revisions.

#### Scenario: Valid active change
- **WHEN** grooming receives an existing active local change ID
- **THEN** it resolves that change's existing planning-artifact paths and starts validation

#### Scenario: Invalid target
- **WHEN** the target is missing, archived, or belongs to an alternate store
- **THEN** grooming exits unsuccessfully without editing artifacts

### Requirement: Interactive steering contract
By default, when steering is needed, the flow SHALL require an interactive terminal and allow seven days for the steering step. It SHALL require answers covering every escalated issue; blank or incomplete input MUST NOT authorize an update. Cancellation, timeout, or absence of a terminal SHALL terminate unsuccessfully without that cycle's edits. Embedded callers SHALL be able to supply scoped steering, including durable pending questions and validated later answers, without changing authorization or allowing partial answers.

#### Scenario: Complete steering
- **WHEN** the human answers every escalated issue before the seven-day deadline
- **THEN** the flow authorizes the corresponding resolutions and proceeds to update

#### Scenario: Incomplete steering
- **WHEN** the human submits blank input or leaves an escalated issue unanswered
- **THEN** the flow requests the missing steering without applying fixes

#### Scenario: Steering unavailable
- **WHEN** steering is required but no terminal or hosted handling is available, or the human cancels or times out
- **THEN** the flow terminates with the applicable non-success outcome and preserves prior cycles' edits

### Requirement: Shared bounded revision budget
The flow SHALL allow at most ten update attempts shared across structural and Critical repairs. Hosted continuation SHALL conserve consumed attempts and account for each dispatch before it starts; default standalone invocations SHALL begin with a fresh budget. Each updater invocation SHALL consume one attempt. It SHALL verify after attempt ten without allowing further updates, succeed if verification is clear, and otherwise report budget exhaustion. Repeated findings SHALL be reassessed through fresh phases without a separate early-stop rule.

#### Scenario: Mixed repair budget
- **WHEN** two structural repairs and eight Critical repairs have been attempted
- **THEN** no further update is allowed but final validation and, if valid, semantic review still occur

#### Scenario: Final update converges
- **WHEN** validation passes and review finds no Critical issues after update attempt ten
- **THEN** grooming reports success

#### Scenario: Final update does not converge
- **WHEN** validation errors or Critical findings remain after attempt ten
- **THEN** grooming reports budget exhaustion with unresolved issues and no eleventh update
