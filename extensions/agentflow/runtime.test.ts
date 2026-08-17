/**
 * runtime.test.ts — Unit tests for the AgentFlow submitted-result surface.
 *
 * Covers the schema-gated `submit_result` tool (`buildSubmitTool`), the
 * submission slot, and the handle's `submittedResult()` / `clearResult()`
 * semantics. The tool's schema-shape enforcement is delegated to the SDK, so
 * the "malformed rejected" case is verified against the tool's own `parameters`
 * schema using TypeBox's `Value.Check`.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type {
  AgentSession,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { buildImportGraph } from "./discovery.js";
import { killProcessTree } from "./exec.js";
import type { FlowAgentRecord } from "./runner.js";
import { executeFlowScript, FlowRunner, renderFlowValue } from "./runner.js";
import {
  buildSubmitTool,
  createSubmissionSlot,
  deepCopy,
  FLOW_CANCELLED_ERROR,
  FlowAgentHandle,
  includeSubmitToolActive,
} from "./submit.js";

/** Minimal mock session sufficient for `FlowAgentHandle` drive methods. */
function mockSession(): AgentSession {
  return {
    prompt: async () => {},
    waitForIdle: async () => {},
    getLastAssistantText: () => "done",
    sessionFile: undefined,
    subscribe: () => () => {},
    messages: [],
    abort: async () => {},
    clearQueue: () => ({ steering: [], followUp: [] }),
    dispose: () => {},
    setSessionName: (_name: string) => {},
  } as unknown as AgentSession;
}

/** Mock session that records call order of `clearQueue` and `abort`. */
function orderTrackingSession(): { session: AgentSession; calls: string[] } {
  const calls: string[] = [];
  const session = {
    prompt: async () => {},
    waitForIdle: async () => {},
    getLastAssistantText: () => "done",
    sessionFile: undefined,
    subscribe: () => () => {},
    messages: [],
    abort: async () => {
      calls.push("abort");
    },
    clearQueue: () => {
      calls.push("clearQueue");
      return { steering: [], followUp: [] };
    },
    dispose: () => {},
    setSessionName: (_name: string) => {},
  } as unknown as AgentSession;
  return { session, calls };
}

/** Minimal FlowRunner services mock (no real sessions are spawned here). */
function mockRunner(): FlowRunner {
  return new FlowRunner({
    ctx: {
      cwd: "/tmp",
      getSystemPrompt: () => "",
    } as unknown as ExtensionContext,
    resolveModel: () => undefined,
    inheritTools: () => [],
    spawnSession: async () => mockSession(),
    getShellConfig: () => ({ shell: "bash", args: ["-c"] }),
    killProcessTree,
  });
}

/** Register a fake agent record on a runner (no sub-session spawned). */
function fakeRecord(
  runner: FlowRunner,
  name: string,
  session: AgentSession = mockSession(),
): FlowAgentRecord {
  const handle = new FlowAgentHandle(
    name,
    session,
    createSubmissionSlot(),
    () => runner.isCancelled,
  );
  const record = {
    id: `agent${runner.agents.length + 1}`,
    name,
    status: "running",
    model: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    activity: "running",
    session: {} as unknown as AgentSession,
    handle,
  } as unknown as FlowAgentRecord;
  runner.agents.push(record);
  return record;
}

/** Run a built tool's `execute` with a fixed tool-call id and params. */
async function runTool(
  tool: NonNullable<ReturnType<typeof buildSubmitTool>>,
  params: Record<string, unknown>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await tool.execute(
    "call-1",
    params as never,
    undefined,
    undefined,
    {} as never,
  );
}

test("buildSubmitTool injects a submit_result tool iff resultSchema is present", () => {
  const slot = createSubmissionSlot();
  const emitted: string[] = [];
  const onEmit = (line: string) => emitted.push(line);

  const withSchema = buildSubmitTool(
    "a",
    Type.Array(Type.String()),
    slot,
    onEmit,
  );
  assert.ok(
    withSchema,
    "tool should be injected when resultSchema is provided",
  );
  assert.equal(withSchema.name, "submit_result");
  assert.equal(withSchema.label, "Submit result");

  const withoutSchema = buildSubmitTool("b", undefined, slot, onEmit);
  assert.equal(withoutSchema, undefined, "no tool when resultSchema is absent");
});

test("valid submission stores the value and emits a submission log", async () => {
  const slot = createSubmissionSlot();
  const emitted: string[] = [];
  const tool = buildSubmitTool(
    "reviewer",
    Type.Array(Type.String()),
    slot,
    (line) => emitted.push(line),
  );
  assert.ok(tool);

  await runTool(tool, { value: ["a", "b"] });

  assert.equal(slot.set, true);
  assert.deepEqual(slot.value, ["a", "b"]);
  assert.deepEqual(emitted, ['agent "reviewer" submitted a result']);
});

