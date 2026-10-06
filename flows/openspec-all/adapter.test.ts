import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import {
  acp,
  action,
  checkpoint,
  compute,
  decision,
  defineFlow,
  type FlowDefinition,
  type FlowEdge,
  type FlowNodeContext,
  type FlowNodeDefinition,
  FlowRunner,
  type FlowRunState,
  type FlowStepRecord,
  type ShellActionResult,
  shell,
} from "acpx/flows";
import { createGroomFlow } from "../openspec-groom/flow.js";
import { createImplementFlow } from "../openspec-implement/flow.js";
import { createVerifyFlow } from "../openspec-verify/flow.js";
import { type ScopedCallback, scopeGraph } from "./adapter.js";

const timestamp = "2026-06-01T00:00:00.000Z";
const input = { changeId: "example" };
function step(nodeId: string, outcome: FlowStepRecord["outcome"] = "ok") {
  return {
    nodeId,
    attemptId: `${nodeId}#1`,
    nodeType: "compute" as const,
    outcome,
    startedAt: timestamp,
    finishedAt: timestamp,
    promptText: null,
    rawText: null,
    output: { cwd: "/canonical/workspace", changeId: "example" },
    ...(outcome === "failed" && { error: "dispatch failure" }),
    session: null,
    agent: null,
  };
}
function context(): FlowNodeContext {
  const steps = [
    step("implement:repair"),
    step("verify:preflight"),
    step("verify:repair", "failed"),
    step("groom:repair", "failed"),
  ];
  const outputs = Object.fromEntries(steps.map((s) => [s.nodeId, s.output]));
  const results = Object.fromEntries(
    steps.map((s) => [s.nodeId, { ...s, durationMs: 3 }]),
  );
  const state: FlowRunState = {
    runId: "real-run-id",
    flowName: "parent",
    flowPath: "/flow.ts",
    input,
    outputs,
    results,
    steps,
    startedAt: timestamp,
    updatedAt: timestamp,
    status: "running",
    sessionBindings: {},
    currentNode: "verify:repair",
    currentAttemptId: "verify:repair#2",
    currentNodeType: "compute",
    currentNodeStartedAt: timestamp,
    waitingOn: "verify:repair",
  };
  return {
    input,
    outputs,
    results,
    state,
    services: { command: "native service" },
    signal: new AbortController().signal,
    runShell: async () => {
      throw new Error("Not used in this fixture");
    },
  };
}
function run(node: FlowNodeDefinition, c: FlowNodeContext) {
  assert.ok("run" in node && node.run);
  return node.run(c);
}
function assertLocal(c: FlowNodeContext, real: FlowNodeContext) {
  assert.strictEqual(c.input, input);
  assert.strictEqual(c.state.input, input);
  assert.equal(c.state.runId, "real-run-id");
  assert.equal(c.state.flowName, "fixture");
  assert.equal(c.state.flowPath, real.state.flowPath);
  assert.strictEqual(c.signal, real.signal);
  assert.strictEqual(c.runShell, real.runShell);
  assert.strictEqual(c.services, real.services);
  assert.strictEqual(c.state.sessionBindings, real.state.sessionBindings);
  assert.deepEqual(Object.keys(c.outputs), ["preflight", "repair"]);
  assert.deepEqual(c.state.outputs, c.outputs);
  assert.deepEqual(Object.keys(c.results), ["preflight", "repair"]);
  assert.deepEqual(c.state.results, c.results);
  assert.deepEqual(
    c.state.steps.map((s) => s.nodeId),
    ["preflight", "repair"],
  );
  assert.equal(c.state.steps[1].attemptId, "repair#1");
  assert.equal(c.results.repair.nodeId, "repair");
  assert.equal(c.results.repair.attemptId, "repair#1");
  assert.equal(c.results.repair.error, "dispatch failure");
  assert.equal(c.results.repair.durationMs, 3);
  assert.equal(c.state.currentNode, "repair");
  assert.equal(c.state.currentAttemptId, "repair#2");
  assert.equal(c.state.waitingOn, "repair");
}

