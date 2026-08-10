## ADDED Requirements

### Requirement: Type declarations for `af.bash`
The shipped `agentflow.d.ts` SHALL declare `bash(cmd, opts?)` on the `AgentFlow` interface and a `BashResult` type of `{ stdout: string; stderr: string; code: number }`. `opts` SHALL be declared as optional with `cwd?: string` and `timeoutMs?: number`. The declarations SHALL be referenceable by script authors so `af.bash` is type-checkable.

#### Scenario: Script type-checks against the bash declarations
- **WHEN** a `.ts` flow script calls `af.bash("npm test")`, reads `result.stdout`/`result.stderr`/`result.code`, and passes `{ cwd, timeoutMs }` opts, then is checked with `tsc --noEmit`
- **THEN** the script type-checks against the declared `af.bash` surface

### Requirement: Authoring skill documents `af.bash`
The authoring skill SHALL document the `af.bash(cmd, opts?)` signature, the `BashResult` contract, and its conventions: no throw on non-zero exit, opt-in `timeoutMs` with a distinct timeout error, kill-on-cancel, ignored stdin, ungated execution, and at least one orchestration pattern (e.g. gate a sub-agent step on a command's exit code) that a script author can model flows on.

#### Scenario: Skill covers bash orchestration
- **WHEN** the main-session LLM loads the authoring skill to learn how a flow runs a command and branches on its result
- **THEN** the skill documents `af.bash` and at least one command-driven orchestration pattern

### Requirement: Example flow demonstrates `af.bash`
The system SHALL ship a working example flow that calls `af.bash`, branches on the returned `code`, and type-checks and runs correctly.

#### Scenario: Bash example runs
- **WHEN** the shipped bash example flow is invoked
- **THEN** it runs without error, executes at least one command, and delivers a result to the main session
