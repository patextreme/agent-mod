import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { type FlowNodeContext, FlowRunner } from "acpx/flows";
import { SteeringError } from "../shared/steering.js";
import { createVerifyFlow, type VerifyResult } from "./flow.js";
import {
  type Assessment,
  currentReport,
  type Report,
  type Snapshot,
} from "./helpers.js";

interface Options {
  repairs?: number;
  escalation?: boolean;
  incompleteEntry?: boolean;
  reopened?: boolean;
  missing?: boolean;
  inconclusive?: boolean;
  suggestions?: boolean;
  forceAccepted?: boolean;
  fail?: "verify" | "repair" | "judge" | "assess" | "refresh";
  failureAt?: number;
  steering?: "needs_human" | "cancelled" | "failed" | "malformed";
  timeout?: boolean;
  input?: unknown;
}
async function graph(t: TestContext, opts: Options = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "verify-graph-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const changeRoot = join(cwd, "openspec/changes/example");
  await mkdir(changeRoot, { recursive: true });
  const tasksPath = join(changeRoot, "tasks.md");
  await writeFile(tasksPath, "- [x] Implement\n");
  let repairs = 0;
  let verifies = 0;
  let judges = 0;
  let assessments = 0;
  let questions = 0;
  const emitted: VerifyResult[] = [];
  const needed = opts.repairs ?? 0;
  const pending = () => repairs < needed;
  const flow = createVerifyFlow({
    cwd,
    command: async (args) => {
      if (opts.fail === "refresh" && verifies)
        throw new Error("Current context unavailable");
      return {
        stdout: JSON.stringify(
          args[0] === "list"
            ? { root: { path: cwd }, changes: [{ name: "example" }] }
            : args[0] === "status"
              ? {
                  changeRoot,
                  planningHome: { kind: "repo", root: cwd },
                  actionContext: { mode: "repo-local" },
                }
              : {
                  changeName: "example",
                  changeDir: changeRoot,
                  state:
                    opts.incompleteEntry || (opts.reopened && repairs)
                      ? "ready"
                      : "all_done",
                  contextFiles: { tasks: [tasksPath] },
                  tasks: [
                    {
                      id: "1",
                      description: "Approved work",
                      done:
                        !opts.incompleteEntry && !(opts.reopened && repairs),
                    },
                  ],
                },
        ),
        stderr: "",
        exitCode: 0,
      };
    },
    steering: async (issues) => {
      questions++;
      assert.equal(
        issues.length,
        2,
        "mixed batch must gather every consequential answer",
      );
      for (const issue of issues)
        assert.match(issue.issue, /Requested authorization scope:/);
      if (opts.steering && opts.steering !== "malformed")
        throw new SteeringError(opts.steering, "Steering stopped");
      return opts.steering === "malformed"
        ? {}
        : Object.fromEntries(
            issues.map((i) => [i.id, `Only authorize ${i.id}`]),
          );
    },
    emit: (result) => emitted.push(result),
  });
  const report = (): Report => {
    const checked = {
      status: "checked" as const,
      reason: "Current implementation checked",
      evidence: ["code.ts:1"],
    };
    return {
      report: `Verification at ${repairs}; ready for archive with warnings`,
      conclusive: !opts.inconclusive,
      dimensions: {
        completeness: checked,
        correctness: checked,
        coherence: {
          status: "inapplicable",
          reason: "No design artifact",
          evidence: [],
        },
      },
      findings: pending()
        ? [
            {
              id: `warning-${repairs}`,
              severity: "WARNING",
              issue: "Mismatch",
              recommendation: "Fix within approved intent",
              evidence: ["code.ts:1"],
            },
          ]
        : opts.suggestions
          ? [
              {
                id: "suggestion",
                severity: "SUGGESTION",
                issue: "Cleanup",
                recommendation: "Optional refactor",
                evidence: ["code.ts:2"],
              },
            ]
          : [],
      gates: [
        { command: "npm test", exitCode: 0, result: "Current tests pass" },
      ],
      noApplicableGates: null,
      missingEvidence: opts.missing ? ["Required live check unavailable"] : [],
    };
  };
  flow.nodes.verify = {
    nodeType: "compute",
    run: () => {
      verifies++;
      if (opts.fail === "verify") throw new Error("Verifier failure");
      return report();
    },
  };
  if (opts.timeout)
    flow.nodes.verify = {
      nodeType: "compute",
      timeoutMs: 10,
      run: (c: FlowNodeContext) =>
        new Promise((_resolve, reject) =>
          c.signal?.addEventListener("abort", () => reject(c.signal?.reason), {
            once: true,
          }),
        ),
    };
  flow.nodes.judge = {
    nodeType: "compute",
    run: () => {
      judges++;
      if (opts.fail === "judge") return { route: "invalid" };
      return {
        route: opts.inconclusive
          ? "inconclusive"
          : opts.forceAccepted ||
              (!pending() && !opts.missing && !(opts.reopened && repairs))
            ? "accepted"
            : "blocking",
      };
    },
  };
  flow.nodes.assess = {
    nodeType: "compute",
    run: (c: FlowNodeContext): Assessment => {
      assessments++;
      if (opts.fail === "assess") throw new Error("Assessor failure");
      const latest = c.outputs.evidence as Report;
      const resolutions = latest.findings
        .filter((f) => f.severity !== "SUGGESTION")
        .map((f) => ({
          id: `resolution-${f.id}`,
          findingIds: [f.id],
          issue: f.issue,
          recommendation: f.recommendation,
          scope: "Approved code correction",
          paths: [join(cwd, "code.ts")],
          escalation: false,
          reason: "Approved intent",
        }));
      if (opts.escalation)
        resolutions.push(
          ...["design", "access"].map((kind) => ({
            ...resolutions[0],
            id: `${kind}-${repairs}`,
            escalation: true,
            reason: `Consequential ${kind}`,
            scope: `${kind} decision only`,
          })),
        );
      return { resolutions };
    },
  };
  flow.nodes.repair = {
    nodeType: "compute",
    run: (c: FlowNodeContext) => {
      repairs++;
      if (opts.escalation) {
        assert.equal((c.outputs.authorize as unknown[]).length, repairs * 2);
        assert.equal(
          questions,
          repairs,
          "mechanical repairs wait for all mixed steering",
        );
      }
      if (opts.fail === "repair" && repairs === (opts.failureAt ?? 1))
        throw new Error("Repair crashed");
      // Even unresolved normal reports must get fresh verification.
      return {
        summary: "Unresolved; no acceptance claim",
        changes: [],
        unresolved: ["Verifier must establish evidence"],
        gates: [],
      };
    },
  };
  const runner = new FlowRunner({
    resolveAgent: () => ({ agentName: "unused", agentCommand: "false", cwd }),
    permissionMode: "approve-reads",
    outputRoot: join(cwd, "runs"),
  });
  try {
    await runner.run(flow, opts.input ?? { changeId: "example" });
  } catch (error) {
    assert.match(String(error), /Verification unsuccessful/);
  }
  assert.equal(emitted.length, 1);
  return {
    result: emitted[0],
    repairs,
    verifies,
    judges,
    assessments,
    questions,
  };
}
test("initial conclusive verification is free and suggestions are retained", async (t) => {
  const f = await graph(t, { suggestions: true });
  assert.equal(f.result.outcome, "success");
  assert.equal(f.repairs, 0);
  assert.equal(f.assessments, 0);
  assert.equal(f.verifies, 1);
  assert.equal(f.result.remaining[0].severity, "SUGGESTION");
  assert.match(f.result.report?.report ?? "", /Verification at 0/);
});
test("normal repair always returns to fresh verification; tenth repair succeeds", async (t) => {
  const f = await graph(t, { repairs: 10 });
  assert.equal(f.result.outcome, "success");
  assert.equal(f.result.repairAttempts, 10);
  assert.equal(f.verifies, 11);
  assert.equal(f.judges, 11);
});
test("blocking after repair ten stops before eleventh assessment steering or repair", async (t) => {
  for (const escalation of [false, true]) {
    const f = await graph(t, { repairs: 11, escalation });
    assert.equal(f.result.outcome, "limit_reached");
    assert.equal(f.repairs, 10);
    assert.equal(f.verifies, 11);
    assert.equal(f.assessments, 10);
    assert.equal(f.questions, escalation ? 10 : 0);
  }
});
test("tenth repair crash counts dispatch and retains failed outcome", async (t) => {
  const f = await graph(t, { repairs: 10, fail: "repair", failureAt: 10 });
  assert.equal(f.result.outcome, "failed");
  assert.equal(f.result.repairAttempts, 10);
  assert.equal(f.verifies, 10);
});
test("accepted claims cannot override warnings missing evidence or reopened tasks", async (t) => {
  for (const options of [
    { repairs: 1 },
    { missing: true },
    { repairs: 1, reopened: true },
  ]) {
    const f = await graph(t, { ...options, forceAccepted: true });
    assert.equal(
      f.result.outcome,
      options.missing || options.reopened ? "limit_reached" : "success",
    );
    if (options.reopened)
      assert.ok(f.result.remaining.some((f) => f.id.startsWith("flow-task-")));
  }
});
test("incomplete entry dispatches no agents; malformed selection emits failed", async (t) => {
  for (const options of [
    { incompleteEntry: true },
    { input: {} },
    { input: { changeId: "missing" } },
  ]) {
    const f = await graph(t, options);
    assert.equal(f.result.outcome, "failed");
    assert.equal(f.verifies, 0);
    assert.equal(f.repairs, 0);
  }
});
test("inconclusive reports fail without repair retry or assessment", async (t) => {
  const f = await graph(t, { inconclusive: true });
  assert.equal(f.result.outcome, "failed");
  assert.equal(f.verifies, 1);
  assert.equal(f.assessments, 0);
});
test("mixed batch carries all scoped answers across fresh cycles", async (t) => {
  const f = await graph(t, { repairs: 2, escalation: true });
  assert.equal(f.result.outcome, "success");
  assert.equal(f.questions, 2);
});
test("unavailable cancelled malformed and failed steering dispatch no repair", async (t) => {
  for (const steering of [
    "needs_human",
    "cancelled",
    "failed",
    "malformed",
  ] as const) {
    const f = await graph(t, { repairs: 1, escalation: true, steering });
    assert.equal(
      f.result.outcome,
      steering === "malformed" ? "failed" : steering,
    );
    assert.equal(f.repairs, 0);
  }
});
test("guarded phase failures and timeouts produce diagnostics without retries", async (t) => {
  for (const fail of [
    "verify",
    "repair",
    "judge",
    "assess",
    "refresh",
  ] as const) {
    const f = await graph(t, { repairs: 1, fail });
    assert.equal(f.result.outcome, "failed");
    assert.ok(f.result.summary);
    assert.equal(
      f.result.repairAttempts,
      fail === "repair" || fail === "refresh" ? 1 : 0,
    );
    assert.equal(f.verifies, 1);
  }
  const timed = await graph(t, { timeout: true });
  assert.equal(timed.result.outcome, "failed");
  assert.equal(timed.judges, 0);
  assert.equal(timed.repairs, 0);
});
test("all executable phases guard cancellation and failure before output routing; sessions are fresh", () => {
  const flow = createVerifyFlow();
  for (const id of [
    "preflight",
    "refresh",
    "verify",
    "evidence",
    "judge",
    "classification",
    "budget",
    "assess",
    "resolution_route",
    "steering",
    "authorize",
    "repair",
  ]) {
    const edge = flow.edges.find((edge) => edge.from === id);
    assert.ok(edge && "switch" in edge);
    assert.equal(edge.switch.on, "$result.outcome", id);
    assert.equal(edge.switch.cases.cancelled, "cancelled", id);
    assert.equal(edge.switch.cases.failed, "failed", id);
    assert.equal(edge.switch.cases.timed_out, "failed", id);
  }
  for (const id of ["verify", "judge", "assess", "repair"]) {
    const node = flow.nodes[id];
    assert.equal(node.nodeType, "acp");
    assert.ok(node.nodeType === "acp");
    assert.deepEqual(node.session, { isolated: true });
    assert.equal(typeof node.cwd, "function");
  }
});
test("active interruption emits once before runner routing and counts interrupted repair", async () => {
  for (const nodeId of ["verify", "judge", "assess", "repair", "steering"]) {
    const emitted: VerifyResult[] = [];
    const flow = createVerifyFlow({ emit: (result) => emitted.push(result) });
    const controller = new AbortController();
    const c = {
      signal: controller.signal,
      input: { changeId: "example" },
      outputs: { preflight: { cwd: "/workspace", changeId: "example" } },
      state: { runId: `interrupted-${nodeId}`, steps: [{ nodeId: "repair" }] },
      results: {},
    } as unknown as FlowNodeContext;
    const node = flow.nodes[nodeId];
    if (node.nodeType === "acp") {
      assert.equal(typeof node.cwd, "function");
      if (typeof node.cwd === "function") await node.cwd(c);
    } else {
      assert.equal(nodeId, "steering");
      // Call its observer through the same callback, then let the inner packet
      // lookup fail; global interruption is independently observed on signal.
      assert.ok("run" in node && node.run);
      if ("run" in node && node.run)
        await assert.rejects(Promise.resolve().then(() => node.run?.(c)));
    }
    const interrupted = new Error("Interrupted");
    interrupted.name = "InterruptedError";
    controller.abort(interrupted);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].outcome, "cancelled");
    assert.equal(emitted[0].repairAttempts, nodeId === "repair" ? 2 : 1);
    const finish = flow.nodes.cancelled;
    assert.ok("run" in finish && finish.run);
    if ("run" in finish && finish.run) await finish.run(c);
    assert.equal(
      emitted.length,
      1,
      "a later terminal route cannot double emit",
    );
  }
});
test("timeouts remain guarded failures rather than interruption outcomes", async () => {
  const emitted: VerifyResult[] = [];
  const flow = createVerifyFlow({ emit: (result) => emitted.push(result) });
  const controller = new AbortController();
  const c = {
    signal: controller.signal,
    input: {},
    outputs: { preflight: { cwd: "/workspace", changeId: "example" } },
    state: { runId: "timeout-observer", steps: [] },
    results: {},
  } as unknown as FlowNodeContext;
  const node = flow.nodes.verify;
  assert.ok(node.nodeType === "acp" && typeof node.cwd === "function");
  if (node.nodeType === "acp" && typeof node.cwd === "function")
    await node.cwd(c);
  const timed = new Error("Timed out");
  timed.name = "TimeoutError";
  controller.abort(timed);
  assert.equal(emitted.length, 0);
});
test("current evidence synthesis remains deterministic", () => {
  const r = {
    findings: [],
    missingEvidence: [],
    gates: [],
    noApplicableGates: null,
    dimensions: {},
  } as unknown as Report;
  const c = {
    state: "ready",
    tasks: [{ id: "reopened", description: "Reopened", done: false }],
    instructions: {},
  } as Snapshot;
  assert.deepEqual(
    currentReport(r, c).findings.map((f) => f.id),
    ["flow-gates", "flow-task-0"],
  );
});
