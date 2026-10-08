# notify-me Specification

## Purpose

Let users explicitly request a single Discord notification when Pi finally returns control, with useful context and bounded, credential-safe delivery.

## Requirements

### Requirement: Explicit one-shot arming
The extension SHALL accept `/notify-me <message>` to arm one notification for the current session's next final handback. A subsequent valid message SHALL replace the pending notification and restart its elapsed-time measurement. `/notify-me cancel` SHALL clear pending state without sending. Empty input SHALL display usage without changing pending state.

#### Scenario: Arm while idle or working
- **WHEN** a user supplies a nonempty message with valid configuration while Pi is idle or processing work
- **THEN** one pending notification is armed and local confirmation is shown
- **AND** executing the command itself does not trigger a notification or model run

#### Scenario: Replace pending message
- **WHEN** a valid message is supplied while a notification is pending
- **THEN** the next handback sends only the replacement message and measures elapsed time from replacement

#### Scenario: Cancel or request usage
- **WHEN** the user supplies `cancel`
- **THEN** pending state is cleared and no notification is sent
- **WHEN** the user supplies no message
- **THEN** usage is shown and pending state remains unchanged

### Requirement: Session-scoped pending state
Pending notifications SHALL clear on session changes and process restart. They SHALL NOT be persisted or transferred to another session.

#### Scenario: Change sessions
- **WHEN** a user switches or starts a session while a notification is pending
- **THEN** the new session starts unarmed and its handback does not send the previous message

#### Scenario: Restart Pi
- **WHEN** Pi restarts after a notification was armed
- **THEN** no notification is restored

### Requirement: Final handback notification
An armed notification SHALL be consumed and dispatched once at final handback after all automatic continuation settles, including completed and errored outcomes. Intermediate runs, retries, recovery, compaction, and queued automatic continuation SHALL NOT dispatch it. Tool failures handled before continuing SHALL NOT alone constitute errored handback. Missing-model/auth preflight failures before any run starts SHALL leave it armed without dispatch or consumption.

#### Scenario: Automatic continuation remains
- **WHEN** an intermediate agent run ends but Pi automatically continues
- **THEN** the notification stays armed and no delivery starts

#### Scenario: Preflight failure before a run starts
- **WHEN** a missing-model or missing-auth preflight failure prevents any run from starting while a notification is armed
- **THEN** no notification is sent and pending state remains armed unchanged
- **WHEN** a later run starts and reaches actual final settlement without cancellation, session reset, or deliberate abort
- **THEN** the notification is consumed once and delivery starts with that settled run's final status, not the earlier preflight failure

#### Scenario: Complete or fail terminally
- **WHEN** Pi finally settles after completion or a terminal error with a notification armed
- **THEN** pending state is consumed once and delivery starts with the final status
- **AND** repeated settlement events do not send it again

### Requirement: Abort and permission-pause policy
Deliberate aborts SHALL clear pending notifications without delivery. A permission prompt or other temporary blocking user prompt SHALL NOT consume or dispatch a notification; it SHALL remain armed for the eventual final handback.

#### Scenario: User aborts work
- **WHEN** the user deliberately aborts a run with a pending notification
- **THEN** pending state clears without delivery

#### Scenario: Permission prompt pauses work
- **WHEN** Pi pauses for permission while a notification is pending
- **THEN** no delivery starts and the notification remains armed through subsequent continuation

### Requirement: Credential-file configuration
The extension SHALL load `~/.pi/notify-me.json` with a nonempty `keyFile` string pointing to a UTF-8 file containing the complete Discord webhook URL. It SHALL support `~/` expansion, resolve relative credential paths against `~/.pi`, and trim surrounding credential whitespace. Configuration SHALL be validated when arming; invalid or missing configuration SHALL give actionable local guidance without arming or replacing an existing valid notification.

#### Scenario: Load a separate secret
- **WHEN** configuration references an absolute, `~/`, or relative credential path containing a valid webhook URL with surrounding whitespace
- **THEN** arming succeeds using the trimmed URL without requiring another token

#### Scenario: Configuration is unusable
- **WHEN** configuration is missing, malformed, unreadable, or references a missing, unreadable, empty, or invalid credential file
- **THEN** the command reports safe configuration guidance and leaves any existing pending notification unchanged

### Requirement: Secret-safe diagnostics and transport
Webhook credentials SHALL NOT appear in embeds, logs, local warnings, or error diagnostics. Delivery SHALL use a validated HTTPS Discord webhook endpoint and SHALL NOT follow redirects that could disclose credentials to another endpoint. Terminal error reasons SHALL be sanitized before inclusion in notifications.

