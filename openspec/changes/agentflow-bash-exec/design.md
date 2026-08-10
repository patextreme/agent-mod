## Context

See proposal.md — Why. The relevant current-state constraints:

- Flow scripts run via `new Function("af", ...)` with exactly one injected global; the `af` surface is built by `FlowRunner.buildAf()` in `runner.ts` (SDK-runtime-free — only type imports — because tsx cannot resolve the SDK package's `exports` from `.ts` under CJS; SDK *runtime* work is injected via `RunnerServices`, e.g. `spawnSession`).
- `index.ts` runs as a compiled extension module and imports the SDK freely. The SDK already ships `getShellConfig()` (shell resolution: `/bin/bash` → PATH `bash` → `sh -c`; Git Bash on Windows; legacy WSL `bash.exe` via stdin transport) and `killProcessTree(pid)` (process-group SIGKILL, `taskkill /T` on Windows) in `dist/utils/shell.js`.
- `FlowRunner` already owns the `cancelled` flag and `FLOW_CANCELLED_ERROR`; `createAgent` throws it when called post-cancel, and `cancel()` stops all agents.
- Specs for this change: `agentflow-runtime` (execution semantics, cancellation, timeout, visibility) and `agentflow-authoring` (declarations, skill docs, example).

## Goals / Non-Goals

**Goals:**
- A synchronous-to-the-script command channel: `await af.bash(cmd, opts?)` → `{ stdout, stderr, code }`.
- Zero duplicated shell-resolution or kill-tree logic; reuse the SDK helpers the main bash tool already uses.
- Keep `runner.ts` SDK-free and everything unit-testable under tsx with real child processes.

**Non-Goals:**
- No permission-extension integration (decided: ungated — see proposal).
- No streaming/tee of command output to the fleet widget (decided: buffered + one-line failure notice).
- No output cap (decided: unbounded).
- No interactive stdin, no env overrides, no `input` opt.

## Decisions

### D1. Inject SDK helpers via `RunnerServices`; put spawn/collect in a new SDK-free `exec.ts`
`index.ts` imports `getShellConfig` and `killProcessTree` from the SDK and passes them into `FlowRunner` through `RunnerServices` (extending the existing interface, same pattern as `spawnSession`). `exec.ts` imports only `node:child_process` and exports a `runCommand` function with an injectable `spawn` seam for tests.

- Rationale: the SDK subpath is unresolvable from `runner.ts` under tsx (the constraint that created `RunnerServices`); reimplementing shell resolution (~80 lines with Windows Git Bash hunting and PATH probing) would drift from pi's own bash tool; the injection pattern is already established.
- Alternative considered: reimplement both helpers in `exec.ts` — rejected (duplication, drift).
- Alternative considered: inline everything in `runner.ts` — rejected (bloat; process plumbing doesn't belong in the registry/event module).

### D2. `FlowRunner` owns the kill registry and cancellation path
`FlowRunner` keeps `activeBash = new Set<() => void>()` (kill callbacks, one per in-flight command). `runCommand` registers on spawn, deregisters on settle. `cancel()` iterates the set and calls the injected `killProcessTree(pid)` for each. Pending `af.bash` calls reject with `FLOW_CANCELLED_ERROR` (same error `createAgent`/`sendMessage` already unwind on, so scripts' existing `try/catch` covers it). A call made after cancellation throws immediately, mirroring `createAgent`.

- Rationale: the runner already owns `cancelled` and the cancellation error; keeping the kill path there makes cancel atomic with the rest of the unwind.
- Alternative considered: cancellation callbacks inside `exec.ts` — rejected (would need a second cancellation channel; the runner is the single owner).

### D3. Timeout is a per-call `setTimeout` in `exec.ts`, rejecting with a distinct error carrying partials
When `opts.timeoutMs` is set, `runCommand` arms a timer; on fire it calls the kill callback and rejects with a `BashTimeoutError` whose `name` is `"BashTimeoutError"` and which carries `stdout`/`stderr` partials. Scripts can't `import` the class, so distinguishability is via `err.name` (documented in the skill).

- Rationale: scripts legitimately want `catch` + retry on timeout; partial output makes the hang diagnosable. No default timeout (decision 6) — the runner passes `undefined` and no timer is armed.
- Alternative considered: throw a plain `Error` — rejected (indistinguishable from cancellation).

### D4. Shell transport and stdio posture
`exec.ts` spawns `spawn(shell, args)` per `getShellConfig()`: `["-c", cmd]` normally; for the legacy-WSL `commandTransport: "stdin"` case it writes the command to the child's stdin and closes it (command transport, not an interactive channel). All other cases use `stdio: ["ignore", "pipe", "pipe"]` — stdin ignored per decision 10; stdout/stderr collected via `data` events into strings, decoded utf-8, returned raw (no sanitization — flows want the actual output). Env inherits `process.env` via spawn's default.

- Rationale: mirrors the main bash tool's resolution (decision 8) so the same command behaves identically in-session and in-flow; `ignore` stdin makes interactive commands fail fast; raw output preserves fidelity for scripts that parse it.
- Alternative considered: `getShellEnv()` (binDir PATH prepend) — rejected; flow commands are user-authored and run in the pi process env; the main tool's PATH tweak exists for the agent's own tool dir, which flows don't need.

### D5. Failure notice in the resolve path
The wrapper that `buildAf` exposes checks the resolved `code`: if non-zero, it calls `runner.logLine(\`af.bash: "${cmd}" exited ${code}\`)` (command preview truncated to ~60 chars for display) before returning the result. The notice is emitted by the runner, so it lands in the same fleet log as `af.log` lines and the TUI/non-TUI reporters pick it up for free.

- Rationale: decision 7 — the human needs the failure signal without full streaming.
- Alternative considered: emit from `exec.ts` — rejected (it must stay UI-agnostic; the runner owns logging).

### D6. Type surface in `agentflow.d.ts`
Add to the `AgentFlow` interface:

```ts
bash(cmd: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<BashResult>;
```

plus `export interface BashResult { stdout: string; stderr: string; code: number }`. `cwd` defaults to `af.cwd` at runtime (runner passes `opts.cwd ?? this.cwd`). The `.d.ts` is the only type surface scripts see; the skill documents it.

## Risks / Trade-offs

- **[Unbounded buffering can OOM on runaway output]** (e.g. `yes`, `cat /dev/urandom | base64`) → Accepted by explicit decision (Q13/B); the skill documents the `cmd > file` redirect escape hatch for huge outputs. A cap can be layered on later without breaking the result shape's contract.
- **[Legacy-WSL `bash.exe` transport edge]** → `exec.ts` handles `commandTransport: "stdin"` by writing the command then closing stdin; worst case that ancient path is unsupported on systems where it no longer exists — acceptable, and it never affects Unix.
- **[Kill races]** (process exits between cancel and `killProcessTree`) → `killProcessTree` already try/catches dead-pid kills; deregistration on settle prevents double-kill.
- **[Binary output decoded as utf-8 garbles]** → Returned raw from the `data` events; flows needing exact bytes redirect to a file. Mirrors what a shell user gets.
- **[`err.name`-based error discrimination]** is stringly-typed → Documented in the skill with the exact name; scripts that want stronger typing can match on message/name — acceptable for a scripting surface that cannot import classes.

## Migration Plan

Additive API: existing flows, specs, and tests are unaffected. Deploy by landing the change (types → `exec.ts` → runner wiring → skill/example → tests). Rollback is a revert of the change commit; no state or data migration.

## Open Questions

None — all behavioral decisions were resolved in the shared-understanding session (13 questions, recorded in the conversation and reflected in the specs). Minor deferrables (e.g. whether a timeout should also emit a fleet notice) are deliberately omitted from the specs and can be added later without changing the approach.