test("malformed submission is rejected by the tool's schema (agent can retry)", () => {
  const slot = createSubmissionSlot();
  const tool = buildSubmitTool(
    "reviewer",
    Type.Array(Type.String()),
    slot,
    () => {},
  );
  assert.ok(tool);

  // The tool's parameters schema wraps the result schema under `value`.
  const schema = tool.parameters;
  assert.equal(Value.Check(schema, { value: ["ok"] }), true);
  assert.equal(Value.Check(schema, { value: 42 }), false, "non-array rejected");
  assert.equal(
    Value.Check(schema, { value: ["ok", 7] }),
    false,
    "non-string element rejected",
  );
});

test("submittedResult() returns a deep copy; mutating it does not affect the handle", () => {
  const slot = createSubmissionSlot();
  slot.value = { findings: ["x"], meta: { n: 1 } };
  slot.set = true;

  const handle = new FlowAgentHandle("a", mockSession(), slot);
  const got = handle.submittedResult();

  assert.deepEqual(got, { findings: ["x"], meta: { n: 1 } });
  // Mutate the returned copy — the handle's stored value must be unchanged.
  (got as { findings: string[]; meta: { n: number } }).findings.push("y");
  (got as { findings: string[]; meta: { n: number } }).meta.n = 99;

  const again = handle.submittedResult();
  assert.deepEqual(again, { findings: ["x"], meta: { n: 1 } });
});

test("submittedResult() returns undefined when nothing was submitted", () => {
  const slot = createSubmissionSlot();
  const handle = new FlowAgentHandle("a", mockSession(), slot);
  assert.equal(handle.submittedResult(), undefined);
});

test("clearResult() resets the stored value to undefined", () => {
  const slot = createSubmissionSlot();
  slot.value = { ok: true };
  slot.set = true;
  const handle = new FlowAgentHandle("a", mockSession(), slot);

  assert.ok(handle.submittedResult());
  handle.clearResult();
  assert.equal(handle.submittedResult(), undefined);
});

test("no auto-reset across sendMessage", async () => {
  const slot = createSubmissionSlot();
  slot.value = "saved";
  slot.set = true;
  const handle = new FlowAgentHandle("a", mockSession(), slot);

  await handle.sendMessage("next step");
  // The submitted value survives a sendMessage without an explicit clear.
  assert.equal(handle.submittedResult(), "saved");
});

test("includeSubmitToolActive adds submit_result to the active-tool allowlist only when a resultSchema is present", () => {
  const inherited = ["read", "bash", "edit", "write"];
  // With a resultSchema: the tool must be active or the agent can't call it.
  assert.deepEqual(includeSubmitToolActive(inherited, true), [
    "read",
    "bash",
    "edit",
    "write",
    "submit_result",
  ]);
  // Already present → unchanged.
  assert.deepEqual(
    includeSubmitToolActive([...inherited, "submit_result"], true),
    [...inherited, "submit_result"],
  );
  // Without a resultSchema: list untouched (no tool activated).
  assert.deepEqual(includeSubmitToolActive(inherited, false), inherited);
  // Input list is not mutated.
  const orig = [...inherited];
  includeSubmitToolActive(inherited, true);
  assert.deepEqual(inherited, orig);
});

test("deepCopy returns an independent object", () => {
  const src = { list: [1, 2], nested: { ok: true } };
  const copy = deepCopy(src);
  copy.list.push(3);
  copy.nested.ok = false;
  assert.deepEqual(src, { list: [1, 2], nested: { ok: true } });
});

// ─── Stop / cancel semantics ───────────────────────────────────────────────

test("stop() rejects subsequent sendMessage/sendSteer (a stopped agent stays stopped)", async () => {
  const handle = new FlowAgentHandle("a", mockSession());
  await handle.sendMessage("works before stop");

  await handle.stop();
  assert.equal(handle.isStopped, true);
  await assert.rejects(() => handle.sendMessage("too late"), /was stopped/);
  await assert.rejects(() => handle.sendSteer("too late"), /was stopped/);
});

test("a mid-turn stop() rejects the in-flight sendMessage/sendSteer (no partial-text resolve)", async () => {
  // waitForIdle only settles once stop() runs, mimicking a stop that lands
  // while the turn is still in flight. The step must reject, not resolve with
  // partial assistant text and let the flow walk into its next step.
  let release: () => void = () => {};
  const idleGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const session = {
    prompt: async () => {},
    waitForIdle: async () => idleGate,
    getLastAssistantText: () => "partial text",
    sessionFile: undefined,
    subscribe: () => () => {},
    messages: [],
    abort: async () => {},
    clearQueue: () => ({ steering: [], followUp: [] }),
    dispose: () => {},
    setSessionName: (_name: string) => {},
  } as unknown as AgentSession;
  const handle = new FlowAgentHandle("a", session);

  const pendingMessage = handle.sendMessage("in flight");
  const pendingSteer = handle.sendSteer("in flight");
  await handle.stop(); // -> this.stopped = true + abort
  release(); // let waitForIdle settle

  await assert.rejects(pendingMessage, /was stopped/);
  await assert.rejects(pendingSteer, /was stopped/);
});

