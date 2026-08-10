## ADDED Requirements

### Requirement: Agent-submitted results
A flow SHALL be able to give a flow-agent a structured result channel. When `af.createAgent` is called with a `resultSchema`, the sub-agent SHALL have a `submit_result` tool available that accepts a single `value` and validates it against `resultSchema`. When `resultSchema` is not provided, the sub-agent SHALL NOT have the `submit_result` tool, and the handle's submitted result SHALL be undefined.

#### Scenario: Submit tool injected when schema provided
- **WHEN** a script calls `af.createAgent({ name, resultSchema: <schema> })`
- **THEN** the sub-agent has a `submit_result` tool whose `value` is validated against the provided schema

#### Scenario: No submit tool without schema
- **WHEN** a script calls `af.createAgent({ name })` without `resultSchema`
- **THEN** the sub-agent has no `submit_result` tool and reading the handle's submitted result yields undefined

#### Scenario: Malformed submission is rejected and retried
- **WHEN** the sub-agent calls `submit_result` with a `value` that does not conform to `resultSchema`
- **THEN** the submission is rejected with a descriptive error that the sub-agent can observe, allowing it to retry with a conforming value

### Requirement: Typed submitted-result accessor
The flow-agent handle SHALL expose `submittedResult(): T | undefined`, where `T` is the flow-declared generic (compile-time only). It SHALL return the value most recently accepted by `submit_result`, or undefined if none has been submitted. The returned value SHALL be a deep copy such that mutating it does not affect the handle's stored value.

#### Scenario: Read the submitted value
- **WHEN** a sub-agent has submitted a value via `submit_result` and the flow reads `submittedResult()`
- **THEN** the flow receives the submitted value typed as the flow-declared generic

#### Scenario: Copy semantics
- **WHEN** the flow mutates the value returned by `submittedResult()`
- **THEN** the handle's stored value is unchanged

#### Scenario: No submission yields undefined
- **WHEN** no value has been submitted (or the result was cleared) and the flow reads `submittedResult()`
- **THEN** it returns undefined

### Requirement: Explicit result reset
The flow-agent handle SHALL expose `clearResult(): void`, which SHALL reset the stored submitted value to undefined. The system SHALL NOT automatically reset the submitted value, including at the start of `sendMessage` or when a steering message is delivered; freshness is the flow's responsibility.

#### Scenario: Clear the submitted result
- **WHEN** a flow calls `clearResult()` after a submission and then reads `submittedResult()`
- **THEN** it returns undefined

#### Scenario: No automatic reset across message steps
- **WHEN** a sub-agent submits a value, the flow sends another `sendMessage` without calling `clearResult()`, and then reads `submittedResult()`
- **THEN** the previously submitted value is still returned

### Requirement: Unchanged conversational result channel
The flow-agent handle SHALL continue to expose `result` as the last step's final assistant text and `sendMessage` SHALL continue to resolve with the final assistant text. The submitted result is a separate channel and SHALL NOT replace the conversational text.

#### Scenario: sendMessage still returns text
- **WHEN** a flow calls `sendMessage` on a handle whose agent has also submitted a result
- **THEN** `sendMessage` resolves with the final assistant text, and the submitted result is independently readable via `submittedResult()`

### Requirement: Submitted-result visibility
When a flow-agent submits a result, the system SHALL surface a brief notification in the Orchestrator that reflects the submission.

#### Scenario: Submission shown in the Orchestrator
- **WHEN** a sub-agent calls `submit_result` while the Orchestrator is displayed
- **THEN** a brief log line reflecting the submission is shown on the agent row