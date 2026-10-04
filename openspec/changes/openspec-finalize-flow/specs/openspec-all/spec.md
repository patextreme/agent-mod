# Spec Delta

## Purpose

Run grooming, implementation, verification, and finalization of one active local OpenSpec change in a single invocation while preserving stage policies and transparent human escalation.

## ADDED Requirements

### Requirement: Explicit local pipeline target
The flow SHALL accept only an explicit `changeId` naming an active repo-local change resolved from the invocation directory. All stages MUST operate on that same change and canonical workspace. Missing, archived, store-backed, symlinked, escaping, or unsupported input SHALL fail before any stage writes.

#### Scenario: Selected active change
- **WHEN** the caller supplies a supported active local change
- **THEN** the flow starts grooming and keeps that change and workspace identity throughout the pipeline

#### Scenario: Unsupported selection
- **WHEN** input is missing, includes unsupported fields, or selects an unsupported target
- **THEN** the flow exits unsuccessfully without starting a write-capable stage

### Requirement: Ordered single-invocation composition
The flow SHALL compose grooming, implementation, verification, and finalization in that order under one invocation. Each later stage MUST begin only after a validated successful result from its predecessor. Missing, malformed, contradictory, or unsuccessful results MUST prevent later stages from starting. No additional stage-transition confirmation SHALL be required.

#### Scenario: Successful pipeline
- **WHEN** grooming, implementation, and verification each succeed
- **THEN** the flow runs finalization and reports overall success only after finalization succeeds

#### Scenario: Verification blocks progress
- **WHEN** verification returns an unsuccessful outcome
- **THEN** finalization does not start and the change is not synced or archived by the pipeline

#### Scenario: Missing stage result
- **WHEN** a stage ends without a usable successful result
- **THEN** the pipeline reports failure rather than inferring success from completion of execution

### Requirement: Constituent behavior preservation
Composition SHALL preserve each constituent flow's acceptance policy, authorized edit scope, fresh-session behavior, timeouts, and separate revision or repair budget. It MUST NOT weaken verification or substitute implementation completion for verification acceptance. Existing standalone flows SHALL remain independently invocable with unchanged behavior.

#### Scenario: Independent repair budgets
- **WHEN** implementation has consumed repairs before verification starts
- **THEN** verification starts with its own fresh repair budget and does not count implementation repairs

#### Scenario: Verification acceptance remains strict
- **WHEN** implementation succeeds but verification finds a blocking issue or lacks required evidence
- **THEN** the pipeline follows verification's existing repair or escalation behavior instead of proceeding to finalization

### Requirement: Transparent human escalation
Grooming, implementation, and verification SHALL retain their existing human-steering behavior in the invocation terminal, with the active stage, issues, recommendations, and scoped questions visible. Answers MUST reach the originating stage's steering logic without extra workflow confirmations. Composition MUST NOT silently answer, suppress, or broaden escalation authorization.

#### Scenario: Escalation answered
- **WHEN** a constituent stage requires a consequential decision and valid complete steering is supplied
- **THEN** that stage continues within the supplied authorization and the pipeline advances only after its eventual success

#### Scenario: Incomplete steering
- **WHEN** steering leaves a required issue unanswered
- **THEN** the constituent stage retains its existing incomplete-answer handling and the pipeline does not authorize that cycle's edits or advance

#### Scenario: No terminal available
- **WHEN** a stage needs steering but an interactive terminal is unavailable
- **THEN** the pipeline reports `needs_human`, preserves prior edits, and leaves all later stages unstarted

### Requirement: Stop on unsuccessful stage
The pipeline SHALL stop on a constituent outcome of `limit_reached`, `needs_human`, `cancelled`, or `failed`, preserving the outcome and identifying the stage. Unexpected execution errors SHALL fail the pipeline. It MUST NOT automatically restart stages, retry unsuccessful dispatches, or roll back edits; constituent internal repair loops SHALL retain their existing policies.

#### Scenario: Budget exhaustion
- **WHEN** grooming exhausts its existing revision budget
- **THEN** the pipeline reports `limit_reached` at groom and does not start implementation, verification, or finalization

#### Scenario: Operational failure
- **WHEN** a constituent command or agent invocation fails
- **THEN** the pipeline exits unsuccessfully, preserves observed progress, and performs no automatic stage retry

### Requirement: Finalization retains explicit sync and archive
The final stage SHALL use the `openspec-finalize` contract: synchronize all applicable deltas, independently assess synchronization, then archive without another sync. It MUST NOT rerun implementation verification, perform repairs, or ask for human input. An unsuccessful synchronization assessment SHALL block archival and overall pipeline success.

#### Scenario: Implementation verified but sync mismatches
- **WHEN** verification succeeds but finalization's independent sync assessment detects a mismatch
- **THEN** the pipeline stops at finalize without archiving and reports its partial synchronization state

#### Scenario: No applicable deltas
- **WHEN** finalization resolves no delta specs
- **THEN** it reports sync and assessment as not applicable and can archive under the same finalization contract

### Requirement: Aggregate observable outcome
The flow SHALL emit one aggregate flow-owned terminal result and a concise summary identifying the change, overall outcome, active or failed stage, ordered stage statuses, captured constituent results, and known finalization or archive state. Later unstarted stages MUST be explicit. Only success of all four stages SHALL exit zero. Progress and escalation messages MUST remain visible separately from terminal result capture.

#### Scenario: Aggregate success
- **WHEN** all four stages succeed
- **THEN** the aggregate result records every stage's success and the confirmed archive destination without emitting duplicate constituent terminal results

#### Scenario: Partial completion
- **WHEN** implementation fails after grooming succeeded
- **THEN** the result retains the grooming and implementation results and marks verification and finalization as not started

### Requirement: Cancellation preserves observed progress
Orderly interruption SHALL reach the active constituent stage's commands, agents, and steering and stop further stage dispatch. The pipeline SHALL emit its cancelled result once even when normal terminal graph routing is bypassed, preserving observed progress without fabricating absent constituent results. It MUST NOT undo writes or claim unconfirmed archival.

#### Scenario: Interruption during steering
- **WHEN** the caller interrupts an active human-steering step
- **THEN** steering stops, the aggregate result reports cancellation once, and no later stage starts

#### Scenario: Interruption during finalization
- **WHEN** cancellation interrupts sync or the archive stage
- **THEN** the result reports observed finalization progress, preserves partial edits, and does not claim a move completed without confirmation

### Requirement: Explicit restart and independent entrypoints
A new `openspec-all` invocation SHALL start again at groom against the current active tree with fresh stage budgets, without skipping stages using previous results. Users SHALL retain standalone entrypoints for intentional later-stage recovery. Neither pipeline nor finalization SHALL manage Git state or create separate checkpoint/report files. Already-archived targets MUST remain invalid.

#### Scenario: Restart after partial failure
- **WHEN** the caller reruns the pipeline for a still-active change after resolving a failure
- **THEN** grooming begins anew with current files and no automatic stage skipping

#### Scenario: Intentional finalization retry
- **WHEN** the caller invokes standalone finalization for a still-active already-verified change after an archive failure
- **THEN** finalization follows its own restart contract without requiring another full pipeline invocation

#### Scenario: Restart after archival
- **WHEN** the caller selects a change already archived by a successful pipeline
- **THEN** the new invocation rejects the inactive target without editing specs or archived artifacts