test("every supported callback receives local context, preserving native configuration", async () => {
  const real = context();
  const seen: string[] = [];
  const check = (surface: string, c: FlowNodeContext) => {
    assertLocal(c, real);
    seen.push(surface);
  };
  const shellResult: ShellActionResult = {
    command: "echo",
    args: ["ok"],
    cwd: "/canonical/workspace",
    stdout: "ok",
    stderr: "",
    combinedOutput: "ok",
    exitCode: 0,
    signal: null,
    durationMs: 1,
  };
  const graph = defineFlow({
    name: "fixture",
    run: {
      title(c) {
        assert.strictEqual(c.input, input);
        assert.equal(c.flowName, "fixture");
        assert.equal(c.flowPath, "/flow.ts");
        return "local title";
      },
    },
    permissions: { requiredMode: "approve-reads" as const },
    startAt: "preflight",
    nodes: {
      preflight: compute({ run: (c) => check("compute.run", c) }),
      repair: action({ run: async (c) => check("action.run", c) }),
      shell: shell({
        exec(c) {
          check("shell.exec", c);
          return {
            command: "echo",
            cwd: String((c.outputs.preflight as { cwd: string }).cwd),
          };
        },
        parse(result, c) {
          check("shell.parse", c);
          assert.strictEqual(result, shellResult);
          return result.stdout;
        },
      }),
      pause: checkpoint({ run: (c) => check("checkpoint.run", c) }),
      default_pause: checkpoint(),
      agent: acp({
        profile: "pi",
        session: { isolated: true, handle: "explicit-handle" },
        timeoutMs: 123456,
        heartbeatMs: 789,
        statusDetail: "Original status detail",
        async cwd(c) {
          check("acp.cwd", c);
          return (c.outputs.preflight as { cwd: string }).cwd;
        },
        prompt(c) {
          check("acp.prompt", c);
          return "original prompt";
        },
        async parse(text, c) {
          check("acp.parse", c);
          assert.equal(text, "original text");
          return { route: "clear" };
        },
      }),
      literal_cwd: acp({ cwd: "/literal", prompt: () => "literal" }),
      judge: decision({
        choices: ["clear", "blocked"],
        question(c) {
          check("decision.question", c);
          return "Local question";
        },
      }),
    },
    edges: [],
  });
  const wrapped: ScopedCallback[] = [];
  const scoped = scopeGraph("verify", graph, (c, invoke, metadata) => {
    assert.strictEqual(c, real);
    assert.ok(c.outputs["implement:repair"]);
    wrapped.push(metadata);
    return invoke();
  });
  assert.strictEqual(scoped.permissions, graph.permissions);
  const title = scoped.run?.title;
  assert.equal(typeof title, "function");
  if (typeof title === "function")
    assert.equal(
      await title({ input, flowName: scoped.name, flowPath: "/flow.ts" }),
      "local title",
    );
  await run(scoped.nodes["verify:preflight"], real);
  await run(scoped.nodes["verify:repair"], real);
  await run(scoped.nodes["verify:pause"], real);
  assert.deepEqual(await run(scoped.nodes["verify:default_pause"], real), {
    checkpoint: "default_pause",
    summary: "default_pause",
  });
  const sh = scoped.nodes["verify:shell"];
  assert.ok(sh.nodeType === "action" && "exec" in sh);
  assert.equal((await sh.exec(real)).cwd, "/canonical/workspace");
  assert.equal(await sh.parse?.(shellResult, real), "ok");
  const agent = scoped.nodes["verify:agent"];
  assert.equal(agent.nodeType, "acp");
  if (agent.nodeType !== "acp") throw new Error("Expected ACP node");
  assert.equal(agent.profile, "pi");
  assert.strictEqual(agent.session, graph.nodes.agent.session);
  assert.equal(agent.timeoutMs, 123456);
  assert.equal(agent.heartbeatMs, 789);
  assert.equal(agent.statusDetail, "Original status detail");
  assert.equal(typeof agent.cwd, "function");
  if (typeof agent.cwd === "function")
    assert.equal(await agent.cwd(real), "/canonical/workspace");
  assert.equal(await agent.prompt(real), "original prompt");
  assert.deepEqual(await agent.parse?.("original text", real), {
    route: "clear",
  });
  const literal = scoped.nodes["verify:literal_cwd"];
  assert.ok(literal.nodeType === "acp");
  assert.equal(literal.cwd, "/literal");
  const judge = scoped.nodes["verify:judge"];
  assert.ok(judge.nodeType === "acp");
  assert.match(String(await judge.prompt(real)), /Local question/);
  assert.deepEqual(await judge.parse?.('{"route":"clear"}', real), {
    route: "clear",
  });
  assert.deepEqual(
    seen.sort(),
    [
      "compute.run",
      "action.run",
      "shell.exec",
      "shell.parse",
      "checkpoint.run",
      "acp.cwd",
      "acp.prompt",
      "acp.parse",
      "decision.question",
    ].sort(),
  );
  assert.ok(wrapped.some((m) => m.nodeId === "agent" && m.surface === "parse"));
  assert.ok(wrapped.every((m) => m.stage === "verify"));
  assert.equal(real.results["verify:repair"].nodeId, "verify:repair");
  assert.equal(real.state.steps[2].nodeId, "verify:repair");
});

