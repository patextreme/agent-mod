# openspec-implement Spec Delta

## MODIFIED Requirements

### Requirement: Explicit local change selection
The flow SHALL require a `changeId` identifying an active repo-local change and reject missing, invalid, archived, store-backed, symlinked, or escaping targets before implementation. Hosted callers SHALL be able to supply the canonical local workspace without changing process-global cwd.

#### Scenario: Valid selection
- **WHEN** the input identifies an active local change
- **THEN** the flow selects that change explicitly without asking an agent to infer a target

#### Scenario: Unsupported selection
- **WHEN** the input is invalid or resolves to an unsupported target
- **THEN** the flow exits unsuccessfully before dispatching implementation

### Requirement: Human steering
For escalation with repair budget remaining, the flow SHALL present consequential blockers and collect explicit human guidance before continuing. Guidance SHALL authorize plan edits only when explicitly scoped to those edits. Hosted callers SHALL be able to supply equivalent scoped steering and durable pending-question handling; no answer or stored transcript SHALL grant unrelated authority. Cancellation or unavailable input SHALL terminate unsuccessfully while preserving earlier edits.

#### Scenario: Steering provided
- **WHEN** the human explicitly authorizes a scoped plan adjustment
- **THEN** the next repair receives that authorization and addresses the blocker within its scope

#### Scenario: Steering cancelled
- **WHEN** the human cancels or input cannot be collected
- **THEN** no repair is dispatched and earlier edits remain intact

### Requirement: Bounded repair loop
The flow SHALL allow an initial apply plus at most ten repair dispatches, counting failed repair attempts. Hosted continuation SHALL conserve consumed repair dispatches and whether the initial apply already occurred; re-entry MUST NOT grant another uncounted initial apply. Dispatch accounting SHALL occur before hosted work starts. It SHALL judge each normal repair result, including the tenth. If that final judgment is not completed, it SHALL exit `limit_reached` without another escalation or repair.

#### Scenario: Completion on last repair
- **WHEN** repair ten returns normally and the judge declares completion
- **THEN** the flow exits successfully with ten repair attempts

#### Scenario: Exhausted budget
- **WHEN** repair ten returns normally and the judge declares either pause category
- **THEN** the flow exits `limit_reached` without collecting more steering

### Requirement: Preserve user work
The flow SHALL preserve earlier edits on every unsuccessful exit and SHALL NOT automatically commit, stash, roll back, archive, or resume a prior run. A new standalone invocation SHALL start with a fresh repair budget against the current working tree. Explicit hosted continuation SHALL instead use the caller's validated cumulative accounting and fresh judgment against current files; durable records and Git management remain the caller's responsibility.

#### Scenario: Restart after limit
- **WHEN** the user explicitly reruns a change after budget exhaustion
- **THEN** existing edits are retained and the new run starts with zero repair attempts
