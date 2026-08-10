## MODIFIED Requirements

### Requirement: Authoring skill
The system SHALL ship a skill that documents the `af` scripting surface, the script authoring conventions, the type-safety and validation workflow, and includes a complete worked example. The skill SHALL be loadable by the main-session LLM on demand to author or modify flow scripts, and SHALL document the `agentflow_validate` tool as the authoring-time mechanism for checking a flow script before it is executed.

#### Scenario: LLM loads the authoring skill
- **WHEN** the main-session LLM needs to author or modify a flow script
- **THEN** it can load the shipped skill to learn the `af` surface and conventions

#### Scenario: Skill documents self-validation
- **WHEN** the main-session LLM loads the skill to author or modify a flow script
- **THEN** the skill explains that it can validate a draft script with the `agentflow_validate` tool before running it