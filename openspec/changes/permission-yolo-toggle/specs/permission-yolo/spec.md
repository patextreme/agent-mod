# permission-yolo Delta Spec

## Purpose

Provides a session-scoped YOLO mode for the permission extension that bypasses all permission checks while enabled, with a persistent visible warning and automatic reset so the state never outlives a session unnoticed.

## ADDED Requirements

### Requirement: YOLO mode command surface
The system SHALL provide a `/permission-yolo` command. Invoked with no argument, it SHALL toggle YOLO mode. Invoked with `on` or `off`, it SHALL set YOLO mode to that state. Invoked with any other argument, it SHALL reject the invocation with an error stating the usage `Usage: /permission-yolo [on|off]` and SHALL leave the mode unchanged.

#### Scenario: Bare invocation toggles
- **WHEN** YOLO mode is off and `/permission-yolo` is invoked with no argument
- **THEN** YOLO mode turns on

#### Scenario: Explicit on
- **WHEN** `/permission-yolo on` is invoked while mode is off
- **THEN** YOLO mode turns on

#### Scenario: Explicit off
- **WHEN** `/permission-yolo off` is invoked while mode is on
- **THEN** YOLO mode turns off immediately

#### Scenario: Idempotent explicit set is a no-op
- **WHEN** `/permission-yolo on` is invoked while mode is already on, or `off` while already off
- **THEN** the mode is unchanged

#### Scenario: Invalid argument rejected
- **WHEN** `/permission-yolo foo` is invoked
- **THEN** an error naming the usage is reported and YOLO mode is unchanged

### Requirement: Full bypass while enabled
While YOLO mode is on, the system SHALL allow every bash command without consulting permission rules or prompting, regardless of whether the command would otherwise match an `allow`, `ask`, or `deny` rule, match no rule, or run in a sandbox. Deny rules SHALL also be bypassed.

#### Scenario: Ask rule bypassed
- **WHEN** YOLO mode is on and a bash command matching an `ask` rule executes
- **THEN** the command is allowed without prompting

#### Scenario: Deny rule bypassed
- **WHEN** YOLO mode is on and a bash command matching a `deny` rule executes
- **THEN** the command is allowed without being blocked

#### Scenario: Unmatched command bypassed outside sandbox
- **WHEN** YOLO mode is on, outside a sandbox, and a bash command matching no rule executes
- **THEN** the command is allowed without prompting

#### Scenario: Bypass does not grant persistent always-allow
- **WHEN** YOLO mode turns off again
- **THEN** commands prompt per the normal rules as if YOLO mode had never been on

### Requirement: Status bar warning while enabled
While YOLO mode is on, the system SHALL display a persistent `⚠️ YOLO MODE ON` warning in the status bar rendered with the theme's warning color. The warning SHALL be cleared when YOLO mode turns off.

#### Scenario: Warning shown when enabled
- **WHEN** YOLO mode turns on
- **THEN** `⚠️ YOLO MODE ON` appears in the status bar in the warning color

#### Scenario: Warning cleared when disabled
- **WHEN** YOLO mode turns off
- **THEN** the warning no longer appears in the status bar

### Requirement: YOLO mode lifecycle
YOLO mode SHALL reset to off at session start. The `/permission-reset` command SHALL also disable YOLO mode alongside clearing always-allowed permissions.

#### Scenario: New session starts clean
- **WHEN** a session starts after YOLO mode was enabled in a previous session
- **THEN** YOLO mode is off and no warning is shown

#### Scenario: Reset disables YOLO
- **WHEN** `/permission-reset` runs while YOLO mode is on
- **THEN** YOLO mode turns off, the warning is cleared, and always-allowed permissions are cleared
