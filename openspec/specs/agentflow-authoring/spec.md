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