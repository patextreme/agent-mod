## MODIFIED Requirements

### Requirement: Type declarations for the `af` surface
The system SHALL ship a TypeScript declaration file (`agentflow.d.ts`) that fully declares the injected `af` object, the flow-agent handle, its config, and the result of each prompt step. The declaration SHALL declare `af` as a global and SHALL be referenceable by script authors, including via a locally-generated copy that flow scripts can import.

#### Scenario: Script type-checks against the declarations
- **WHEN** a `.ts` flow script references the shipped `agentflow.d.ts` and is checked with `tsc --noEmit`
- **THEN** the script type-checks against the declared `af` surface, flagging invalid calls

### Requirement: Authoring skill
The system SHALL ship a skill that documents the `af` scripting surface, the script authoring conventions, the type-safety and validation workflow, and includes a complete worked example. The conventions SHALL document the flow import contract: imports must use relative specifiers (`./` or `../`); bare module specifiers, `node:` builtins, and dynamic `import()` are rejected; and the `/af-init` command initializes a local importable copy of the `af` declarations. The skill SHALL be loadable by the main-session LLM on demand to author or modify flow scripts, and SHALL document the `agentflow_validate` tool as the authoring-time mechanism for checking a flow script before it is executed.

#### Scenario: LLM loads the authoring skill
- **WHEN** the main-session LLM needs to author or modify a flow script
- **THEN** it can load the shipped skill to learn the `af` surface and conventions

#### Scenario: Skill documents self-validation
- **WHEN** the main-session LLM loads the skill to author or modify a flow script
- **THEN** the skill explains that it can validate a draft script with the `agentflow_validate` tool before running it

#### Scenario: Skill documents the import contract
- **WHEN** the main-session LLM loads the authoring skill
- **THEN** the skill documents the relative-only import policy, the rejected forms, and `/af-init`

### Requirement: `af.Type` exposes the TypeBox type builder
The `af` surface SHALL expose the TypeBox `Type` namespace as `af.Type` so a script can construct a `resultSchema` value that shares the SDK's schema-instance identity without importing `typebox`. The `agentflow.d.ts` declarations SHALL declare `Type: typeof Type` (from `typebox`) on the `AgentFlow` interface.

#### Scenario: Script builds a result schema via `af.Type`
- **WHEN** a flow script declares `resultSchema: af.Type.Object({ steps: af.Type.Array(af.Type.String()) })` and passes it to `af.createAgent`
- **THEN** the schema value is constructed from the `af.Type` namespace and accepted as the agent's `resultSchema`

## ADDED Requirements

### Requirement: Local declaration initialization (`/af-init`)
The system SHALL provide an `/af-init` command that writes a copy of the `af` declarations to the project's `.pi/agentflow/agentflow.d.ts`, creating the directory when absent, overwriting any existing file, and notifying the user of the outcome. The generated copy SHALL be self-contained: the `typebox` import SHALL be replaced with structural fallback declarations so the file has no module imports, and the global `af` declaration SHALL be retained so editors and importing scripts see it. The command SHALL target the project directory only and SHALL have no LLM-callable tool counterpart.

#### Scenario: Initialize declarations in a project
- **WHEN** a user runs `/af-init` in a project whose `.pi/agentflow/agentflow.d.ts` does not exist
- **THEN** the file is created and the user is notified

#### Scenario: Re-initialization overwrites
- **WHEN** a user runs `/af-init` while `.pi/agentflow/agentflow.d.ts` already exists
- **THEN** the file is overwritten with a freshly generated copy and the user is notified

#### Scenario: Generated copy is self-contained
- **WHEN** the generated `.pi/agentflow/agentflow.d.ts` is inspected
- **THEN** it contains no module imports and declares the global `af`

#### Scenario: Script imports the local declarations
- **WHEN** a `.ts` flow imports types from `./agentflow.d.ts` and is validated
- **THEN** the flow type-checks with `af` typed from the local copy
