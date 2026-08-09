## MODIFIED Requirements

### Requirement: Flow-agent prompt steps
The handle returned by `af.createAgent` SHALL expose `sendMessage(text, opts?)`, which SHALL send a message to the sub-agent and block until the step fully completes, resolving with the final assistant text. Sequential `sendMessage` calls SHALL share the same sub-agent conversation. When the agent is already streaming, `sendMessage` SHALL queue the message for delivery after the current work settles rather than failing. The public `FlowAgent` interface SHALL NOT expose `sendPrompt`, `sendFollowUp`, or `sendSteer`.

#### Scenario: Sequential messages share context
- **WHEN** a script calls `sendMessage("Task A")` and then `sendMessage("Task B")` on the same handle
- **THEN** Task B runs in the same sub-agent conversation and sees Task A's context

#### Scenario: Message queued while busy
- **WHEN** a script calls `sendMessage` while the agent is already streaming a previous step
- **THEN** the message is queued and delivered after the current work settles, and the call resolves with the final assistant text

#### Scenario: Steering not exposed to scripts
- **WHEN** a flow script is type-checked against the public `FlowAgent` declarations
- **THEN** no `sendSteer`, `sendPrompt`, or `sendFollowUp` method is available on the handle