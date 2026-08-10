/**
 * exec.test.ts — Unit tests for `runCommand` and `killProcessTree` (`af.bash`).
 *
 * Runs real child processes under tsx. Verifies the result contract (stdout/
 * stderr/code), stdin-ignored fast-fail, timeout (partial output + group kill),
 * parallelism, and cancellation (rejection + group kill). The cancel and
 * timeout cases assert the process *group* is dead by recording a grandchild's
 * pid and confirming it is gone — not merely the shell.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { test } from "node:test";
import {
  BashTimeoutError,
  killProcessTree,
  type RunCommandHooks,
  runCommand,
  type ShellConfig,
} from "./exec.js";

/** A plain bash `-c` shell config (mirrors the SDK's Unix resolution). */
const BASH: ShellConfig = { shell: "bash", args: ["-c"] };

/** Build injectable hooks plus a `cancel()` that drains every registered abort. */
function makeHooks(cancelMessage = "AgentFlow: cancelled by user"): {
  hooks: RunCommandHooks;
  cancel: () => void;
} {
  const aborts = new Set<() => void>();
  return {
    cancel: () => {
      for (const abort of [...aborts]) abort();
    },
    hooks: {
      spawn,
      kill: killProcessTree,
      registerAbort: (abort) => {
        aborts.add(abort);
        return () => {
          aborts.delete(abort);
        };
      },
      cancelError: new Error(cancelMessage),
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when `pid` is a live process (signal 0 succeeds). */
function pidAlive(pid: number | undefined | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Poll until `pid` is gone (reaping the zombie after a group kill can lag). */
async function waitForGone(
  pid: number | undefined | null,
  timeoutMs = 2000,
): Promise<boolean> {
  if (!pid) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidAlive(pid)) return true;
    await sleep(30);
  }
  return !pidAlive(pid);
}

/** Write the only marker pid file for a run and read it back. */
function tmpPidFile(): string {
  return `/tmp/agentflow-exec-test-${process.pid}-${Date.now()}.pid`;
}

function readPid(file: string): number | undefined {
  try {
    return Number.parseInt(readFileSync(file, "utf-8").trim(), 10) || undefined;
  } catch {
    return undefined;
  }
}

// ─── Result contract ──────────────────────────────────────────────────────

test("runCommand resolves stdout and code 0 on success", async () => {
  const { hooks } = makeHooks();
  const result = await runCommand(BASH, "echo hello", {}, hooks);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "hello\n");
  assert.equal(result.stderr, "");
});

test("runCommand resolves a non-zero exit code (not thrown)", async () => {
  const { hooks } = makeHooks();
  const result = await runCommand(BASH, "exit 3", {}, hooks);
  assert.equal(result.code, 3);
});

test("runCommand resolves stderr separately from stdout", async () => {
  const { hooks } = makeHooks();
  const result = await runCommand(BASH, "echo out; echo err 1>&2", {}, hooks);
  assert.equal(result.stdout, "out\n");
  assert.equal(result.stderr, "err\n");
  assert.equal(result.code, 0);
});

test("runCommand with ignored stdin: an interactive command fails fast", async () => {
  const { hooks } = makeHooks();
  // `read x` hits EOF immediately (stdin is "ignore") and exits non-zero.
  const result = await runCommand(BASH, "read x", {}, hooks);
  assert.notEqual(result.code, 0);
});

test("runCommand respects opts.cwd", async () => {
  const { hooks } = makeHooks();
  const result = await runCommand(BASH, "pwd", { cwd: "/tmp" }, hooks);
  assert.equal(result.stdout.trim(), "/tmp");
});

// ─── Parallelism ───────────────────────────────────────────────────────────

test("parallel runCommand calls resolve independently", async () => {
  const { hooks } = makeHooks();
  const [a, b] = await Promise.all([
    runCommand(BASH, "echo aaa", {}, hooks),
    runCommand(BASH, "echo bbb", {}, hooks),
  ]);
  assert.equal(a.stdout, "aaa\n");
  assert.equal(b.stdout, "bbb\n");
  assert.equal(a.code, 0);
  assert.equal(b.code, 0);
});

// ─── Timeout ───────────────────────────────────────────────────────────────

test("timeout rejects with a BashTimeoutError carrying partial output and kills the group", async () => {
  const pidFile = tmpPidFile();
  const { hooks } = makeHooks();
  // Emit partial output, start a background grandchild recording its pid, then
  // block in `wait` so the command does not exit on its own.
  const cmd = `echo hi; sleep 60 & echo $! > ${pidFile}; wait`;

  const promise = runCommand(BASH, cmd, { timeoutMs: 300 }, hooks);
  await assert.rejects(
    promise,
    (err: unknown) => {
      assert.ok(
        err instanceof BashTimeoutError,
        "rejects with BashTimeoutError",
      );
      assert.equal((err as BashTimeoutError).name, "BashTimeoutError");
      assert.ok(
        (err as BashTimeoutError).stdout.includes("hi"),
        "partial stdout is attached",
      );
      return true;
    },
    "timeout should reject with BashTimeoutError",
  );

  // The grandchild `sleep` must be dead — the process *group* was killed.
  const grandchild = readPid(pidFile);
  assert.equal(
    await waitForGone(grandchild),
    true,
    "grandchild killed by the group kill",
  );
  rmSync(pidFile, { force: true });
});

test("no timeoutMs means the command runs until it exits", async () => {
  const { hooks } = makeHooks();
  const result = await runCommand(BASH, "sleep 0.2", {}, hooks);
  assert.equal(result.code, 0);
});

// ─── Cancellation ──────────────────────────────────────────────────────────

test("cancellation rejects with the cancellation error and kills the group", async () => {
  const pidFile = tmpPidFile();
  const { hooks, cancel } = makeHooks();
  const cmd = `sleep 60 & echo $! > ${pidFile}; wait`;

  const promise = runCommand(BASH, cmd, {}, hooks);
  // Let the shell spawn the grandchild and record its pid before cancelling.
  await sleep(150);
  cancel();

  await assert.rejects(promise, /cancelled by user/);

  const grandchild = readPid(pidFile);
  assert.equal(
    await waitForGone(grandchild),
    true,
    "grandchild killed by the group kill on cancel",
  );
  rmSync(pidFile, { force: true });
});

test("a command that already settled is not double-handled by a late cancel", async () => {
  const { hooks, cancel } = makeHooks();
  const result = await runCommand(BASH, "echo done", {}, hooks);
  assert.equal(result.code, 0);
  // Cancelling after settlement must not throw or change the resolved result.
  cancel();
  assert.equal(result.code, 0);
});

// ─── killProcessTree ───────────────────────────────────────────────────────

test("killProcessTree kills a process group (grandchildren included)", async () => {
  const pidFile = tmpPidFile();
  const child = spawn("bash", ["-c", `sleep 60 & echo $! > ${pidFile}; wait`], {
    detached: true,
    stdio: "ignore",
  });
  await sleep(150);
  assert.ok(child.pid, "child spawned");
  killProcessTree(child.pid);

  const grandchild = readPid(pidFile);
  assert.equal(
    await waitForGone(grandchild),
    true,
    "killProcessTree kills the whole group",
  );
  rmSync(pidFile, { force: true });
});

test("killProcessTree on a missing pid is a no-op (does not throw)", () => {
  // A very high pid is essentially guaranteed not to exist.
  assert.doesNotThrow(() => killProcessTree(999_999));
});

// ─── Legacy stdin transport ────────────────────────────────────────────────

test("commandTransport 'stdin' writes the command on stdin and resolves", async () => {
  const { hooks } = makeHooks();
  const result = await runCommand(
    { shell: "bash", args: ["-s"], commandTransport: "stdin" },
    "echo via-stdin",
    {},
    hooks,
  );
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "via-stdin\n");
});