test("active and already-aborted signals retain identity and reason through the wrapper", async () => {
  const real = context();
  const controller = new AbortController();
  real.signal = controller.signal;
  const reason = new Error("native cancellation");
  const graph = defineFlow({
    name: "abort",
    startAt: "repair",
    nodes: {
      repair: action({
        async run(c) {
          assert.strictEqual(c.signal, controller.signal);
          c.signal?.throwIfAborted();
          await new Promise<void>((resolve) =>
            c.signal?.addEventListener("abort", () => resolve(), {
              once: true,
            }),
          );
          c.signal?.throwIfAborted();
        },
      }),
    },
    edges: [],
  });
  const scoped = scopeGraph("verify", graph, (c, invoke) => {
    assert.strictEqual(c.signal, controller.signal);
    return invoke();
  });
  const pending = run(scoped.nodes["verify:repair"], real);
  controller.abort(reason);
  await assert.rejects(Promise.resolve(pending), (error) => error === reason);
  await assert.rejects(
    Promise.resolve(run(scoped.nodes["verify:repair"], real)),
    (error) => error === reason,
  );
});

test("projection stays live for in-flight observers without mutating parent records", () => {
  const real = context();
  let projected: FlowNodeContext | undefined;
  const graph = defineFlow({
    name: "fixture",
    startAt: "repair",
    nodes: {
      preflight: compute({ run: () => null }),
      repair: compute({
        run: (c) => {
          projected = c;
        },
      }),
    },
    edges: [],
  });
  run(scopeGraph("verify", graph).nodes["verify:repair"], real);
  assert.ok(projected);
  real.state.steps.push({
    ...step("verify:repair"),
    attemptId: "verify:repair#2",
  });
  real.state.outputs["verify:repair"] = "new output";
  assert.equal(projected.state.steps.length, 3);
  assert.equal(projected.state.steps.at(-1)?.attemptId, "repair#2");
  assert.equal(projected.outputs.repair, "new output");
  real.state.currentNode = "implement:repair";
  real.state.currentAttemptId = "implement:repair#9";
  real.state.waitingOn = "implement:repair";
  assert.equal(projected.state.currentNode, undefined);
  assert.equal(projected.state.currentAttemptId, undefined);
  assert.equal(projected.state.waitingOn, undefined);
  projected.results.repair.nodeId = "modified-local-copy";
  projected.state.steps[0].nodeId = "modified-local-copy";
  assert.equal(real.results["verify:repair"].nodeId, "verify:repair");
  assert.equal(real.state.steps[1].nodeId, "verify:preflight");
});

test("exact own node IDs, backwards edges and switch identifiers are namespaced", () => {
  const graph = defineFlow({
    name: "exact",
    startAt: "",
    nodes: {
      "": compute({ run: () => "__proto__" }),
      ["__proto__"]: compute({ run: () => null }),
      repair: compute({ run: () => null }),
    },
    edges: [
      {
        from: "",
        switch: {
          on: "$.route",
          cases: { ["__proto__"]: "__proto__", again: "" },
        },
      },
      { from: "__proto__", to: "" },
      {
        from: "repair",
        switch: { on: "$result.nodeId", cases: { repair: "" } },
      },
    ],
  });
  const scoped = scopeGraph("groom", graph);
  assert.equal(scoped.startAt, "groom:");
  assert.deepEqual(Object.keys(scoped.nodes), [
    "groom:",
    "groom:__proto__",
    "groom:repair",
  ]);
  assert.deepEqual(scoped.edges, [
    {
      from: "groom:",
      switch: {
        on: "$.route",
        cases: { ["__proto__"]: "groom:__proto__", again: "groom:" },
      },
    },
    { from: "groom:__proto__", to: "groom:" },
    {
      from: "groom:repair",
      switch: { on: "$result.nodeId", cases: { "groom:repair": "groom:" } },
    },
  ]);
  assert.equal(graph.edges[1].from, "__proto__");
  graph.edges = [
    {
      from: "repair",
      switch: { on: "$result.attemptId", cases: { "repair#1": "" } },
    },
  ];
  assert.deepEqual(scopeGraph("groom", graph).edges, [
    {
      from: "groom:repair",
      switch: {
        on: "$result.attemptId",
        cases: { "groom:repair#1": "groom:" },
      },
    },
  ]);
});

