# Spec Delta

## Purpose

Defines how this repository's automated checks are discovered, placed, tiered, and run, and separates the deterministic gates from manually run live-model semantic suites.

## ADDED Requirements

### Requirement: Convention-based gate discovery
The harness SHALL discover gate tests by scanning recognized roots — test files co-located with extension modules and test files under the shared gates directory — instead of maintained registration lists. A test file placed at a recognized location SHALL run in every gate execution without any registration edit, and gate execution MUST NOT depend on per-test path lists.

#### Scenario: New test runs without registration
- **WHEN** a contributor adds a test file at a recognized root and runs the gate suite
- **THEN** the test executes without editing any registration list in package manifests or build configuration

#### Scenario: Unrecognized placement is not silently trusted
- **WHEN** a test file is placed outside the recognized roots
- **THEN** gate runs do not execute it, making the misplaced test visible at review rather than giving false assurance

### Requirement: One runner interface for local and hermetic gates
Local gate execution and hermetic gate execution SHALL run the same discovered gate suite through a single runner entry point. The hermetic execution MAY supply additional suite inputs through the environment; it MUST NOT maintain a separate enumeration of tests.

#### Scenario: Local run
- **WHEN** a contributor runs the repository test command locally
- **THEN** the runner discovers every gate test and executes the full suite in one invocation

#### Scenario: Hermetic run
- **WHEN** the hermetic gate executes the repository checks
- **THEN** the gate suite runs through the same runner, with hermetic-only inputs provided by the environment and no per-test derivation list

### Requirement: Hermetic-only tiers skip cleanly
A gate test that requires build-provided inputs SHALL skip its dependent tier when those inputs are absent and MUST NOT fail the local gate because of the missing input.

#### Scenario: Missing suite input locally
- **WHEN** the gate suite runs without a suite's build-provided input
- **THEN** that suite's dependent tier reports as skipped and the overall gate run passes

#### Scenario: Input provided hermetically
- **WHEN** the hermetic gate provides the suite input
- **THEN** the dependent tier executes and its result counts toward the gate outcome

### Requirement: Placement convention for tests
A gate test SHALL live either beside the extension module it exercises or under the shared gates directory when no module owns it. The harness MUST NOT define additional test locations.

#### Scenario: Extension unit test placement
- **WHEN** a test exercises a single extension module
- **THEN** it lives in that module's directory and is discovered from there

#### Scenario: Ownerless contract test placement
- **WHEN** a test exercises a repository-wide contract with no owning module
- **THEN** it lives under the shared gates directory and is discovered from there

### Requirement: Semantic suites stay outside the gates
Live-model semantic suites SHALL be invoked only through a dedicated manual entry point and MUST NOT execute during local or hermetic gate runs. Gate runs MUST NOT materialize semantic fixtures or start model sessions.

#### Scenario: Gate runs exclude semantic suites
- **WHEN** any gate execution runs locally or hermetically
- **THEN** no semantic suite executes, and no model session or fixture materialization occurs

#### Scenario: Manual invocation
- **WHEN** an operator invokes the semantic entry point
- **THEN** it materializes the suite's fixtures and reports their locations for the manual procedure

### Requirement: Semantic evidence is not version controlled
The repository SHALL retain only semantic-suite inputs, grading criteria, fixture tooling, and the documented procedure. Run outputs, traces, and result summaries MUST NOT be committed, and a completed run SHALL leave no newly tracked files.

#### Scenario: Completed run leaves no tracked evidence
- **WHEN** an operator completes a semantic-suite run
- **THEN** the repository working tree gains no tracked result files, and the run's evidence remains in the operator workspace

#### Scenario: Historical results leave the head
- **WHEN** this change lands
- **THEN** previously tracked result records are absent from the repository head but remain recoverable from history
