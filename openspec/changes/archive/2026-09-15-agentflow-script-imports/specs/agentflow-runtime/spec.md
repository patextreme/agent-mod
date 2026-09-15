## MODIFIED Requirements

### Requirement: Flow script discovery
The system SHALL resolve a flow by name to a script file. It SHALL search the project's `.pi/agentflow/<name>.ts` first, then the project's `.pi/agentflow/<name>.js`, then the global `~/.pi/agentflow/<name>.ts`, then the global `~/.pi/agentflow/<name>.js`. The first match SHALL win. Files ending in `.d.ts` SHALL NOT be treated as flow scripts: they SHALL NOT be resolved as flows, listed as flow names, or registered as shortcut commands.

#### Scenario: Project script preferred over global
- **WHEN** a flow named `reviewcode` exists in both the project `.pi/agentflow/` and the global `~/.pi/agentflow/`
- **THEN** the project script is executed

#### Scenario: JavaScript fallback
- **WHEN** only `.pi/agentflow/quick.js` exists for flow `quick`
- **THEN** the `.js` script is executed

#### Scenario: No script found
- **WHEN** no `.ts` or `.js` file exists for the requested flow name
- **THEN** the invocation reports an error and no script runs

#### Scenario: Declaration file is not a flow
- **WHEN** `.pi/agentflow/agentflow.d.ts` exists in a flow directory
- **THEN** no flow named `agentflow.d` is resolved, listed, or registered

### Requirement: TypeScript-first loading
The system SHALL execute flow scripts by loading them as modules through a TypeScript-capable loader: `.ts` scripts with TypeScript transpilation, `.js` scripts as JavaScript. This applies equally to scripts with and without imports. Both forms SHALL be validated for syntax before execution, and a syntax error SHALL abort the run before any sub-agent is spawned.

#### Scenario: TypeScript script executes
- **WHEN** a `.ts` flow script is invoked
- **THEN** it is loaded through the TypeScript-capable loader and executed

#### Scenario: Syntax error aborts before execution
- **WHEN** the resolved script contains a syntax error
- **THEN** the run is aborted with an error and no sub-agent is created

### Requirement: Injected `af` scripting surface
The system SHALL execute the script with a single global `af` object injected into scope. The object SHALL expose `createAgent(config)`, `log(...parts)`, `result(value)`, `cwd`, and `bash(cmd, opts?)`. `af` SHALL be the only injected global, and SHALL be visible both to the entry script and to every module it imports. Scripts MAY import other modules subject to the flow import policy; no other globals are injected.

#### Scenario: Workspace is isolated to `af`
- **WHEN** a flow script runs
- **THEN** the only injected identifier available for orchestration is the `af` object

#### Scenario: Imported modules see `af`
- **WHEN** a flow script imports a helper module that calls `af.log`
- **THEN** the helper observes the same injected `af` object and the call succeeds

## ADDED Requirements

### Requirement: Relative-only flow imports
Flow scripts SHALL be able to import other files by relative specifier. Every import specifier in a flow's import graph SHALL begin with `./` or `../`; relative imports MAY resolve to any path, including paths outside the flow directory. Bare module specifiers, `node:` builtins, and dynamic `import()` expressions SHALL be rejected with a located error before any sub-agent is spawned. Type-only imports (`import type`) and CommonJS `require` of relative files SHALL be permitted. Declaration files (`.d.ts`) SHALL be importable for types only; value-importing a declaration file SHALL be rejected.

#### Scenario: Relative value import executes
- **WHEN** a flow script imports a helper from `./helpers.ts` and calls a function it exports
- **THEN** the flow runs and the imported function executes

#### Scenario: Bare specifier rejected
- **WHEN** a flow script imports the bare specifier `zod`
- **THEN** validation fails with an error identifying the specifier, and no sub-agent is spawned

#### Scenario: Node builtin rejected
- **WHEN** a flow script imports `node:fs`
- **THEN** validation fails with an error, and no sub-agent is spawned

#### Scenario: Escape above the flow directory is allowed
- **WHEN** a project flow imports a module via a `../../`-style relative path that leaves the flow directory
- **THEN** the import resolves and the flow runs

#### Scenario: Dynamic import rejected
- **WHEN** a flow script contains a dynamic `import()` expression
- **THEN** validation fails with an error, and no sub-agent is spawned

#### Scenario: Type-only import of declarations
- **WHEN** a `.ts` flow imports types from `./agentflow.d.ts` using `import type`
- **THEN** the flow type-checks and runs

#### Scenario: Value import of a declaration file rejected
- **WHEN** a flow script value-imports a `.d.ts` file
- **THEN** validation fails with an error

### Requirement: Import graph validation before execution
Before executing a flow, the system SHALL recursively resolve the entry script's static import graph, verifying that every imported file exists and parses cleanly. A missing or unparseable imported file SHALL abort the run with a located error before any sub-agent is spawned.

#### Scenario: Missing import aborts before spawn
- **WHEN** a flow imports `./missing.ts` which does not exist
- **THEN** the run is aborted with an error naming the missing file, and no sub-agent is created

#### Scenario: Syntax error in an imported helper aborts before spawn
- **WHEN** a flow imports a helper file that contains a syntax error
- **THEN** the run is aborted with a located error in the helper, and no sub-agent is created