test("unsupported edge.when is rejected, never silently ignored by native routing", () => {
  const base: FlowDefinition = defineFlow({
    name: "when",
    startAt: "a",
    nodes: {
      a: compute({ run: () => null }),
      b: compute({ run: () => null }),
    },
    edges: [],
  });
  for (const edge of [
    { from: "a", to: "b", when: () => false },
    {
      from: "a",
      switch: { on: "$.route", cases: { ok: "b" } },
      when: () => false,
    },
  ]) {
    base.edges = [edge as FlowEdge];
    assert.throws(
      () => scopeGraph("verify", base),
      /does not support edge.when/,
    );
  }
  assert.throws(() => scopeGraph("", base), /namespace/);
  assert.throws(() => scopeGraph("foreign:stage", base), /namespace/);
  base.edges = [{ from: "a", to: "missing" }];
  assert.throws(
    () => scopeGraph("verify", base),
    /Unknown verify node: missing/,
  );
});

async function runner(t: TestContext) {
  const cwd = await mkdtemp(join(tmpdir(), "stage-adapter-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const native = new FlowRunner({
    resolveAgent: () => ({ agentName: "unused", agentCommand: "false", cwd }),
    permissionMode: "approve-reads",
    outputRoot: join(cwd, "runs"),
  });
  return { cwd, native };
}

function budgetGraph(limit: number): FlowDefinition {
  return defineFlow({
    name: "budget",
    startAt: "preflight",
    nodes: {
      preflight: compute({ run: () => "local preflight" }),
      repair: action({
        run(c) {
          assert.equal(c.outputs.preflight, "local preflight");
          return {
            attempt:
              c.state.steps.filter((s) => s.nodeId === "repair").length + 1,
          };
        },
      }),
      budget: compute({
        run: (c) => ({
          route:
            c.state.steps.filter((s) => s.nodeId === "repair").length >= limit
              ? "done"
              : "again",
        }),
      }),
      success: compute({
        run: (c) => ({
          attempts: c.state.steps.filter((s) => s.nodeId === "repair").length,
          repairs: c.state.steps
            .filter((s) => s.nodeId === "repair")
            .map((s) => s.output),
          latest: c.results.repair.output,
          ids: Object.keys(c.outputs),
        }),
      }),
    },
    edges: [
      { from: "preflight", to: "repair" },
      { from: "repair", to: "budget" },
      {
        from: "budget",
        switch: { on: "$.route", cases: { again: "repair", done: "success" } },
      },
    ],
  });
}

test("one native runner follows backwards edges with independent stage histories and standalone parity", async (t) => {
  const { native } = await runner(t);
  const implement = budgetGraph(10);
  const verify = budgetGraph(2);
  const standaloneImplement = await native.run(implement, input);
  const standaloneVerify = await native.run(verify, input);
  const a = scopeGraph("implement", implement);
  const b = scopeGraph("verify", verify);
  const combined = defineFlow({
    name: "parent",
    startAt: a.startAt,
    nodes: { ...a.nodes, ...b.nodes },
    edges: [
      ...a.edges,
      ...b.edges,
      { from: "implement:success", to: b.startAt },
    ],
  });
  const result = await native.run(combined, input);
  assert.equal(result.state.status, "completed");
  assert.deepEqual(
    result.state.outputs["implement:success"],
    standaloneImplement.state.outputs.success,
  );
  assert.deepEqual(
    result.state.outputs["verify:success"],
    standaloneVerify.state.outputs.success,
  );
  assert.equal(
    result.state.steps.filter((s) => s.nodeId === "implement:repair").length,
    10,
  );
  assert.equal(
    result.state.steps.filter((s) => s.nodeId === "verify:repair").length,
    2,
  );
});

