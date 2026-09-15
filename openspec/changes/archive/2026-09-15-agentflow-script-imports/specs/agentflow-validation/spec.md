## MODIFIED Requirements

### Requirement: On-demand flow script validation
The system SHALL expose on-demand validation of a flow script by name, reusing the same checks the run path performs: resolvability, import-graph validation, syntax validation, and (for `.ts`) type-checking against the `af` declarations. Validation SHALL recursively resolve the script's static import graph and report import-graph problems (missing files, unparseable files, non-relative specifiers, dynamic `import()`) as located errors. Errors located in an imported file SHALL identify that file's path. The validation SHALL report whether the script is valid and, when not, a list of errors with `message`, `line`, and `col` locations. An invalid script SHALL be reported as normal validation output, not as a tool failure.

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
- **WHEN** a flow name that resolves to no script file is validated
- **THEN** the validation reports that no script was found for the given name

#### Scenario: Import-graph problem reports a located error
- **WHEN** a flow script that imports a missing file, a non-relative specifier, or a dynamic `import()` is validated
- **THEN** the validation reports the script as invalid with an error locating the offending import

#### Scenario: Error in an imported file identifies the file
- **WHEN** a flow script imports a helper whose error is detected during validation
- **THEN** the reported error identifies the imported file's path, not only the entry script

## ADDED Requirements

### Requirement: Graph-wide type-check diagnostics
When type-checking a `.ts` flow script, the system SHALL report type diagnostics for every file in the script's import graph, not only the entry script. Diagnostics from files outside the flow's import graph (for example, the shipped declarations themselves) SHALL NOT be reported.

#### Scenario: Type error in an imported file fails validation
- **WHEN** a `.ts` flow imports a local helper that has a type error and the flow is validated
- **THEN** the validation reports the script as invalid with the error located in the imported file

### Requirement: Conditional declaration injection
The type-check performed by the run path and by on-demand validation SHALL include the shipped `agentflow.d.ts` declarations as a root file only when the script's import graph does not already contain an `agentflow.d.ts`. When the graph contains a local `agentflow.d.ts`, the script SHALL be typed against that copy alone so the global `af` is declared exactly once, and import-less scripts SHALL keep being typed by the injected shipped declarations.

#### Scenario: Import-less script typed by injected declarations
- **WHEN** a flow script without imports is type-checked
- **THEN** the shipped declarations are injected and `af` is typed

#### Scenario: Importing script typed by its local declaration copy
- **WHEN** a flow script whose import graph contains `.pi/agentflow/agentflow.d.ts` is type-checked
- **THEN** the shipped declarations are not injected and `af` is typed from the local copy without a duplicate-global error