// ─── Genuine turn failures → agent errored ───────────────────────────────

test("a genuine turn failure (prompt rejects) reports a turn error", async () => {
  const session = {
    prompt: async () => {
      throw new Error("upstream model 500");
    },
    waitForIdle: async () => {},
    getLastAssistantText: () => "",
    sessionFile: undefined,
    subscribe: () => () => {},
    messages: [],
    abort: async () => {},
    clearQueue: () => ({ steering: [], followUp: [] }),
    dispose: () => {},
    setSessionName: (_name: string) => {},
  } as unknown as AgentSession;
  const errors: string[] = [];
  const handle = new FlowAgentHandle(
    "a",
    session,
    createSubmissionSlot(),
    undefined,
    undefined,
    (d) => errors.push(d),
  );

  await assert.rejects(() => handle.sendMessage("go"), /upstream model 500/);
  assert.deepEqual(errors, ["upstream model 500"], "genuine failure reported");
});

test("a stop during an in-flight turn does not report a spurious turn error", async () => {
  // The turn must reach `await prompt` *before* stop() sets the flag (stop sets
  // `stopped` synchronously, so without the drain the turn would throw at
  // assertSendable and never reach the prompt). stop() then aborts, which
  // rejects the in-flight prompt — that rejection is a *consequence* of the
  // stop, not a genuine failure, so onTurnError must stay silent (mirrors how
  // the real SDK's abort surfaces mid-turn).
  let rejectPrompt!: (e: Error) => void;
  const session = {
    prompt: () =>
      new Promise<never>((_resolve, reject) => {
        rejectPrompt = reject;
      }),
    waitForIdle: async () => {},
    getLastAssistantText: () => "",
    sessionFile: undefined,
    subscribe: () => () => {},
    messages: [],
    abort: async () => {
      rejectPrompt(new Error("aborted"));
    },
    clearQueue: () => ({ steering: [], followUp: [] }),
    dispose: () => {},
    setSessionName: (_name: string) => {},
  } as unknown as AgentSession;
  const errors: string[] = [];
  const handle = new FlowAgentHandle(
    "a",
    session,
    createSubmissionSlot(),
    undefined,
    undefined,
    (d) => errors.push(d),
  );

  const pending = handle.sendMessage("go");
  await new Promise((r) => setTimeout(r, 0)); // let the turn reach `await prompt`
  await handle.stop(); // stopped = true, then abort() rejects the prompt
  await assert.rejects(pending, /aborted/);
  assert.deepEqual(errors, [], "stop-caused rejection is not a turn error");
});

test("a flow cancellation during an in-flight turn does not report a spurious turn error", async () => {
  let rejectPrompt!: (e: Error) => void;
  let cancelled = false;
  const session = {
    prompt: () =>
      new Promise<never>((_resolve, reject) => {
        rejectPrompt = reject;
      }),
    waitForIdle: async () => {},
    getLastAssistantText: () => "",
    sessionFile: undefined,
    subscribe: () => () => {},
    messages: [],
    abort: async () => {
      rejectPrompt(new Error("aborted"));
    },
    clearQueue: () => ({ steering: [], followUp: [] }),
    dispose: () => {},
    setSessionName: (_name: string) => {},
  } as unknown as AgentSession;
  const errors: string[] = [];
  const handle = new FlowAgentHandle(
    "a",
    session,
    createSubmissionSlot(),
    () => cancelled,
    undefined,
    (d) => errors.push(d),
  );

  const pending = handle.sendMessage("go");
  await new Promise((r) => setTimeout(r, 0)); // let the turn reach `await prompt`
  cancelled = true; // flow-level cancel lands mid-turn
  await handle.abort(); // abort rejects the in-flight prompt
  await assert.rejects(pending, /aborted/);
  assert.deepEqual(errors, [], "cancel-caused rejection is not a turn error");
});

test("stop() clears the steer/follow-up queues BEFORE aborting (no resurrection)", async () => {
  const { session, calls } = orderTrackingSession();
  const handle = new FlowAgentHandle("a", session);
  await handle.stop();
  assert.deepEqual(calls, ["clearQueue", "abort"]);
});

