# Human Escalation Bridge Spec Delta

## Purpose

Convey informed human decisions from an interactive Pi parent to UI-less workflow children, while keeping concurrent requests distinguishable and cancellation explicit.

## ADDED Requirements

### Requirement: Local bridge for workflow children
The bridge SHALL let a UI-less pi-subagents workflow child request and receive human input through an interactive parent. It MUST work without modifying pi-subagents and MUST NOT require a new workflow launcher.

#### Scenario: Existing workflow invocation
- **WHEN** an agent launches a saved workflow through the existing pi-subagents workflow tool and its child requests human input
- **THEN** the parent's bridge presents the request and returns the human's response to that child
- **AND** the child itself does not need UI access

### Requirement: Informed escalation presentation
Each escalation SHALL identify its workflow and change, explain the finding with artifact location and relevant text, state why human judgment is required, ask a precise question, and show options with trade-offs, a labeled recommendation, and the expected artifact effects. Context MUST be scrollable rather than silently truncated.

#### Scenario: Long explanation
- **WHEN** a request's finding, excerpts, options, and trade-offs exceed the terminal viewport
- **THEN** the human can scroll to read the complete request before answering
- **AND** the workflow/change identity and decision being requested remain discoverable

### Requirement: Human answer and provenance
The bridge SHALL support offered choices and a non-empty free-text answer. An answered result MUST identify its request and originate from actual parent UI input; a model-generated answer MUST NOT be accepted as a human decision.

#### Scenario: Custom answer
- **WHEN** the human supplies a free-text answer instead of selecting a proposed option
- **THEN** the requesting child receives that answer without substitution by a model recommendation
- **AND** its request identity and human-input provenance are retained

#### Scenario: Fabricated decision
- **WHEN** a child submits an answer claiming human approval without a matching bridge result
- **THEN** the bridge integration rejects that claimed approval

### Requirement: Queued one-at-a-time presentation
The bridge SHALL enqueue multiple requests in arrival order and present at most one active escalation at a time per interactive parent. Answers MUST be routed only to their originating request; an abort by one run MUST NOT abort unrelated runs.

#### Scenario: Concurrent workflow requests
- **WHEN** workflows A and B submit requests while A's request is displayed
- **THEN** B's request waits in the queue
- **AND** after A's request finishes, B's request is displayed with B's own context
- **AND** neither workflow receives the other's answer

### Requirement: Confirmed human abort
Dismissing an escalation SHALL request confirmation before returning a human-aborted result. The confirmation MUST explain that the current grooming batch has not been applied and default to returning to the question. Declining or dismissing the confirmation MUST preserve the active request.

#### Scenario: Accidental Escape
- **WHEN** the human presses Escape and then declines or dismisses abort confirmation
- **THEN** the original question remains available
- **AND** no aborted result is delivered to the child

#### Scenario: Intentional abort
- **WHEN** the human explicitly confirms stopping grooming
- **THEN** the bridge returns a human-aborted result, not an answer
- **AND** the workflow can report unresolved without applying the pending batch

### Requirement: No response timeout
The bridge SHALL NOT impose an automatic human-response timeout. A request remains pending until answered, explicitly aborted by the human, or cancelled by its owning execution or parent lifecycle.

#### Scenario: Deliberation exceeds prototype deadline
- **WHEN** a human leaves an active request unanswered for more than 60 seconds without cancelling its execution
- **THEN** the request remains available and is not converted into a timeout or default answer

### Requirement: Cancellation and lifecycle cleanup
The bridge SHALL remove pending requests and close active dialogs when their owning execution is cancelled. Parent shutdown, reload, or session replacement MUST settle outstanding requests as cancelled. A cancelled request MUST NOT later display or receive a stale answer; unrelated queued requests MUST remain usable when the parent remains active.

#### Scenario: Queued child is cancelled
- **WHEN** a child is cancelled while its request is waiting behind another request
- **THEN** its request is removed without being presented
- **AND** subsequent live requests remain in arrival order

#### Scenario: Active workflow is stopped
- **WHEN** the owning workflow is stopped through pi-subagents while its human dialog is active
- **THEN** the dialog closes and the request is settled as cancelled
- **AND** cancellation does not require human abort confirmation

#### Scenario: Parent session changes
- **WHEN** the interactive parent reloads or replaces its session with outstanding requests
- **THEN** old requests and broker references are invalidated
- **AND** answers cannot be delivered into the replacement session

### Requirement: Unsupported input channels fail explicitly
The initial bridge SHALL support interactive terminal parents only. Missing bridges, headless parents, and RPC parents MUST return an explicit unavailable result rather than waiting indefinitely or inventing a human answer.

#### Scenario: Escalation without interactive parent
- **WHEN** a child requests a human decision without a matching interactive parent bridge
- **THEN** the request fails explicitly as unavailable
- **AND** no unattended default decision is supplied

### Requirement: Ephemeral decision state
The bridge SHALL keep its decision state in memory without introducing a separate persistent decision store. Ordinary Pi session and pi-subagents workflow traces are permitted. A new grooming execution MUST NOT treat a prior trace or replayed answer as fresh human approval.

#### Scenario: New run after an answered escalation
- **WHEN** a new grooming execution encounters the same question as an earlier execution
- **THEN** the bridge does not load an answer from a decision database or journal
- **AND** the workflow can rely on any now-unambiguous decision already expressed in the change artifacts instead
