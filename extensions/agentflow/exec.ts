/**
 * exec.ts — SDK-free command execution for `af.bash`.
 *
 * Imports only `node:child_process` (so it — and its unit tests — run under
 * `tsx`, which cannot resolve the SDK package's `exports` from a `.ts` file via
 * CJS). Spawns the command through a caller-provided shell config, collects
 * stdout/stderr into utf-8 strings, and resolves a `BashResult` on the child's
 * `close` event. Cancellation and timeout are wired through an injected kill
 * callback and an abort registry so this module has no SDK dependency.
 *
 * `killProcessTree` is co-located here: the SDK ships it in `dist/utils/shell.js`
 * but does not export it (the package `exports` map blocks the deep path), so it
 * is reimplemented identically and injected into `FlowRunner` via
 * `RunnerServices` (see the change's design doc, decision D1).
 */

import {
  type ChildProcess,
  type StdioOptions,
  spawn,
} from "node:child_process";

/**
 * Shell resolution shape (mirrors the SDK's `ShellConfig` structurally, so the
 * SDK's `getShellConfig()` return value is assignable without a runtime import).
 */
export interface ShellConfig {
  shell: string;
  args: string[];
  commandTransport?: "argv" | "stdin";
}

/** Result of an `af.bash` call: the captured streams and exit code. */
export interface BashResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Rejected when an `af.bash` call exceeds its `opts.timeoutMs`. Carries the
 * partially-collected output so the hang is diagnosable. Flow scripts cannot
 * `import` this class, so distinguish it by `err.name === "BashTimeoutError"`.
 */
export class BashTimeoutError extends Error {
  readonly name = "BashTimeoutError";
  readonly stdout: string;
  readonly stderr: string;

  constructor(stdout: string, stderr: string) {
    super("af.bash timed out");
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/** A spawn function shaped like node's `child_process.spawn`. */
export type SpawnFn = (
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions,
) => ChildProcess;

/** Options accepted by the injectable spawn seam. */
export interface SpawnOptions {
  cwd?: string;
  detached?: boolean;
  stdio: StdioOptions;
  windowsHide?: boolean;
}

/** Options accepted by `runCommand`. */
export interface RunCommandOptions {
  /** Working directory; omitted to inherit the caller's. */
  cwd?: string;
  /** Hard timeout in ms. When it elapses the process group is killed and the
   * call rejects with a `BashTimeoutError` carrying partial output. */
  timeoutMs?: number;
}

/** Injectable hooks `runCommand` needs from its host (the `FlowRunner`). */
export interface RunCommandHooks {
  /** Injectable spawn seam (tests inject a spy; production passes node's). */
  spawn: SpawnFn;
  /** Kill the child's process group (`killProcessTree`-shaped). */
  kill: (pid: number) => void;
  /**
   * Register an abort callback for this in-flight command. The host calls it on
   * cancellation: it must kill the process group and reject the promise.
   * Returns a deregistration function called when the command settles.
   */
  registerAbort: (abort: () => void) => () => void;
  /** Error to reject with when the command is aborted (cancellation). */
  cancelError: Error;
}

const UTF8 = "utf8";

/**
 * Spawn and await one command, resolving `{ stdout, stderr, code }` on the
 * child's `close` event (both stdio streams closed — required with `detached`,
 * whose descendants can keep a pipe open past `exit`). A non-zero exit is data:
 * it resolves, never rejects. Cancellation rejects with `hooks.cancelError`; a
 * `timeoutMs` expiry rejects with a `BashTimeoutError` carrying partials. In
 * every kill case the child's process group is killed via `hooks.kill`.
 */
export function runCommand(
  config: ShellConfig,
  cmd: string,
  opts: RunCommandOptions | undefined,
  hooks: RunCommandHooks,
): Promise<BashResult> {
  return new Promise<BashResult>((resolve, reject) => {
    const fromStdin = config.commandTransport === "stdin";
    const args = fromStdin ? [...config.args] : [...config.args, cmd];
    const detached = process.platform !== "win32";

    let child: ChildProcess;
    try {
      child = hooks.spawn(config.shell, args, {
        ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
        detached,
        stdio: fromStdin
          ? ["pipe", "pipe", "pipe"]
          : ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    // Legacy-WSL `bash.exe` transport: the command travels on stdin (a one-shot
    // write then close), not as an argv element and not as an interactive tty.
    if (fromStdin) {
      child.stdin?.on("error", () => {
        /* ignore EPIPE if the child exits before we finish writing */
      });
      child.stdin?.end(cmd);
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let deregister: (() => void) | undefined;

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      deregister?.();
      deregister = undefined;
      // Release the pipe handles (harmless on `close`, important on cancel/
      // timeout where the streams may otherwise linger until the group dies).
      child.stdout?.destroy();
      child.stderr?.destroy();
    };

    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString(UTF8);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString(UTF8);
    });

    if (opts?.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled || child.pid === undefined) return;
        hooks.kill(child.pid);
        finish(() => reject(new BashTimeoutError(stdout, stderr)));
      }, opts.timeoutMs);
    }

    const abort = (): void => {
      if (settled || child.pid === undefined) return;
      hooks.kill(child.pid);
      finish(() => reject(hooks.cancelError));
    };
    deregister = hooks.registerAbort(abort);

    child.once("error", (err: Error) => finish(() => reject(err)));
    child.once("close", (code: number | null) =>
      // `code` is null when the process died from a signal; resolve a numeric
      // sentinel so the `BashResult.code` contract (`number`) always holds.
      finish(() => resolve({ stdout, stderr, code: code ?? -1 })),
    );
  });
}

/**
 * Kill a process and its descendants, cross-platform. The child is spawned
 * `detached` on Unix (a process-group leader), so `kill(-pid)` SIGKILLs the
 * whole group at once; on Windows `taskkill /F /T /PID` walks the tree.
 * Mirrors the SDK helper the main bash tool uses; try/catches every path so a
 * dead/missing pid is a no-op rather than a throw.
 */
export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        detached: true,
        windowsHide: true,
      });
    } catch {
      // Ignore — taskkill failing on a dead/missing pid is benign.
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already dead — nothing to do.
    }
  }
}