test("abort() also clears queues but keeps the handle usable", async () => {
  const { session, calls } = orderTrackingSession();
  const handle = new FlowAgentHandle("a", session);
  await handle.abort();
  assert.deepEqual(calls, ["clearQueue", "abort"]);
  assert.equal(handle.isStopped, false);
  await handle.sendMessage("still usable"); // must not throw
});

test("flow cancellation rejects sendMessage/sendSteer and createAgent", async () => {
  const runner = mockRunner();
  const record = fakeRecord(runner, "worker");

  runner.cancel();
  assert.equal(runner.isCancelled, true);
  assert.equal(record.status, "stopped", "cancel stops non-terminal agents");
  // The handle was stopped by the cancel, so new calls reject as stopped.
  await assert.rejects(() => record.handle.sendMessage("nope"), /was stopped/);
  await assert.rejects(() => record.handle.sendSteer("nope"), /was stopped/);
  await assert.rejects(
    () => runner.createAgent({ name: "late" }),
    new RegExp(FLOW_CANCELLED_ERROR),
  );
});

test("cancel() completes the run with FLOW_CANCELLED_ERROR (no external complete needed)", () => {
  const runner = mockRunner();
  fakeRecord(runner, "worker");

  let got: string | undefined = "unset";
  runner.subscribe((event) => {
    if (event.type === "complete") got = event.error;
  });
  // cancel() now drives completion itself, so a flow suspended on a non-`af`
  // promise (which never unwinds to call complete()) still terminates — the
  // fleet unmounts and the one-flow-at-a-time slot frees up.
  runner.cancel();

  assert.equal(runner.isCancelled, true);
  assert.equal(runner.isComplete, true, "cancel drives completion");
  assert.equal(got, FLOW_CANCELLED_ERROR);
});

test("cancel()'s completion wins over the script's later unwind error", () => {
  const runner = mockRunner();
  fakeRecord(runner, "worker");

  const errors: string[] = [];
  runner.subscribe((event) => {
    if (event.type === "complete") errors.push(event.error ?? "<none>");
  });
  runner.cancel(); // emits the cancellation completion
  runner.complete('agent "worker" was stopped'); // idempotent: a no-op

  assert.deepEqual(
    errors,
    [FLOW_CANCELLED_ERROR],
    "only one completion, the cancellation",
  );
});

test("complete() is idempotent (a second settle does not re-emit)", () => {
  const runner = mockRunner();
  fakeRecord(runner, "worker");

  let completes = 0;
  runner.subscribe((event) => {
    if (event.type === "complete") completes++;
  });
  runner.complete("first");
  runner.complete("second");

  assert.equal(completes, 1);
});

test("cancel() leaves already-stopped agents untouched and emits a log line", () => {
  const runner = mockRunner();
  const stopped = fakeRecord(runner, "stopped-one");
  stopped.status = "stopped";
  stopped.completedAt = Date.now();
  fakeRecord(runner, "running-one");

  runner.cancel();

  assert.equal(stopped.status, "stopped");
  assert.ok(
    runner.logs.some((l) => l.includes("cancelled by user")),
    "cancel emits a log line",
  );
});

test("cancel() is idempotent", () => {
  const runner = mockRunner();
  fakeRecord(runner, "worker");
  runner.cancel();
  runner.cancel(); // must not throw or re-mark
  assert.equal(runner.isCancelled, true);
});

// ─── Prompt serialization ──────────────────────────────────────────────────

test("sendSteer is not deferred behind an in-flight sendMessage (queues into the running turn)", async () => {
  // A steer must reach session.prompt immediately so the SDK can inject it
  // into the streaming turn. Chaining it on driveLock behind the in-flight
  // sendMessage would postpone the prompt until the turn had already settled —
  // too late to steer, and `getSteeringMessages()` would never populate.
  let releaseIdle: () => void = () => {};
  const idleGate = new Promise<void>((resolve) => {
    releaseIdle = resolve;
  });
  const steered: string[] = [];
  const session = {
    prompt: async (text: string, opts?: { streamingBehavior?: string }) => {
      if (opts?.streamingBehavior === "steer") steered.push(text);
    },
    waitForIdle: async () => idleGate,
    getLastAssistantText: () => "final",
    sessionFile: undefined,
    subscribe: () => () => {},
    messages: [],
    abort: async () => {},
    clearQueue: () => ({ steering: [], followUp: [] }),
    dispose: () => {},
    setSessionName: (_name: string) => {},
  } as unknown as AgentSession;
  const handle = new FlowAgentHandle("a", session);

  // sendMessage blocks at waitForIdle and never settles until we release.
  const pendingMessage = handle.sendMessage("do work");
  await new Promise((r) => setTimeout(r, 0)); // let sendMessage reach waitForIdle
  // Fire the steer but do not await it (it too parks at waitForIdle).
  const pendingSteer = handle.sendSteer("also check X");
  await new Promise((r) => setTimeout(r, 0)); // let sendSteer reach session.prompt

  // The steer reached prompt while sendMessage is still in flight — the fix.
  assert.deepEqual(
    steered,
    ["also check X"],
    "steer reaches session.prompt immediately, not deferred behind sendMessage",
  );

  releaseIdle();
  await Promise.allSettled([pendingMessage, pendingSteer]);
});

