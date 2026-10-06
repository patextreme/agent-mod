## Purpose

Distribute the source-faithful factory skill toolkit through the existing Pi package, with usable bundled references and explicit operator-managed prerequisites.

## ADDED Requirements

### Requirement: Discoverable skill toolkit
The package SHALL expose `orc-openspec-groom`, `orc-openspec-implement`, `orc-openspec-verify`, `orc-pr-review-repair`, `orc-issue-to-pr`, and `cleanup-merged-issues` through its declared skills resources. Each skill SHALL include its bundled references and valid name, description and compatibility metadata.

#### Scenario: Discovery outside the source checkout
- **WHEN** the package is loaded from a separate temporary repository without global skills or source-project resources
- **THEN** the six skill definitions are discoverable and their bundled references resolve from their installed skill directories

### Requirement: External prerequisite disclosure
The toolkit SHALL document required orchestration tools, external skills, CLIs, credentials and delivery conventions. It SHALL identify `openspec-review` as package-supplied and `openspec-apply-change`, `openspec-verify-change` and `code-review` as externally supplied. It MUST NOT claim that stock Pi or package installation supplies these external prerequisites.

#### Scenario: Operator prepares a repository
- **WHEN** an operator reads the toolkit installation and usage documentation
- **THEN** it identifies Agent/general-purpose and nested delegation, codemode/SubagentWorkflow, applicable OpenSpec/Git/GitHub/signing prerequisites, and the retained repository conventions
- **AND** no automatic installation or guaranteed availability of external skills is promised

### Requirement: Installed dependency references
References to bundled material SHALL resolve relative to the installed skill directory. External skill procedures SHALL be located from the caller's available skills and passed by resolved absolute path to delegated agents; they MUST NOT depend on Lace's `.agents/skills` tree, this checkout's `.pi/skills` tree, or a developer home-directory path.

#### Scenario: Externally supplied verification skill
- **WHEN** the verification procedure is supplied by the operator at a different installed location
- **THEN** the orchestration instructions use that resolved procedure rather than a broken source-relative link or an invented replacement

### Requirement: Licensed source fidelity
The toolkit SHALL record Lace wallet-sync commit `480e7d565e63469055caf7da75c98efb00d3b415` and the author's confirmed MIT redistribution permission. Changes made for packaging SHALL preserve source behavioral contracts rather than substitute acpx policy or introduce repository configuration.

#### Scenario: Migration is reviewed against source
- **WHEN** the packaged skills and references are compared with the pinned source
- **THEN** differences are attributable to distribution, dependency lookup, license/provenance or explanatory documentation, not changed acceptance, accounting or authorization

### Requirement: Packaging validation boundary
Migration validation SHALL cover frontmatter, bundled links, package inclusion and isolated discovery. It MUST NOT require a live workflow, external-skill installation or access to GitHub/signing credentials, and MUST NOT present packaging checks as evidence of model obedience or operational safety.

#### Scenario: Model-free migration checks
- **WHEN** migration checks run in an environment without external skills or credentials
- **THEN** package checks can complete without executing orchestration, cleanup, delivery or project code from a target repository
- **AND** the reported assurance remains limited to distribution and documented prerequisites