test("actual factory budget callbacks and failure summaries exclude foreign stages", async () => {
  const real = context();
  for (const [stage, factory, countKey] of [
    ["groom", createGroomFlow, "updateAttempts"],
    ["implement", createImplementFlow, "repairAttempts"],
    ["verify", createVerifyFlow, "repairAttempts"],
  ] as const) {
    const records: unknown[] = [];
    const graph = factory({
      emit: (r) => {
        records.push(r);
      },
    });
    const repair = stage === "groom" ? "update" : "repair";
    real.state.steps = [
      ...Array.from({ length: 10 }, () => step(`foreign:${repair}`)),
      step(`${stage}:${repair}`, "failed"),
    ];
    real.state.currentNode = `${stage}:budget`;
    real.outputs = real.state.outputs = {
      [`${stage}:preflight`]: { changeId: "example" },
      [`${stage}:classification`]: { route: "repairable_pause" },
    };
    real.results = real.state.results = Object.fromEntries(
      [
        step("foreign:broken", "failed"),
        step(`${stage}:${repair}`, "failed"),
      ].map((s) => [s.nodeId, { ...s, durationMs: 1 }]),
    );
    const adapted = scopeGraph(stage, graph);
    assert.deepEqual(await run(adapted.nodes[`${stage}:budget`], real), {
      route: stage === "implement" ? "repairable_pause" : "available",
    });
    const failed = (await run(
      adapted.nodes[`${stage}:failed`],
      real,
    )) as Record<string, unknown>;
    assert.equal(failed.outcome, "failed");
    assert.equal(failed[countKey], 1);
    assert.match(
      String(failed.summary),
      new RegExp(`${repair}: dispatch failure`),
    );
    assert.doesNotMatch(
      String(failed.summary),
      /foreign|implement:|verify:|groom:/,
    );
    assert.equal(records.length, 1);
  }
});

test("native identifier switches and default checkpoints preserve standalone local identifiers", async (t) => {
  const { native } = await runner(t);
  const graph = defineFlow({
    name: "identifiers",
    startAt: "repair",
    nodes: {
      repair: compute({ run: () => null }),
      attempt: compute({ run: () => null }),
      pause: checkpoint(),
    },
    edges: [
      {
        from: "repair",
        switch: { on: "$result.nodeId", cases: { repair: "attempt" } },
      },
      {
        from: "attempt",
        switch: { on: "$result.attemptId", cases: { "attempt#1": "pause" } },
      },
    ],
  });
  const standalone = await native.run(graph, input);
  const scoped = await native.run(scopeGraph("groom", graph), input);
  assert.equal(scoped.state.status, "waiting");
  assert.deepEqual(
    scoped.state.outputs["groom:pause"],
    standalone.state.outputs.pause,
  );
  assert.equal(scoped.state.waitingOn, "groom:pause");
});

test("native failure switches retain local summaries and propagate unsuccessful throws", async (t) => {
  const { native } = await runner(t);
  const captured: unknown[] = [];
  const verify = createVerifyFlow({
    emit: (r) => {
      captured.push(r);
    },
  });
  const graph = defineFlow({
    name: "failure",
    startAt: "preflight",
    nodes: {
      preflight: compute({ run: () => ({ changeId: "example" }) }),
      repair: compute({
        run: () => {
          throw new Error("native dispatch failure");
        },
      }),
      failed: verify.nodes.failed,
      unsuccessful: verify.nodes.unsuccessful,
    },
    edges: [
      { from: "preflight", to: "repair" },
      {
        from: "repair",
        switch: {
          on: "$result.outcome",
          cases: { failed: "failed", ok: "unsuccessful" },
        },
      },
      { from: "failed", to: "unsuccessful" },
    ],
  });
  await assert.rejects(
    native.run(scopeGraph("verify", graph), input),
    /Verification unsuccessful.*native dispatch failure/,
  );
  assert.equal(captured.length, 1);
  assert.equal(
    (captured[0] as { summary: string }).summary,
    "repair: native dispatch failure",
  );
});