test("concurrent sendMessage turns are serialized (lastResult is never crossed)", async () => {
  // Each turn's getLastAssistantText() returns the text it prompted; without
  // the drive lock the two turns interleave on the shared session and both can
  // resolve with the same (wrong) text. With it, each call observes its own
  // turn and no two turns overlap.
  const prompted: string[] = [];
  let overlapping = 0;
  let maxOverlapping = 0;
  const session = {
    prompt: async (text: string) => {
      prompted.push(text);
    },
    waitForIdle: async () => {
      overlapping++;
      maxOverlapping = Math.max(maxOverlapping, overlapping);
      await new Promise((r) => setTimeout(r, 5));
      overlapping--;
    },
    getLastAssistantText: () => prompted[prompted.length - 1] ?? "",
    sessionFile: undefined,
    subscribe: () => () => {},
    messages: [],
    abort: async () => {},
    clearQueue: () => ({ steering: [], followUp: [] }),
    dispose: () => {},
    setSessionName: (_name: string) => {},
  } as unknown as AgentSession;
  const handle = new FlowAgentHandle("a", session);

  const [a, b] = await Promise.all([
    handle.sendMessage("first"),
    handle.sendMessage("second"),
  ]);

  assert.equal(maxOverlapping, 1, "no two prompt turns overlap");
  assert.equal(a, "first", "first turn observes its own lastResult");
  assert.equal(b, "second", "second turn observes its own lastResult");
});

// ─── Disposal & clock-freezing (lifecycle) ────────────────────────────────

test("markDisposed() retires an agent: freezes the clock and sets status disposed", () => {
  const runner = mockRunner();
  const record = fakeRecord(runner, "worker");
  assert.equal(record.completedAt, undefined);

  const updates: FlowAgentRecord[] = [];
  runner.subscribe((event) => {
    if (event.type === "agent_updated") updates.push(event.record);
  });

  runner.markDisposed(record.id);

  assert.equal(record.status, "disposed");
  assert.equal(record.activity, "disposed");
  assert.ok(record.completedAt !== undefined, "completedAt is stamped");
  assert.equal(updates.length, 1);
  assert.equal(updates[0], record);
});

test("markDisposed() is idempotent (does not re-stamp completedAt)", () => {
  const runner = mockRunner();
  const record = fakeRecord(runner, "worker");
  runner.markDisposed(record.id);
  const completedAt = record.completedAt;
  const updates: FlowAgentRecord[] = [];
  runner.subscribe((event) => {
    if (event.type === "agent_updated") updates.push(event.record);
  });

  runner.markDisposed(record.id);

  assert.equal(record.status, "disposed");
  assert.equal(record.completedAt, completedAt);
  assert.equal(updates.length, 0);
});

test("markDisposed() does not override a stopped or errored agent", () => {
  const runner = mockRunner();
  const stopped = fakeRecord(runner, "stopped-one");
  stopped.status = "stopped";
  stopped.completedAt = Date.now();
  const stoppedAt = stopped.completedAt;

  const errored = fakeRecord(runner, "errored-one");
  errored.status = "error";

  runner.markDisposed(stopped.id);
  runner.markDisposed(errored.id);

  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.completedAt, stoppedAt);
  assert.equal(errored.status, "error");
});

test("markStopped() does not override a disposed or errored agent", () => {
  const runner = mockRunner();
  const disposed = fakeRecord(runner, "disposed-one");
  disposed.status = "disposed";
  disposed.completedAt = Date.now();
  const disposedAt = disposed.completedAt;

  const errored = fakeRecord(runner, "errored-one");
  errored.status = "error";

  runner.markStopped(disposed.id);
  runner.markStopped(errored.id);

  // A disposed agent must stay disposed — the fleet roster only hides
  // "disposed", so flipping it back to "stopped" makes it reappear (a
  // regression of the hide-disposed fix); an errored agent keeps its reason.
  assert.equal(disposed.status, "disposed");
  assert.equal(disposed.completedAt, disposedAt);
  assert.equal(errored.status, "error");
});

