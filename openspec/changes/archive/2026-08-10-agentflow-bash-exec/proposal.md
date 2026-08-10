## Why

Flow scripts today can only run shell commands by delegating to an LLM sub-agent (`af.createAgent` + `sendMessage`) — slow, token-costly, non-deterministic, and opaque. Orchestration logic that a flow needs (check `git status` before reviewing, run `npm test` between agent rounds, verify a fix exists on disk, clean up after itself) has no direct, deterministic channel. This change gives flow scripts a first-class `af.bash()` API so they can execute commands synchronously, inspect output, and branch on exit codes — without an LLM in the loop.

## What Changes

- **New `af.bash(cmd, opts?)` on the injected `af` surface.** Runs a command through the same shell resolution as pi's own bash tool (`/bin/bash` → `bash` on PATH → `sh -c` fallback; Git Bash on Windows). `opts` is optional: `cwd` (defaults to the flow's cwd) and `timeoutMs` (no default — opt-in only).
- **Structured, non-throwing result.** `af.bash` resolves to `{ stdout, stderr, code }`. A non-zero exit is data, not an exception; the script branches on `code`.
- **Distinct hard-failure errors.** Cancellation of the run rejects the pending call with the flow's existing cancellation error and **kills the child's process group** (grandchildren included). A `timeoutMs` expiry rejects with a distinct timeout error carrying the partially-collected `stdout`/`stderr`.
- **Execution posture.** `stdin: "ignore"` so interactive commands fail fast instead of hanging; output buffered **unbounded** (no cap — scripts needing more control redirect to a file inside the command); parallel `af.bash` calls allowed.
- **Ungated by the permission extension.** `af.bash` is static script code, not an LLM-proposed command; the flow's trust gate (project scripts require trust) is the security boundary. Sub-agent bash is already ungated today, so this is consistent.
- **Fleet visibility.** Output stays buffered; on non-zero exit the runner emits a one-line notice (`af.bash: "<cmd>" exited <code>`) to the fleet widget so failures are visible without streaming.
- **Implementation wiring.** The SDK's `getShellConfig` helper is injected via `RunnerServices` (same pattern as `spawnSession`); `killProcessTree` is reimplemented in the new SDK-free `exec.ts` (the SDK does **not** export it — the package `exports` map exposes only `.` and `./rpc-entry`, and `killProcessTree` isn't re-exported from the main entry) and is likewise injected via `RunnerServices`; `exec.ts` does spawn/collect; `FlowRunner` owns the active-children registry and kill-on-cancel.
- **Docs & examples.** `agentflow.d.ts` gains `bash` + `BashResult` types; the authoring skill documents the API and conventions; a new example flow demonstrates `af.bash`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `agentflow-authoring`: the `af` surface declaration (`agentflow.d.ts`) gains `bash` with a type-checkable `BashResult`; the authoring skill documents the new API, its semantics, and conventions; the shipped example set gains a `bash`-demonstrating flow.
- `agentflow-runtime`: the injected `af` scripting surface gains `bash(cmd, opts?)` with defined execution semantics (shell resolution, structured result, stdin, buffering, parallelism, permission posture), cancellation kill-on-cancel behavior, opt-in timeout semantics, and non-zero fleet visibility.

## Impact

- **Code**: `extensions/agentflow/` — `agentflow.d.ts` (types), new `exec.ts` (SDK-free spawn/collect + the reimplemented `killProcessTree`), `runner.ts` (`buildAf` wiring, kill registry, failure notice), `runtime.ts` (re-export surface), `index.ts` (inject `getShellConfig` from the SDK + the local `killProcessTree` via `RunnerServices`).
- **Docs**: `extensions/agentflow/skills/agentflow/SKILL.md` (new API section + conventions), `examples/` (new bash example).
- **Tests**: new `exec.test.ts` (spawn seam, real children), additions to `runtime.test.ts` (kill-on-cancel, notice, result contract).
- **Dependencies**: none new — `node:child_process` is a builtin; `getShellConfig`/`killProcessTree` already ship in `@earendil-works/pi-coding-agent`.
- **Specs**: delta specs over `agentflow-authoring` and `agentflow-runtime`.
