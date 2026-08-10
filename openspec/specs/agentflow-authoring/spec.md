# Agentflow Authoring Specification

## Purpose

Makes AgentFlow scripts safe and productive to author by giving them real type safety, an on-the-fly authoring skill for the orchestrating LLM, and a working example to model flows on.

## Requirements

### Requirement: Type declarations for the `af` surface
The system SHALL ship a TypeScript declaration file (`agentflow.d.ts`) that fully declares the injected `af` object, the flow-agent handle, its config, and the result of each prompt step. The declaration SHALL be referenceable by script authors.

#### Scenario: Script type-checks against the declarations
- **WHEN** a `.ts` flow script references the shipped `agentflow.d.ts` and is checked with `tsc --noEmit`
- **THEN** the script type-checks against the declared `af` surface, flagging invalid calls

### Requirement: TypeScript is the first-class authoring format
The system SHALL support `.ts` flow scripts as the primary authoring format and SHALL validate them with the TypeScript compiler before execution. `.js` scripts SHALL remain supported with syntax validation.

#### Scenario: TypeScript script is type-checked before execution
- **WHEN** a `.ts` flow script is invoked
- **THEN** it is type-checked against the `af` declarations before any execution

### Requirement: Authoring skill
The system SHALL ship a skill that documents the `af` scripting surface, the script authoring conventions, the type-safety and validation workflow, and includes a complete worked example. The skill SHALL be loadable by the main-session LLM on demand to author or modify flow scripts.

#### Scenario: LLM loads the authoring skill
- **WHEN** the main-session LLM needs to author or modify a flow script
- **THEN** it can load the shipped skill to learn the `af` surface and conventions

### Requirement: Example flow script
The system SHALL ship a working example flow script (a `reviewcode` flow) that demonstrates `af.createAgent`, sequential `sendMessage` steps, `af.log`, and `af.result`, and that type-checks and runs correctly.

#### Scenario: Example script runs
- **WHEN** the shipped example flow is invoked
- **THEN** it runs without error, drives its sub-agents, and delivers a result to the main session

### Requirement: Typed result declarations in `agentflow.d.ts`
The shipped `agentflow.d.ts` SHALL declare the submitted-result surface: `af.createAgent` SHALL accept an optional `resultSchema` (a TypeBox `TSchema`) in its config, and the flow-agent handle SHALL be generic (`FlowAgent<T>`), exposing `submittedResult(): T | undefined` and `clearResult(): void`. The declarations SHALL reference the `typebox` `TSchema` type so `resultSchema` is type-checkable.

#### Scenario: Script type-checks against the new surface
- **WHEN** a `.ts` flow script uses `af.createAgent<MyVal>({ name, resultSchema: af.Type.Array(af.Type.String()) })`, reads `agent.submittedResult()` typed as `MyVal | undefined`, and calls `agent.clearResult()`, then is checked with `tsc --noEmit`
- **THEN** the script type-checks against the declared `af` surface

### Requirement: `af.Type` exposes the TypeBox type builder
Flow scripts cannot `import`, so the `af` surface SHALL expose the TypeBox `Type` namespace as `af.Type` so a script can construct a `resultSchema` value. The `agentflow.d.ts` declarations SHALL declare `Type: typeof Type` (from `typebox`) on the `AgentFlow` interface.

#### Scenario: Script builds a result schema via `af.Type`
- **WHEN** a flow script declares `resultSchema: af.Type.Object({ steps: af.Type.Array(af.Type.String()) })` and passes it to `af.createAgent`
- **THEN** the schema value is constructed from the `af.Type` namespace and accepted as the agent's `resultSchema`

### Requirement: Authoring skill documents result orchestration
The authoring skill SHALL document the `submit_result` tool, `resultSchema`, `submittedResult()`, and `clearResult()`, and SHALL include at least one orchestration pattern (loop control and/or fan-out over a submitted array) that a script author can model flows on.

#### Scenario: Skill covers result orchestration
- **WHEN** the main-session LLM loads the authoring skill to learn how a flow reads an agent-submitted result
- **THEN** the skill documents the result surface and at least one loop-control or fan-out pattern