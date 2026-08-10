# Agentflow Runtime Specification

## Purpose

Provides the scripted orchestration layer that discovers, loads, and executes AgentFlow scripts which spawn and drive isolated sub-agent sessions and deliver a result back to the main session.

## Requirements

### Requirement: Flow script discovery
The system SHALL resolve a flow by name to a script file. It SHALL search the project's `.pi/agentflow/<name>.ts` first, then the project's `.pi/agentflow/<name>.js`, then the global `~/.pi/agentflow/<name>.ts`, then the global `~/.pi/agentflow/<name>.js`. The first match SHALL win.

#### Scenario: Project script preferred over global
- **WHEN** a flow named `reviewcode` exists in both the project `.pi/agentflow/` and the global `~/.pi/agentflow/`
- **THEN** the project script is executed

#### Scenario: JavaScript fallback
- **WHEN** only `.pi/agentflow/quick.js` exists for flow `quick`
- **THEN** the `.js` script is executed

#### Scenario: No script found
- **WHEN** no `.ts` or `.js` file exists for the requested flow name
- **THEN** the invocation reports an error and no script runs

### Requirement: TypeScript-first loading
The system SHALL execute `.ts` flow scripts through a TypeScript-capable loader, and SHALL execute `.js` scripts directly. Both forms SHALL be validated for syntax before execution, and a syntax error SHALL abort the run before any sub-agent is spawned.

#### Scenario: TypeScript script executes
- **WHEN** a `.ts` flow script is invoked
- **THEN** it is loaded through the TypeScript-capable loader and executed

#### Scenario: Syntax error aborts before execution
- **WHEN** the resolved script contains a syntax error
- **THEN** the run is aborted with an error and no sub-agent is created

### Requirement: Project trust gating
The system SHALL refuse to execute a resolved project script when the project is not trusted, reporting an error without running the script or spawning sub-agents.

#### Scenario: Untrusted project script blocked
- **WHEN** the resolved script is project-local and the project is not trusted
- **THEN** execution is blocked with an error and no script runs

### Requirement: Injected `af` scripting surface
The system SHALL execute the script with a single global `af` object injected into scope. The object SHALL expose `createAgent(config)`, `log(...parts)`, `result(value)`, and `cwd`. Scripts SHALL have no other imports or injected globals.

#### Scenario: Workspace is isolated to `af`
- **WHEN** a flow script runs
- **THEN** the only injected identifier available for orchestration is the `af` object

### Requirement: Flow-agent creation
`af.createAgent(config)` SHALL spawn an isolated sub-agent session via the SDK `createAgentSession`, returning a handle. The config SHALL accept `name`, `model`, `tools`, `systemPrompt`, `cwd`, `contextFiles`, and `persist`. Defaults SHALL inherit from the main session; when `persist` is false the sub-session SHALL be in-memory.

#### Scenario: Create a sub-agent with defaults
- **WHEN** a script calls `af.createAgent({ name: "reviewer" })`
- **THEN** an isolated sub-agent session is created inheriting the main session's model, tools, cwd, and system prompt, and is not persisted

#### Scenario: Create a sub-agent with overrides
- **WHEN** a script calls `af.createAgent({ name, model, tools, systemPrompt, cwd, persist: true })`
- **THEN** the sub-agent session uses the overridden model, tools, system prompt, and cwd, and is persisted to a session file

### Requirement: Flow-agent message steps
The handle returned by `af.createAgent` SHALL expose `sendMessage(text, opts?)`, which SHALL send a message to the sub-agent and block until the step fully completes, resolving with the final assistant text. Sequential `sendMessage` calls SHALL share the same sub-agent conversation. When the agent is already streaming, `sendMessage` SHALL queue the message for delivery after the current work settles rather than failing. The public `FlowAgent` interface SHALL NOT expose `sendPrompt`, `sendFollowUp`, or `sendSteer`.

#### Scenario: Sequential messages share context
- **WHEN** a script calls `sendMessage("Task A")` and then `sendMessage("Task B")` on the same handle
- **THEN** Task B runs in the same sub-agent conversation and sees Task A's context

#### Scenario: Message queued while busy
- **WHEN** a script calls `sendMessage` while the agent is already streaming a previous step
- **THEN** the message is queued and delivered after the current work settles, and the call resolves with the final assistant text

#### Scenario: Steering not exposed to scripts
- **WHEN** a flow script is type-checked against the public `FlowAgent` declarations
- **THEN** no `sendSteer`, `sendPrompt`, or `sendFollowUp` method is available on the handle

### Requirement: Flow-agent lifecycle control
The handle SHALL expose `result` (the last step's final assistant text or undefined), `sessionFile` (the session file when persisted, else undefined), `abort()` (cancel the sub-agent mid-run), and `dispose()` (release the sub-session).

#### Scenario: Abort and dispose a sub-agent
- **WHEN** a script calls `abort()` on a running handle and later calls `dispose()`
- **THEN** the sub-agent's current run is cancelled and the sub-session is released

#### Scenario: Inspect handle state
- **WHEN** a script reads `result` and `sessionFile` on a handle after a step on a persisted agent
- **THEN** `result` holds the last step's final assistant text and `sessionFile` holds the session file path

### Requirement: Result delivery to the main session
`af.result(value)` SHALL record the flow's outcome. When the flow completes, the system SHALL inject the recorded result into the main session as a custom message that is visible in the transcript and to the orchestrating LLM. If no result is set, the system SHALL still signal completion without a result.

#### Scenario: Result appears in the main session
- **WHEN** a flow script calls `af.result("review complete")` and the flow finishes
- **THEN** a custom message with content "review complete" is added to the main session and visible to the orchestrating LLM

#### Scenario: No result set
- **WHEN** a flow completes without calling `af.result`
- **THEN** the main session is notified of completion with no injected result

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