test("markStopped() is idempotent on an already-stopped agent", () => {
  const runner = mockRunner();
  const stopped = fakeRecord(runner, "stopped-one");
  stopped.status = "stopped";
  stopped.completedAt = Date.now();
  const stoppedAt = stopped.completedAt;

  let updates = 0;
  runner.subscribe((event) => {
    if (event.type === "agent_updated") updates++;
  });

  runner.markStopped(stopped.id);

  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.completedAt, stoppedAt);
  assert.equal(updates, 0, "no re-emit for an already-terminal agent");
});

test("markErrored() flips a non-terminal agent to error and stamps its clock", () => {
  const runner = mockRunner();
  const record = fakeRecord(runner, "worker");
  assert.equal(record.completedAt, undefined);

  const updates: FlowAgentRecord[] = [];
  runner.subscribe((event) => {
    if (event.type === "agent_updated") updates.push(event.record);
  });

  runner.markErrored(record.id, "model timeout");

  assert.equal(record.status, "error");
  assert.match(record.activity ?? "", /model timeout/);
  assert.ok(record.completedAt !== undefined, "clock is frozen");
  assert.equal(updates.length, 1, "an agent_updated event is emitted");
});

test("markErrored() never overrides a stopped or disposed agent", () => {
  const runner = mockRunner();
  const stopped = fakeRecord(runner, "stopped-one");
  stopped.status = "stopped";
  stopped.completedAt = Date.now();
  const stoppedAt = stopped.completedAt;

  const disposed = fakeRecord(runner, "disposed-one");
  disposed.status = "disposed";
  disposed.completedAt = Date.now();
  const disposedAt = disposed.completedAt;

  runner.markErrored(stopped.id, "late");
  runner.markErrored(disposed.id, "late");

  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.completedAt, stoppedAt);
  assert.equal(disposed.status, "disposed");
  assert.equal(disposed.completedAt, disposedAt);
});

test("complete() freezes the clock for agents that were never disposed", () => {
  const runner = mockRunner();
  const live = fakeRecord(runner, "live");
  fakeRecord(runner, "also-live");
  assert.equal(live.completedAt, undefined);

  runner.complete();

  assert.ok(
    live.completedAt !== undefined,
    "live agent clock is frozen at completion",
  );
  for (const r of runner.agents) {
    assert.ok(r.completedAt !== undefined, "every agent has a completedAt");
  }
});

test("FlowAgentHandle.dispose() fires the onDispose hook once (runner wiring)", () => {
  let disposed = 0;
  const handle = new FlowAgentHandle(
    "a",
    mockSession(),
    createSubmissionSlot(),
    undefined,
    () => {
      disposed++;
    },
  );
  handle.dispose();
  handle.dispose(); // idempotent — hook must not fire again
  assert.equal(disposed, 1);
});

// ─── Display rendering ─────────────────────────────────────────────────────

test("renderFlowValue passes strings through and JSON-renders objects", () => {
  assert.equal(renderFlowValue("plain"), "plain");
  assert.equal(renderFlowValue({ a: 1 }), JSON.stringify({ a: 1 }, null, 2));
  assert.equal(renderFlowValue(42), "42");
});

test("renderFlowValue never throws on unserializable values", () => {
  assert.equal(renderFlowValue(10n), "10");
  assert.equal(renderFlowValue(undefined), "undefined");
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.equal(renderFlowValue(circular), String(circular));
});

// ─── af.bash ───────────────────────────────────────────────────────────────

const bashSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("buildAf() exposes a bash function", () => {
  const runner = mockRunner();
  const af = runner.buildAf();
  assert.equal(typeof af.bash, "function");
});

test("af.bash resolves { stdout, stderr, code } with code 0 on success", async () => {
  const runner = mockRunner();
  const af = runner.buildAf();
  const result = await af.bash("echo hi");
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "hi\n");
  assert.equal(result.stderr, "");
});

test("af.bash resolves a non-zero exit code (not thrown)", async () => {
  const runner = mockRunner();
  const af = runner.buildAf();
  const result = await af.bash("exit 7");
  assert.equal(result.code, 7);
});

test("af.bash emits exactly one fleet notice line on non-zero exit", async () => {
  const runner = mockRunner();
  const af = runner.buildAf();
  const before = runner.logs.length;
  const result = await af.bash("exit 1");
  assert.equal(result.code, 1);
  const notices = runner.logs
    .slice(before)
    .filter((l) => l.startsWith("af.bash:"));
  assert.equal(notices.length, 1, "exactly one notice line");
  assert.match(notices[0], /exited 1/);
});

test("af.bash emits no notice on a zero exit", async () => {
  const runner = mockRunner();
  const af = runner.buildAf();
  const before = runner.logs.length;
  await af.bash("echo ok");
  const notices = runner.logs
    .slice(before)
    .filter((l) => l.startsWith("af.bash:"));
  assert.equal(notices.length, 0);
});

