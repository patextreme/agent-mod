# openspec-verify Spec Delta

## MODIFIED Requirements

### Requirement: Explicit implemented local target
The flow SHALL require an explicit active repository-local change identifier and completed implementation tasks before starting verification. It MUST reject archived, store-backed, symlinked, escaping, missing, or unusable targets without dispatching verification or repair. Hosted callers SHALL be able to supply the canonical local workspace without changing process-global cwd.

#### Scenario: Completed target
- **WHEN** an explicit active local change has a usable task snapshot with all tasks complete
- **THEN** verification starts for that change in the selected repository

#### Scenario: Incomplete implementation
- **WHEN** the selected change has unchecked implementation tasks
- **THEN** the flow exits unsuccessfully with an incomplete-implementation diagnostic and dispatches no verifier or repairer

#### Scenario: Invalid target
- **WHEN** selection is omitted or resolves to an archived, store-backed, symlinked, escaping, missing, or unusable target
- **THEN** the flow fails before any agent is dispatched

### Requirement: Consequential human steering
Ambiguous requirements, design changes, destructive actions, and missing external access SHALL require explicit human steering before repair. A batch containing consequential and mechanical issues MUST await steering before any repairs. Guidance MUST retain its stated scope across fresh sessions and MUST NOT waive required verification evidence. Hosted callers SHALL be able to supply equivalent scoped handling, including durable pending questions and validated later answers.

#### Scenario: Mixed repair batch
- **WHEN** assessment identifies both mechanical fixes and a design decision requiring human input
- **THEN** no repairs start until explicit steering addresses every escalated issue

#### Scenario: Input unavailable
- **WHEN** required steering cannot be collected because an interactive terminal is unavailable and no hosted handling is supplied
- **THEN** the flow exits as needs_human without dispatching the pending repair

#### Scenario: Scoped authorization
- **WHEN** a human authorizes a particular resolution
- **THEN** fresh repair and assessment sessions receive relevant guidance without expanding it to unrelated decisions or tool permissions

### Requirement: Bounded repair convergence
The initial verification SHALL consume no repair budget. The flow SHALL allow at most ten repair dispatches, counting failed dispatches. Hosted continuation SHALL conserve consumed repairs, account for dispatch before it starts and obtain fresh verification on re-entry; standalone invocations SHALL retain fresh budgets. Every normally returning repair MUST receive fresh verification before budget exhaustion is enforced. Blocking findings after repair ten SHALL produce limit_reached; phase failure SHALL retain its failure outcome.

#### Scenario: Tenth repair resolves findings
- **WHEN** repair ten returns normally and fresh verification is accepted
- **THEN** the flow succeeds with ten repair attempts

#### Scenario: Tenth repair leaves findings
- **WHEN** fresh verification after repair ten still identifies blocking findings
- **THEN** the flow exits as limit_reached without an eleventh repair

#### Scenario: Tenth repair crashes
- **WHEN** the tenth repair invocation fails
- **THEN** the dispatch is counted and the flow exits as failed rather than limit_reached
