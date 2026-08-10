## Purpose

Lets the orchestrating LLM (and humans) validate an AgentFlow flow script on demand by name or path, before it is ever executed, so authoring mistakes surface as reportable errors instead of failed runs.

## ADDED Requirements

### Requirement: On-demand flow script validation
The system SHALL expose on-demand validation of a flow script by name or path, reusing the same checks the run path performs: resolvability, syntax validation, and (for `.ts`) type-checking against the shipped `agentflow.d.ts` declarations. The validation SHALL report whether the script is valid and, when not, a list of errors with `message`, `line`, and `col` locations. An invalid script SHALL be reported as normal validation output, not as a tool failure.

#### Scenario: Valid script reports success
- **WHEN** a flow script that resolves, parses, and type-checks cleanly is validated
- **THEN** the validation reports that the script is valid

#### Scenario: Syntax error reports a located error
- **WHEN** a flow script containing a syntax error is validated
- **THEN** the validation reports the script as invalid with the syntax error message and its location

#### Scenario: Type error reports a located error
- **WHEN** a `.ts` flow script that parses but has a type error against the `af` declarations is validated
- **THEN** the validation reports the script as invalid with the type error message and its location

#### Scenario: Unresolvable name reports not-found
- **WHEN** a flow name or path that resolves to no script file is validated
- **THEN** the validation reports that no script was found for the given name

### Requirement: LLM-accessible validation tool
The system SHALL register an always-on `agentflow_validate` tool callable by the main-session LLM, accepting a flow name or path, and returning the validation report as normal tool content.

#### Scenario: LLM validates a script while authoring
- **WHEN** the main-session LLM calls `agentflow_validate` with a flow name or path during authoring
- **THEN** it receives the validation report as tool content and can fix reported errors and re-validate

#### Scenario: Invalid script does not throw
- **WHEN** `agentflow_validate` validates an invalid script
- **THEN** the tool returns the error report as normal content rather than failing the tool call

### Requirement: Human-accessible validation command
The system SHALL register a `/af-validate <name>` command that validates a flow script by name or path and reports the outcome to the user without requiring project trust.

#### Scenario: Human validates a script
- **WHEN** a user runs `/af-validate <name>` for a flow script
- **THEN** the command reports whether the script is valid or lists its errors, and does not execute the script