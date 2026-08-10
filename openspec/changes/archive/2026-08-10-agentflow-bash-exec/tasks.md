## 1. Type declarations

- [x] 1.1 Add `BashResult` interface (`{ stdout: string; stderr: string; code: number }`) to `extensions/agentflow/agentflow.d.ts`
- [x] 1.2 Add `bash(cmd: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<BashResult>` to the `AgentFlow` interface in `agentflow.d.ts`

## 2. Core command execution (`exec.ts`)

- [x] 2.1 Create SDK-free `extensions/agentflow/exec.ts` with `runCommand` that spawns via an injectable `spawn` seam, using a `ShellConfig`-shaped input (`{ shell, args, commandTransport? }`), `detached: process.platform !== "win32"` (process-group leader so `killProcessTree`'s `kill(-pid)` works on Unix; matches the main bash tool), and `stdio: ["ignore", "pipe", "pipe"]`, collecting stdout/stderr into utf-8 strings and resolving `{ stdout, stderr, code }` on the child's `close` event (both stdio streams closed — required with `detached`), not just `exit`
- [x] 2.2 Handle legacy `commandTransport: "stdin"` by writing the command to the child's stdin and closing it (not an interactive channel)
- [x] 2.3 Support `timeoutMs`: arm a timer, on expiry kill the process group via an injected kill callback and reject with a distinct `BashTimeoutError` (name `"BashTimeoutError"`) carrying partial `stdout`/`stderr`
- [x] 2.4 Expose a cancellation path: register/unregister a kill callback per in-flight command; reject with the flow's cancellation error when cancelled. The kill callback is backed by `killProcessTree`, co-located in `exec.ts` (reimplemented locally — see D1 — and injected via `RunnerServices`)

## 3. Runner wiring

- [x] 3.1 Extend `RunnerServices` in `runner.ts` with `getShellConfig: () => ShellConfig` (type-only import) and `killProcessTree: (pid: number) => void`
- [x] 3.2 Add `bash(cmd, opts?)` to `FlowRunner.buildAf()`, resolving `cwd` from `opts.cwd ?? this.cwd`, rejecting immediately with `FLOW_CANCELLED_ERROR` when the run is already cancelled
- [x] 3.3 Maintain an active-command kill registry in `FlowRunner`; iterate and kill all in-flight children in `cancel()`, rejecting their pending promises with the cancellation error
- [x] 3.4 Emit the one-line failure notice via `runner.logLine` (`af.bash: "<cmd>" exited <code>`, command preview truncated) when a resolved command exits non-zero; no other output is streamed
- [x] 3.5 Re-export the new surface from `runtime.ts` for compatibility

## 4. Extension injection (`index.ts`)

- [x] 4.1 Import `getShellConfig` from the SDK in `index.ts` (the SDK does **not** export `killProcessTree`; its package `exports` map blocks the deep path), import the locally-reimplemented `killProcessTree` from `./exec.js`, and pass both into `FlowRunner`'s `RunnerServices`
- [x] 4.2 Update the extension header comment

## 5. Docs and example

- [x] 5.1 Document `af.bash(cmd, opts?)`, the `BashResult` contract, and conventions (no throw on non-zero, opt-in `timeoutMs`, `BashTimeoutError` discrimination by name, kill-on-cancel, ignored stdin, ungated execution, unbounded output with `cmd > file` escape hatch) in `extensions/agentflow/skills/agentflow/SKILL.md`, including at least one command-driven orchestration pattern
- [x] 5.2 Add an example flow (e.g. `extensions/agentflow/examples/bash.ts`) that calls `af.bash`, branches on `code`, and delivers a result

## 6. Tests

- [x] 6.1 Add `extensions/agentflow/exec.test.ts`: real children under tsx — success output+code 0, non-zero exit returned not thrown, stdin-ignored command fails fast, timeout rejects with partial output and kills, parallel calls resolve independently, cancellation rejects with the cancellation error and kills; the cancel and timeout tests must assert the process *group* is dead (e.g. run `bash -c "sleep 60"` and verify the `sleep` grandchild is gone, not merely the shell)
- [x] 6.2 Add runtime-test coverage: `buildAf()` exposes `bash`; non-zero exit emits exactly one fleet notice line; `bash` after cancellation throws `FLOW_CANCELLED_ERROR`; `cancel()` kills in-flight commands
- [x] 6.3 Verify the type surface: a sample `.ts` script using `af.bash` type-checks against `agentflow.d.ts` (via the existing type-check path or a tsc check)