test("af.bash after cancellation throws FLOW_CANCELLED_ERROR", async () => {
  const runner = mockRunner();
  const af = runner.buildAf();
  runner.cancel();
  await assert.rejects(
    () => af.bash("echo nope"),
    new RegExp(FLOW_CANCELLED_ERROR),
  );
});

test("af.bash respects opts.cwd", async () => {
  const runner = mockRunner();
  const af = runner.buildAf();
  const result = await af.bash("pwd", { cwd: "/tmp" });
  assert.equal(result.stdout.trim(), "/tmp");
});

test("cancel() kills in-flight af.bash commands and rejects them", async () => {
  const killed: number[] = [];
  const runner = new FlowRunner({
    ctx: {
      cwd: "/tmp",
      getSystemPrompt: () => "",
    } as unknown as ExtensionContext,
    resolveModel: () => undefined,
    inheritTools: () => [],
    spawnSession: async () => mockSession(),
    getShellConfig: () => ({ shell: "bash", args: ["-c"] }),
    // Record the kill AND do the real group kill so no `sleep 60` lingers.
    killProcessTree: (pid) => {
      killed.push(pid);
      killProcessTree(pid);
    },
  });
  const af = runner.buildAf();
  const promise = af.bash("sleep 60");
  await bashSleep(150);
  runner.cancel();
  await assert.rejects(promise, new RegExp(FLOW_CANCELLED_ERROR));
  assert.equal(
    killed.length,
    1,
    "killProcessTree called once for the in-flight command",
  );
  assert.ok(killed[0] > 0, "killed a real pid");
});

// ─── Module-based execution (executeFlowScript) ────────────────────────────

/** Minimal `af` recording surface for module-execution tests. */
function recordingAf(cwd: string): {
  af: {
    cwd: string;
    log: (...parts: unknown[]) => void;
    result: (value: unknown) => void;
  };
  logs: string[];
  result: { value: unknown; set: boolean };
} {
  const logs: string[] = [];
  const result = { value: undefined as unknown, set: false };
  return {
    logs,
    result,
    af: {
      cwd,
      log: (...parts: unknown[]) => logs.push(parts.join(" ")),
      result: (value: unknown) => {
        result.value = value;
        result.set = true;
      },
    },
  };
}

