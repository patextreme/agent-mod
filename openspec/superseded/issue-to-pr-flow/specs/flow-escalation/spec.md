# Flow Escalation Spec Delta

## Purpose

Provide consistent scoped human clarification for flows, supporting the existing live terminal interaction and durable operator-mediated answers without granting new execution authority or claiming native graph resumption.

## ADDED Requirements

### Requirement: Explicit scoped question packets
Escalation SHALL identify the owning attempt, originating phase, pending question IDs, recommendations and the target/request scope for which answers are requested. It MUST distinguish recommendations from human decisions. Required questions SHALL remain unresolved until complete explicit answers are validated.

#### Scenario: Consequential blocker
- **WHEN** a caller requests clarification for a consequential decision
- **THEN** the human sees the question, recommendation and affected scope without a recommendation being treated as consent

### Requirement: Compatible live terminal interaction
The shared interaction SHALL support the existing stdin/readline pattern with visible stderr questions, interactive-terminal checks and nonblank complete answers. Caller-specific timeout, cancellation and unavailable-input outcomes SHALL remain intact. Partial answers MUST NOT authorize a mixed batch, and settled answers MUST reach the originating phase.

#### Scenario: Interactive answer batch
- **WHEN** every pending question receives a valid nonblank terminal answer
- **THEN** the caller receives the complete scoped batch and can continue its existing authorization logic

#### Scenario: Missing terminal or EOF
- **WHEN** input is unavailable or closes before all required answers arrive
- **THEN** no partial batch authorizes work and the caller retains its applicable non-success behavior

### Requirement: Durable operator-mediated answers
A caller opting into asynchronous escalation SHALL persist pending questions before terminating and accept explicit operator answers on a later invocation. The interaction MUST NOT require the original process to remain alive or treat arbitrary GitHub comments as authorized responses. Persistent questions and answers SHALL remain recoverable across process death.

#### Scenario: Answer after process exit
- **WHEN** an operator submits answers for a persisted pending request after the original process has exited
- **THEN** the owning attempt can validate those answers and continue under a new invocation

### Requirement: Answer freshness and identity
Answer acceptance SHALL require matching owner, pending question IDs, record revision and still-applicable target/request scope. Unknown, duplicate, stale or incomplete answers MUST NOT authorize work. Superseded decisions SHALL retain history without silently applying to changed requirements or unrelated blockers.

#### Scenario: Target changes while waiting
- **WHEN** changed target state invalidates the pending question's scope
- **THEN** supplied answers do not authorize action until fresh clarification establishes applicable scope

#### Scenario: Repeated submission
- **WHEN** a previously consumed answer is submitted again
- **THEN** it causes no duplicate action or renewed blanket authorization

### Requirement: Domain authority stays with callers
Shared escalation SHALL collect and validate human direction without choosing repairs, scheduling flow nodes or declaring acceptance. Human decisions MUST NOT waive required verification or CI, grant tool permissions, silently broaden edit scope, or reset consumed budgets. Domain callers SHALL determine applicability and the next safe phase.

#### Scenario: Human requests bypass
- **WHEN** an answer requests success without required evidence
- **THEN** the caller retains its evidence requirements and the answer does not establish acceptance

### Requirement: Compatible adoption and protected storage
Default standalone flows SHALL retain their terminal-only escalation and restart behavior unless a caller explicitly supplies durable handling. Durable records SHALL be written under caller ownership with revision checks, bounded diagnostics and recovery references. Existing PR and OpenSpec authorization policies MUST remain domain-specific.

#### Scenario: Standalone OpenSpec invocation
- **WHEN** no durable handling is supplied
- **THEN** live steering and unavailable-terminal outcomes remain unchanged

#### Scenario: Concurrent pending-state writer
- **WHEN** another writer owns or changes the durable record
- **THEN** the stale writer does not overwrite questions or answers and reports a recoverable conflict
