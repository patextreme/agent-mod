## 1. Type declarations

- [ ] 1.1 Add `BashResult` interface (`{ stdout: string; stderr: string; code: number }`) to `extensions/agentflow/agentflow.d.ts`
- [ ] 1.2 Add `bash(cmd: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<BashResult>` to the `AgentFlow` interface in `agentflow.d.ts`

## 2. Core command execution (`exec.ts`)

- [ ] 2.1 Create SDK-free `extensions/agentflow/exec.ts` with `runCommand` that spawns via an injectable `spawn` seam, using a `ShellConfig`-shaped input (`{ shell, args, commandTransport? }`) and `stdio: ["ignore", "pipe", "pipe"]`, collecting stdout/stderr into utf-8 strings and resolving `{ stdout, stderr, code }`
- [ ] 2.2 Handle legacy `commandTransport: "stdin"` by writing the command to the child's stdin and closing it (not an interactive channel)
- [ ] 2.3 Support `timeoutMs`: arm a timer, on expiry kill the process group via an injected kill callback and reject with a distinct `BashTimeoutError` (name `"BashTimeoutError"`) carrying partial `stdout`/`stderr`
- [ ] 2.4 Expose a cancellation path: register/unregister a kill callback (backed by `killProcessTree`) per in-flight command; reject with the flow's cancellation error when cancelled

## 3. Runner wiring

- [ ] 3.1 Extend `RunnerServices` in `runner.ts` with `getShellConfig: () => ShellConfig` (type-only import) and `killProcessTree: (pid: number) => void`
- [ ] 3.2 Add `bash(cmd, opts?)` to `FlowRunner.buildAf()`, resolving `cwd` from `opts.cwd ?? this.cwd`, rejecting immediately with `FLOW_CANCELLED_ERROR` when the run is already cancelled
- [ ] 3.3 Maintain an active-command kill registry in `FlowRunner`; iterate and kill all in-flight children in `cancel()`, rejecting their pending promises with the cancellation error
- [ ] 3.4 Emit the one-line failure notice via `runner.logLine` (`af.bash: "<cmd>" exited <code>`, command preview truncated) when a resolved command exits non-zero; no other output is streamed
- [ ] 3.5 Re-export the new surface from `runtime.ts` for compatibility

## 4. Extension injection (`index.ts`)

- [ ] 4.1 Import `getShellConfig` and `killProcessTree` from the SDK in `index.ts` and pass them into `FlowRunner`'s `RunnerServices`
- [ ] 4.2 Update the extension header comment's description of the `af` surface to include `bash`

## 5. Docs and example

- [ ] 5.1 Document `af.bash(cmd, opts?)`, the `BashResult` contract, and conventions (no throw on non-zero, opt-in `timeoutMs`, `BashTimeoutError` discrimination by name, kill-on-cancel, ignored stdin, ungated execution, unbounded output with `cmd > file` escape hatch) in `extensions/agentflow/skills/agentflow/SKILL.md`, including at least one command-driven orchestration pattern
- [ ] 5.2 Add an example flow (e.g. `extensions/agentflow/examples/bash.ts`) that calls `af.bash`, branches on `code`, and delivers a result

## 6. Tests

- [ ] 6.1 Add `extensions/agentflow/exec.test.ts`: real children under tsx — success output+code 0, non-zero exit returned not thrown, stdin-ignored command fails fast, timeout rejects with partial output and kills, parallel calls resolve independently, cancellation rejects with the cancellation error and kills
- [ ] 6.2 Add runtime-test coverage: `buildAf()` exposes `bash`; non-zero exit emits exactly one fleet notice line; `bash` after cancellation throws `FLOW_CANCELLED_ERROR`; `cancel()` kills in-flight commands
- [ ] 6.3 Verify the type surface: a sample `.ts` script using `af.bash` type-checks against `agentflow.d.ts` (via the existing type-check path or a tsc check)