/** Build an isolated flow dir for module-execution tests. */
function makeFlowDir(): { dir: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "agentflow-exec-"));
  const dir = join(root, ".pi", "agentflow");
  mkdirSync(dir, { recursive: true });
  return { dir, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("executeFlowScript runs an entry with relative imports and top-level await", async () => {
  const d = makeFlowDir();
  try {
    writeFileSync(
      join(d.dir, "helper.ts"),
      [
        "export async function work(): Promise<string> {",
        '  return "helper sees af.cwd=" + af.cwd;',
        "}",
        "export const MAGIC = 41;",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(d.dir, "entry.ts"),
      [
        'import { work, MAGIC } from "./helper.ts";',
        "const data: { ok: boolean } = await Promise.resolve({ ok: true });",
        "af.log(await work(), data.ok, MAGIC + 1);",
        'af.result("done");',
        "export const done = true;",
        "",
      ].join("\n"),
    );
    const { af, logs, result } = recordingAf(d.dir);
    await executeFlowScript(join(d.dir, "entry.ts"), af as never);
    assert.deepEqual(logs, [`helper sees af.cwd=${d.dir} true 42`]);
    assert.deepEqual(result, { value: "done", set: true });
  } finally {
    d.cleanup();
  }
});

test("executeFlowScript exposes `af` to imported helpers and removes it after the run", async () => {
  const d = makeFlowDir();
  try {
    writeFileSync(
      join(d.dir, "sees-af.ts"),
      'export const sawAf: boolean = typeof af === "object" && af !== null;\nexport const cwd: string = af.cwd;\n',
    );
    writeFileSync(
      join(d.dir, "entry.ts"),
      'import { sawAf, cwd } from "./sees-af.ts";\naf.log(sawAf, cwd);\n',
    );
    const { af, logs } = recordingAf(d.dir);
    assert.equal("af" in globalThis, false, "no `af` global before the run");
    await executeFlowScript(join(d.dir, "entry.ts"), af as never);
    assert.equal(
      "af" in globalThis,
      false,
      "`af` global removed after the run",
    );
    assert.deepEqual(logs, [`true ${d.dir}`]);
  } finally {
    d.cleanup();
  }
});

test("executeFlowScript runs a plain import-less .js flow", async () => {
  const d = makeFlowDir();
  try {
    writeFileSync(join(d.dir, "plain.js"), 'af.log("plain ok");\n');
    const { af, logs } = recordingAf(d.dir);
    await executeFlowScript(join(d.dir, "plain.js"), af as never);
    assert.deepEqual(logs, ["plain ok"]);
  } finally {
    d.cleanup();
  }
});

test("executeFlowScript restores a pre-existing `af` global after the run", async () => {
  const d = makeFlowDir();
  try {
    writeFileSync(join(d.dir, "noop.ts"), "af.log(af.cwd);\n");
    const { af, logs } = recordingAf(d.dir);
    const globals = globalThis as { af?: unknown };
    const preExisting = { sentinel: true };
    globals.af = preExisting;
    try {
      await executeFlowScript(join(d.dir, "noop.ts"), af as never);
    } finally {
      // The injected `af` is gone, and the pre-existing one is back.
      assert.equal(globals.af, preExisting);
      delete globals.af;
    }
    assert.deepEqual(logs, [d.dir]);
  } finally {
    d.cleanup();
  }
});

test("a lingering run settling mid-run cannot delete the newer run's `af` global", async () => {
  const d = makeFlowDir();
  try {
    // A cancelled run deliberately abandons its script (index.ts skips
    // `await scriptRun`), so it can still be settling when the next flow
    // starts. The abandoned script's cleanup must not delete the NEW run's
    // `af` global binding.
    writeFileSync(
      join(d.dir, "lingering.ts"),
      "await new Promise((r) => setTimeout(r, 100));\n",
    );
    writeFileSync(
      join(d.dir, "slow-b.ts"),
      'await new Promise((r) => setTimeout(r, 350));\naf.log("b-done:" + af.cwd);\n',
    );
    const b = recordingAf("B");
    const runA = executeFlowScript(join(d.dir, "lingering.ts"), {
      log: () => {},
      cwd: "A",
    } as never);
    await new Promise((r) => setTimeout(r, 30)); // A is now suspended on its timer
    const runB = executeFlowScript(join(d.dir, "slow-b.ts"), b.af as never);
    await runA; // A settles while B is still mid-run
    // The accessor resolves via AsyncLocalStorage, so outside B's async
    // context the getter intentionally returns undefined. The invariant here is
    // that the property binding itself (installed for the still-live B run)
    // survives A's cleanup; B completing without "af is not defined" proves it
    // still resolves inside B's own context.
    assert.equal(
      Object.hasOwn(globalThis as object, "af"),
      true,
      "B's `af` global binding survives A's cleanup",
    );
    await runB; // must complete without "af is not defined"
    assert.deepEqual(b.logs, ["b-done:B"]);
    assert.equal("af" in globalThis, false, "`af` removed after both runs");
  } finally {
    d.cleanup();
  }
});

test("a lingering run settling mid-run still attributes af calls to its own surface", async () => {
  const d = makeFlowDir();
  try {
    writeFileSync(
      join(d.dir, "lingering-uses-af.ts"),
      'await new Promise((r) => setTimeout(r, 100));\naf.log("A-sees:" + af.cwd);\n',
    );
    writeFileSync(
      join(d.dir, "slow-b.ts"),
      'await new Promise((r) => setTimeout(r, 350));\naf.log("B-sees:" + af.cwd);\n',
    );
    const a = recordingAf("A");
    const b = recordingAf("B");

    const runA = executeFlowScript(
      join(d.dir, "lingering-uses-af.ts"),
      a.af as never,
    );
    await new Promise((r) => setTimeout(r, 30)); // A is suspended on its timer
    const runB = executeFlowScript(join(d.dir, "slow-b.ts"), b.af as never);

    await runA; // A resumes and logs while B is still mid-run
    assert.deepEqual(
      a.logs,
      ["A-sees:A"],
      "A's resumed call is attributed to A",
    );
    assert.deepEqual(b.logs, [], "B has not logged yet");

    await runB;
    assert.deepEqual(b.logs, ["B-sees:B"], "B's own call is attributed to B");
    assert.equal("af" in globalThis, false, "`af` removed after both runs");
  } finally {
    d.cleanup();
  }
});

test("executeFlowScript uses the validated graph snapshot instead of re-reading disk", async () => {
  const d = makeFlowDir();
  try {
    const entry = join(d.dir, "entry.ts");
    writeFileSync(entry, 'import { hi } from "./helper.ts";\naf.log(hi());\n');
    writeFileSync(
      join(d.dir, "helper.ts"),
      'export function hi(): string { return "validated"; }\n',
    );
    const graph = buildImportGraph(entry);

    // Simulate a disk change between validation and execution: the run must
    // use the validated snapshot, not the file that is now on disk.
    writeFileSync(
      join(d.dir, "helper.ts"),
      'export function hi(): string { return "changed-after-validation"; }\n',
    );

    const { af, logs } = recordingAf(d.dir);
    await executeFlowScript(entry, af as never, graph);
    assert.deepEqual(logs, ["validated"]);
  } finally {
    d.cleanup();
  }
});
