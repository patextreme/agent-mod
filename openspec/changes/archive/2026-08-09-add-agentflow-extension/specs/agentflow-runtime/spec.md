## Purpose

Provides the scripted orchestration layer that discovers, loads, and executes AgentFlow scripts which spawn and drive isolated sub-agent sessions and deliver a result back to the main session.

## ADDED Requirements

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

### Requirement: Flow-agent prompt steps
The handle returned by `af.createAgent` SHALL expose `sendPrompt(text, opts?)`, `sendSteer(text)`, and `sendFollowUp(text)`, each SHALL send a message to the sub-agent and block until the step fully completes, resolving with the final assistant text. Sequential `sendPrompt` calls SHALL share the same sub-agent conversation. `sendSteer` SHALL deliver with steering behavior and `sendFollowUp` with follow-up behavior.

#### Scenario: Sequential prompts share context
- **WHEN** a script calls `sendPrompt("Task A")` and then `sendPrompt("Task B")` on the same handle
- **THEN** Task B runs in the same sub-agent conversation and sees Task A's context

#### Scenario: Steer and follow-up delivery modes
- **WHEN** a script calls `sendSteer` and `sendFollowUp` on a handle
- **THEN** the messages are delivered with steering and follow-up streaming behavior respectively

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