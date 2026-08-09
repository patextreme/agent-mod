## MODIFIED Requirements

### Requirement: Example flow script
The system SHALL ship a working example flow script (a `reviewcode` flow) that demonstrates `af.createAgent`, sequential `sendMessage` steps, `af.log`, and `af.result`, and that type-checks and runs correctly.

#### Scenario: Example script runs
- **WHEN** the shipped example flow is invoked
- **THEN** it runs without error, drives its sub-agents, and delivers a result to the main session