#### Scenario: Delivery exposes a sensitive error
- **WHEN** a transport exception or terminal error contains the configured webhook URL or credential
- **THEN** diagnostics and notification content omit or redact the secret

#### Scenario: Reject an unsafe destination
- **WHEN** the credential file contains a non-Discord URL, non-HTTPS URL, or malformed webhook URL
- **THEN** arming fails without sending any request

### Requirement: Contextual Discord embed
Delivery SHALL render a readable Discord embed with the supplied message, status `Agent finished` or `Agent errored`, full cwd, available session name, elapsed time since arming, and final-handback timestamp. It SHALL NOT claim task success, include a transcript, generate a task summary, or automatically include the agent's response. Context SHALL be captured from the originating session at handback.

#### Scenario: Completion context
- **WHEN** an armed session settles normally
- **THEN** its embed contains the supplied message and required context with `Agent finished`
- **AND** an unavailable session name is omitted

#### Scenario: Context changes after dispatch
- **WHEN** the user changes sessions or directories while delivery is retrying
- **THEN** retries retain the originating notification's captured content

### Requirement: Concise terminal error explanation
An errored final handback SHALL include a concise, secret-safe explanation of the terminal error without a transcript or stack trace. If a concrete reason is unavailable, it SHALL explicitly report that the reason is unavailable rather than invent one.

#### Scenario: Terminal error with reason
- **WHEN** Pi settles with a terminal error and a reason is available
- **THEN** the embed shows `Agent errored` with a concise sanitized reason

#### Scenario: Terminal error without reason
- **WHEN** Pi settles with a terminal error but its reason is unavailable
- **THEN** the embed shows `Agent errored` and explicitly indicates that the reason is unavailable

### Requirement: Valid bounded Discord payloads
Embeds SHALL respect Discord field and aggregate payload limits. Oversized user messages or contextual values SHALL be truncated with a visible indication while preserving the notification status and required context categories. Delivery SHALL NOT trigger Discord mentions from supplied content.

#### Scenario: Oversized or mention-bearing content
- **WHEN** supplied message or context exceeds Discord limits or contains mention syntax
- **THEN** the payload stays valid, visibly marks truncation where needed, and does not ping users or roles

### Requirement: Nonblocking independent delivery
Delivery SHALL consume the pending notification before its first attempt and run independently without blocking Pi interaction. Each request SHALL have a short finite timeout. Arming or canceling a later pending notification SHALL NOT modify a notification already dispatched. Delivery and retries SHALL NOT be persisted across process restarts.

#### Scenario: Interact during retry
- **WHEN** a dispatched notification is awaiting a request or retry delay
- **THEN** the user can continue interacting with Pi and arm another independent notification

#### Scenario: Cancel after dispatch
- **WHEN** the user issues `/notify-me cancel` after delivery began
- **THEN** only any currently pending notification is cleared and already dispatched delivery is unchanged

### Requirement: Bounded classified retries
Delivery SHALL use at most five total attempts. It SHALL retry network failures, timeouts, and server errors after 10 seconds, and Discord rate limits after at least both 10 seconds and Discord's requested interval. It SHALL NOT retry permanent credential, webhook, or payload failures. Possible duplicate delivery after ambiguous timeouts is an accepted limitation.

#### Scenario: Recover from a transient failure
- **WHEN** an attempt fails transiently and attempts remain
- **THEN** another attempt uses the same payload after the required delay
- **AND** successful delivery ends the retry sequence

#### Scenario: Respect Discord rate limiting
- **WHEN** Discord requests a retry interval greater than 10 seconds
- **THEN** the next attempt waits at least that interval and counts toward the five-attempt limit

#### Scenario: Stop retrying
- **WHEN** the fifth attempt fails or an earlier attempt has a permanent failure
- **THEN** no further attempt occurs and a secret-safe local warning reports final delivery failure

### Requirement: Extension distribution and documentation
The extension SHALL ship as `pi-notify-me`, wired into flake packages and checks. Co-located `extensions/notify-me/*.test.ts` tests SHALL run via `tests/run.mjs` discovery and the shared `node-tests` flake check, with no per-extension test derivation or root registration edit. It SHALL remain excluded from `pi install` extension resources. Documentation SHALL cover setup, commands, shared context, retry limits, duplicate risk, and credential protection.

#### Scenario: Install and test the extension
- **WHEN** users build `pi-notify-me` and run the configured extension tests
- **THEN** the packaged extension includes its runtime files and the shared gate runner and `node-tests` check discover its co-located tests to exercise the notification contract