test("native shell execution, parsing and function-action runShell keep local outputs", async (t) => {
  const { native, cwd } = await runner(t);
  const graph = defineFlow({
    name: "shell",
    startAt: "preflight",
    nodes: {
      preflight: compute({ run: () => ({ cwd }) }),
      shell: shell({
        exec: (c) => ({
          command: process.execPath,
          args: ["-e", "process.stdout.write('native')"],
          cwd: (c.outputs.preflight as { cwd: string }).cwd,
        }),
        parse: (r, c) => ({
          text: r.stdout,
          node: c.state.currentNode,
          attempt: c.state.currentAttemptId,
          cwd: r.cwd,
        }),
      }),
      action: action({
        async run(c) {
          assert.equal((c.outputs.shell as { node: string }).node, "shell");
          assert.ok(c.signal);
          assert.ok(c.runShell);
          return (
            await c.runShell({
              command: process.execPath,
              args: ["-e", "process.stdout.write('managed')"],
              cwd,
            })
          ).stdout;
        },
      }),
    },
    edges: [
      { from: "preflight", to: "shell" },
      { from: "shell", to: "action" },
    ],
  });
  const output = await native.run(scopeGraph("finalize", graph), input);
  assert.deepEqual(output.state.outputs["finalize:shell"], {
    text: "native",
    node: "shell",
    attempt: "shell#1",
    cwd,
  });
  assert.equal(output.state.outputs["finalize:action"], "managed");
});

test("real ACP runner evaluates scoped cwd, prompt and parse in isolated fresh sessions", async (t) => {
  const { cwd } = await runner(t);
  const executable = join(cwd, "fake-acp.mjs");
  await writeFile(
    executable,
    `
import * as acp from ${JSON.stringify(pathToFileURL(createRequire(join(process.cwd(), "package.json")).resolve("@agentclientprotocol/sdk")).href)};
import { Readable, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
acp.agent({ name: "adapter-fixture" })
.onRequest("initialize", () => ({ protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: { loadSession: false } }))
.onRequest("authenticate", () => ({}))
.onRequest("session/new", () => ({ sessionId: randomUUID() }))
.onRequest("session/set_mode", () => ({}))
.onRequest("session/prompt", async (ctx) => {
  await ctx.client.notify(acp.methods.client.session.update, {
    sessionId: ctx.params.sessionId,
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify({ prompt: ctx.params.prompt[0].text }) } }
  });
  return { stopReason: "end_turn" };
})
.onNotification("session/cancel", () => {})
.connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
`,
  );
  const native = new FlowRunner({
    resolveAgent: (profile) => {
      assert.ok(profile === undefined || profile === "pi");
      return {
        agentName: "pi",
        agentCommand: `${process.execPath} ${executable}`,
        agentArgv: [process.execPath, executable],
        cwd,
      };
    },
    permissionMode: "approve-reads",
    outputRoot: join(cwd, "acp-runs"),
    defaultNodeTimeoutMs: 10000,
  });
  const stageGraph = defineFlow({
    name: "acp",
    startAt: "preflight",
    nodes: {
      preflight: compute({ run: () => ({ cwd }) }),
      agent: acp({
        profile: "pi",
        session: { isolated: true },
        timeoutMs: 10000,
        cwd: (c) => (c.outputs.preflight as { cwd: string }).cwd,
        prompt: (c) =>
          `${c.state.currentNode}:${Object.keys(c.outputs).join(",")}`,
        parse: (text, c) => ({
          ...JSON.parse(text),
          node: c.state.currentNode,
          attempt: c.state.currentAttemptId,
        }),
      }),
    },
    edges: [{ from: "preflight", to: "agent" }],
  });
  const a = scopeGraph("groom", stageGraph);
  const b = scopeGraph("verify", stageGraph);
  const result = await native.run(
    defineFlow({
      name: "parent",
      startAt: a.startAt,
      nodes: { ...a.nodes, ...b.nodes },
      edges: [...a.edges, ...b.edges, { from: "groom:agent", to: b.startAt }],
    }),
    input,
  );
  for (const stage of ["groom", "verify"])
    assert.deepEqual(result.state.outputs[`${stage}:agent`], {
      prompt: "agent:preflight",
      node: "agent",
      attempt: "agent#1",
    });
  const agents = result.state.steps.filter((s) => s.nodeType === "acp");
  assert.equal(agents.length, 2);
  assert.notEqual(
    agents[0].session?.acpSessionId,
    agents[1].session?.acpSessionId,
  );
  assert.ok(agents.every((s) => s.agent?.cwd === cwd));
});
