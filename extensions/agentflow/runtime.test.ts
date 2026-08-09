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
import { test } from "node:test";
import type {
  AgentSession,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Value } from "typebox/value";
import type { FlowAgentRecord } from "./runner.js";
import { FlowRunner, renderFlowValue } from "./runner.js";
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

test("cancel() is reported by complete() even when the script finishes cleanly", () => {
  const runner = mockRunner();
  fakeRecord(runner, "worker");
  runner.cancel();

  let got: string | undefined = "unset";
  runner.subscribe((event) => {
    if (event.type === "complete") got = event.error;
  });
  runner.complete(); // no error from the script side
  assert.equal(got, FLOW_CANCELLED_ERROR);
});

test("cancel() wins over the script's unwind error in complete()", () => {
  const runner = mockRunner();
  fakeRecord(runner, "worker");
  runner.cancel();

  let got: string | undefined;
  runner.subscribe((event) => {
    if (event.type === "complete") got = event.error;
  });
  runner.complete('agent "worker" was stopped'); // script unwind error
  assert.equal(got, FLOW_CANCELLED_ERROR);
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
