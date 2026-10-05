# openspec-implement Specification

## Purpose

Coordinate implementation of an approved local OpenSpec change through bounded repairs and human steering, using task completion and quality-gate evidence rather than independent verification.

## Requirements

### Requirement: Explicit local change selection
The flow SHALL require a `changeId` identifying an active repo-local change and reject missing, invalid, archived, store-backed, symlinked, or escaping targets before implementation.

#### Scenario: Valid selection
- **WHEN** the input identifies an active local change
- **THEN** the flow selects that change explicitly without asking an agent to infer a target

#### Scenario: Unsupported selection
- **WHEN** the input is invalid or resolves to an unsupported target
- **THEN** the flow exits unsuccessfully before dispatching implementation

### Requirement: Apply contract and delegation
The implementer SHALL follow current OpenSpec apply instructions, read their context files, respect controlling state and project constraints, and update tasks as they finish. Multiple substantive task groups SHALL be delegated to subagents; dependent groups SHALL be sequenced and only independent groups SHALL run concurrently.

#### Scenario: Non-trivial change
- **WHEN** remaining work contains multiple substantive task groups
- **THEN** the implementer delegates those groups with scoped ownership, orders dependencies, and consolidates their results

#### Scenario: Blocked apply
- **WHEN** apply instructions report missing artifacts or conflicting controlling inputs
- **THEN** the implementer reports the blocker without bypassing the blocked state or inventing authorization

### Requirement: Task and gate completion judgment
The judge SHALL classify each implementer result as `completed`, `repairable_pause`, or `escalation_required` using the current task list, summary, and applicable gate evidence. Completion SHALL require all tasks complete and all applicable gates passing. The judge SHALL NOT perform an independent implementation verification review.

#### Scenario: Supported completion
- **WHEN** all tasks are complete and current applicable gate results pass
- **THEN** the judge declares completion and the flow exits successfully without archiving

#### Scenario: Unsupported completion claim
- **WHEN** a summary claims completion but tasks remain or applicable gate evidence is absent, stale, or failing
- **THEN** the judge does not declare completion and routes the issue for repair or escalation

#### Scenario: Initially completed tasks
- **WHEN** apply reports all tasks already done
- **THEN** the flow still requires applicable passing gate evidence before declaring completion

### Requirement: Repair authority
Repairs SHALL remain within the approved design unless explicit human steering authorizes scoped plan changes. Unfinished tasks, implementation errors, and failing tests within that design SHALL be repairable; ambiguous requirements, design changes, destructive actions, and missing external access SHALL require escalation.

#### Scenario: Autonomous repair
- **WHEN** a failing test can be fixed within the approved design
- **THEN** the flow dispatches a repair without requesting a new human decision

#### Scenario: Consequential blocker
- **WHEN** resolving a blocker requires changing the approved design
- **THEN** the flow requests human steering before making that change

### Requirement: Human steering
For escalation with repair budget remaining, the flow SHALL present consequential blockers and collect explicit human guidance before continuing. Guidance SHALL authorize plan edits only when explicitly scoped to those edits. Cancellation or unavailable input SHALL terminate unsuccessfully while preserving earlier edits.

#### Scenario: Steering provided
- **WHEN** the human explicitly authorizes a scoped plan adjustment
- **THEN** the next repair receives that authorization and addresses the blocker within its scope

#### Scenario: Steering cancelled
- **WHEN** the human cancels or input cannot be collected
- **THEN** no repair is dispatched and earlier edits remain intact

### Requirement: Bounded repair loop
The flow SHALL allow an initial apply plus at most ten repair dispatches, counting failed repair attempts. It SHALL judge each normal repair result, including the tenth. If that final judgment is not completed, it SHALL exit `limit_reached` without another escalation or repair.

#### Scenario: Completion on last repair
- **WHEN** repair ten returns normally and the judge declares completion
- **THEN** the flow exits successfully with ten repair attempts

#### Scenario: Exhausted budget
- **WHEN** repair ten returns normally and the judge declares either pause category
- **THEN** the flow exits `limit_reached` without collecting more steering

### Requirement: Failure distinction and terminal reporting
Invocation failures, unusable judge results, and cancellation SHALL terminate unsuccessfully rather than being silently retried. Normal summaries reporting implementation blockers SHALL enter judging. Terminal results SHALL include change identity, outcome, repair attempt count, summary, and remaining work or blockers; unsuccessful outcomes SHALL produce a nonzero exit.

#### Scenario: Reported implementation error
- **WHEN** an implementer returns normally with a failing gate or implementation error
- **THEN** the judge decides between repair and escalation

#### Scenario: Agent invocation failure
- **WHEN** an agent invocation fails instead of returning a usable result
- **THEN** the flow reports failure, preserves edits, and does not silently retry

### Requirement: Preserve user work
The flow SHALL preserve earlier edits on every unsuccessful exit and SHALL NOT automatically commit, stash, roll back, archive, or resume a prior run. A new invocation SHALL start with a fresh repair budget against the current working tree.

#### Scenario: Restart after limit
- **WHEN** the user explicitly reruns a change after budget exhaustion
- **THEN** existing edits are retained and the new run starts with zero repair attempts
