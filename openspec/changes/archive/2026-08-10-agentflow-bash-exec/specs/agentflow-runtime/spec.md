## MODIFIED Requirements

### Requirement: Injected `af` scripting surface
The system SHALL execute the script with a single global `af` object injected into scope. The object SHALL expose `createAgent(config)`, `log(...parts)`, `result(value)`, `cwd`, and `bash(cmd, opts?)`. Scripts SHALL have no other imports or injected globals.

#### Scenario: Workspace is isolated to `af`
- **WHEN** a flow script runs
- **THEN** the only injected identifier available for orchestration is the `af` object

## ADDED Requirements

### Requirement: Bash command execution
`af.bash(cmd, opts?)` SHALL execute the command through the same shell resolution as the main session's bash tool (`/bin/bash`, then `bash` on PATH, then `sh -c` fallback; Git Bash on Windows). It SHALL resolve with a `BashResult` of `{ stdout, stderr, code }`, where `stdout` and `stderr` are the full, unbuffered-to-the-UI captured output and `code` is the process exit code. A non-zero exit code SHALL NOT cause the call to reject — it is returned as data. The child's stdin SHALL be ignored so commands that read stdin fail fast rather than hang. `cwd` SHALL default to the flow's working directory and SHALL be overridable via `opts.cwd`. Concurrent `af.bash` calls SHALL be permitted and run independently. Commands executed via `af.bash` SHALL NOT be gated by the permission extension; the flow's trust gate is the security boundary.

#### Scenario: Successful command returns output
- **WHEN** a script calls `af.bash("echo hello")`
- **THEN** the call resolves with `{ stdout: "hello\n", stderr: "", code: 0 }`

#### Scenario: Non-zero exit is returned, not thrown
- **WHEN** a script calls `af.bash("exit 3")`
- **THEN** the call resolves with `code: 3` and does not reject

#### Scenario: Interactive command fails fast
- **WHEN** a script calls `af.bash("read x")`
- **THEN** the call resolves promptly with a non-zero `code` instead of hanging

#### Scenario: Custom working directory
- **WHEN** a script calls `af.bash("pwd", { cwd: "/tmp" })`
- **THEN** the command runs in `/tmp` and reports it

#### Scenario: Parallel commands
- **WHEN** a script awaits two `af.bash` calls via `Promise.all`
- **THEN** both commands run and each resolves with its own `BashResult`

#### Scenario: Permission extension not consulted
- **WHEN** a script calls `af.bash("git push")`
- **THEN** the command executes without any permission rule check or user prompt

### Requirement: Bash cancellation
When the whole run is cancelled, every running `af.bash` child process SHALL be killed together with its process group (grandchildren included), and every pending `af.bash` call SHALL reject with the flow's cancellation error so the script unwinds consistently with the rest of the flow.

#### Scenario: Cancel kills the child and rejects the call
- **WHEN** the user cancels the run while `af.bash("sleep 60")` is in flight
- **THEN** the child process and its process group are killed and the pending call rejects with the flow's cancellation error

### Requirement: Bash timeout
When `opts.timeoutMs` is provided and the command has not exited by then, the call SHALL reject with a distinct timeout error, the partially-collected `stdout` and `stderr` SHALL be attached to the error, and the child's process group SHALL be killed. When `timeoutMs` is omitted, SHALL be no timeout — the command runs until it exits or the run is cancelled.

#### Scenario: Timeout rejects with partial output
- **WHEN** a script calls `af.bash("echo hi && sleep 60", { timeoutMs: 500 })`
- **THEN** the call rejects with a timeout error whose attached `stdout` contains `hi`, and the child is killed

#### Scenario: No timeout by default
- **WHEN** a script calls `af.bash("sleep 2")` without `timeoutMs`
- **THEN** the call resolves with `code: 0` after the command finishes

### Requirement: Bash failure visibility
On a non-zero exit, the runner SHALL emit a single-line notice to the fleet log identifying the command and its exit code, so failures are visible during the run. Command output SHALL NOT be streamed to the fleet log.

#### Scenario: Failing command reports one line
- **WHEN** a script calls `af.bash("exit 1")`
- **THEN** the fleet log receives one notice line naming the command and exit code, and no other output from the command is streamed
