# Spec Delta

## MODIFIED Requirements

### Requirement: Explicit one-shot arming
The extension SHALL accept `/notify-me <message>` to arm one notification for the current session's next final handback. A subsequent valid message SHALL replace the pending notification and restart its elapsed-time measurement. Empty input SHALL display usage without changing pending state. No argument SHALL be reserved: every nonempty argument, including the word `cancel`, SHALL be treated as the notification message.

#### Scenario: Arm while idle or working
- **WHEN** a user supplies a nonempty message with valid configuration while Pi is idle or processing work
- **THEN** one pending notification is armed and local confirmation is shown
- **AND** executing the command itself does not trigger a notification or model run

#### Scenario: Replace pending message
- **WHEN** a valid message is supplied while a notification is pending
- **THEN** the next handback sends only the replacement message and measures elapsed time from replacement

#### Scenario: Cancel or request usage
- **WHEN** the user supplies `cancel` as the message argument
- **THEN** the command arms a notification whose message text is `cancel` and clears nothing (the `cancel` argument is no longer reserved)
- **WHEN** the user supplies no message
- **THEN** usage is shown and pending state remains unchanged

### Requirement: Nonblocking independent delivery
Delivery SHALL consume the pending notification before its first attempt and run independently without blocking Pi interaction. Each request SHALL have a short finite timeout. Arming or canceling a later pending notification SHALL NOT modify a notification already dispatched. Delivery and retries SHALL NOT be persisted across process restarts.

#### Scenario: Interact during retry
- **WHEN** a dispatched notification is awaiting a request or retry delay
- **THEN** the user can continue interacting with Pi and arm another independent notification

#### Scenario: Cancel after dispatch
- **WHEN** the user issues `/notify-me-cancel` after delivery began
- **THEN** only any currently pending notification is cleared and already dispatched delivery is unchanged

## ADDED Requirements

### Requirement: Dedicated cancellation command
The extension SHALL register a `/notify-me-cancel` slash command that clears the pending notification through the same cancellation path, affecting pending state only and never a notification already dispatched. Nonempty arguments SHALL be rejected with a usage message and no state change. When nothing is armed, the command SHALL show an informational local toast and SHALL NOT alter state.

#### Scenario: Cancel armed notification
- **WHEN** a notification is pending and the user issues `/notify-me-cancel`
- **THEN** pending state is cleared without delivery and a local cancellation confirmation is shown

#### Scenario: Reject stray arguments
- **WHEN** the user issues `/notify-me-cancel` with any nonempty argument
- **THEN** the command shows a usage message and pending state is unchanged

#### Scenario: Cancel with nothing armed
- **WHEN** nothing is pending and the user issues `/notify-me-cancel`
- **THEN** an informational toast indicates no notification is armed and no state changes

### Requirement: Armed status indicator
The extension SHALL display a status-bar entry keyed `notify-me` with themed text `🔔 notify-me armed` while a notification is pending. It SHALL clear that entry whenever pending state goes away: consumption at final handback, cancellation, deliberate abort, or session reset. The entry SHALL mirror pending state only, with no separate arming-in-flight or delivering states, and the same pending state SHALL always render the same entry.

#### Scenario: Indicator appears on arm
- **WHEN** a notification is armed successfully
- **THEN** the status bar shows the `notify-me` armed entry

#### Scenario: Indicator clears when pending state goes away
- **WHEN** the pending notification is consumed at final handback, cleared by `/notify-me-cancel`, cleared by a deliberate abort, or cleared by a session reset
- **THEN** the status-bar entry is removed

#### Scenario: Indicator reflects replacement, not duplication
- **WHEN** an armed notification is replaced by a new valid message
- **THEN** exactly one `notify-me` armed entry is shown for the single pending notification

#### Scenario: Status works without a UI
- **WHEN** the extension updates the armed status in a headless or JSON-mode run with no UI attached
- **THEN** the update is a no-op and arming, delivery, and cancellation otherwise behave unchanged