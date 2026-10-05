import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { type FlowNodeContext, FlowRunner } from "acpx/flows";
import { SteeringError } from "../shared/steering.js";
import { createImplementFlow, type ImplementResult } from "./flow.js";
import type { Report } from "./helpers.js";

test("implementation and repair allow 90 minutes for project gates", () => {
  const flow = createImplementFlow();
  for (const id of ["apply", "repair"]) {
    assert.equal(flow.nodes[id].timeoutMs, 90 * 60 * 1000, id);
  }
});

interface Options {
  repairs?: number;
  escalation?: boolean;
  unsupported?: "tasks" | "gates" | "stale";
  fail?: "apply" | "repair" | "judge" | "snapshot";
  steering?: "cancelled" | "needs_human" | "malformed";
  blocked?: boolean;
  timeout?: boolean;
}
async function graph(t: TestContext, options: Options = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "implement-graph-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const changeRoot = join(cwd, "openspec/changes/example");
  await mkdir(changeRoot, { recursive: true });
  let repairs = 0;
  let refreshes = 0;
  let judgments = 0;
  let steering = 0;
  const emitted: ImplementResult[] = [];
  const required = options.repairs ?? (options.unsupported === "stale" ? 1 : 0);
  const done = () => repairs >= required && !options.unsupported;
  const flow = createImplementFlow({
    cwd,
    command: async (args) => {
      if (args[0] === "instructions") {
        refreshes++;
        if (options.fail === "snapshot") throw new Error("Snapshot failure");
      }
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
                  state: options.blocked
                    ? "blocked"
                    : done()
                      ? "all_done"
                      : "ready",
                  contextFiles: {},
                  tasks: [
                    {
                      id: "1",
                      description: "Implement",
                      done:
                        options.unsupported === "tasks"
                          ? false
                          : repairs >= required,
                    },
                  ],
                },
        ),
        stderr: "",
        exitCode: 0,
      };
    },
    steering: async (issues) => {
      steering++;
      for (const issue of issues)
        assert.ok(issue.issue.includes("Requested authorization scope:"));
      if (
        options.steering === "cancelled" ||
        options.steering === "needs_human"
      )
        throw new SteeringError(options.steering, "Fixture stopped");
      return options.steering === "malformed"
        ? {}
        : Object.fromEntries(
            issues.map((issue) => [
              issue.id,
              "Explicitly authorize design section 2 only",
            ]),
          );
    },
    emit: (result) => emitted.push(result),
  });
  const report = (): Report => ({
    summary: `Report at repair ${repairs}`,
    completedTasks: repairs >= required ? ["1"] : [],
    remainingTasks:
      options.unsupported === "tasks" || repairs < required ? ["1"] : [],
    blockers:
      !done() && options.escalation
        ? [
            {
              id: `cycle-${repairs}`,
              issue: "Design ambiguity",
              recommendation: "Clarify",
              escalation: true,
              scope: "Design section 2",
            },
          ]
        : [],
    gates:
      options.unsupported === "gates"
        ? []
        : [
            {
              command: "npm test",
              exitCode: 0,
              afterEdits: true,
              attempt: options.unsupported === "stale" ? 0 : repairs,
            },
          ],
    noApplicableGates: null,
    delegatedGroups: [],
  });
  flow.nodes.apply = {
    nodeType: "compute",
    run: () => {
      if (options.fail === "apply") throw new Error("Apply failure");
      return report();
    },
  };
  if (options.timeout)
    flow.nodes.apply = {
      nodeType: "compute",
      timeoutMs: 10,
      run: (context: FlowNodeContext) =>
        new Promise((_resolve, reject) => {
          const signal = context.signal;
          assert.ok(signal);
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    };
  flow.nodes.repair = {
    nodeType: "compute",
    run: (c: FlowNodeContext) => {
      repairs++;
      if (options.fail === "repair") throw new Error("Repair failure");
      if (options.escalation)
        assert.equal((c.outputs.authorize as unknown[]).length, repairs);
      return report();
    },
  };
  flow.nodes.judge = {
    nodeType: "compute",
    run: () => {
      judgments++;
      if (options.fail === "judge") return { route: "invalid" };
      return {
        route: options.unsupported
          ? "completed"
          : done()
            ? "completed"
            : options.escalation
              ? "escalation_required"
              : "repairable_pause",
      };
    },
  };
  flow.nodes.assess = {
    nodeType: "compute",
    run: () => ({
      ...report(),
      blockers: [
        {
          id: `assessment-${repairs}`,
          issue: "Missing artifact",
          recommendation: "Create with consent",
          escalation: true,
          scope: "Missing tasks artifact",
        },
      ],
    }),
  };
  const runner = new FlowRunner({
    resolveAgent: () => ({ agentName: "unused", agentCommand: "false", cwd }),
    permissionMode: "approve-reads",
    outputRoot: join(cwd, "runs"),
  });
  try {
    await runner.run(flow, { changeId: "example" });
  } catch (error) {
    assert.match(String(error), /Implementation unsuccessful/);
  }
  assert.equal(emitted.length, 1);
  return { result: emitted[0], repairs, refreshes, judgments, steering };
}

test("graph immediate task-and-gate success refreshes after initial apply", async (t) => {
  const f = await graph(t);
  assert.equal(f.result.outcome, "success");
  assert.equal(f.refreshes, 2);
  assert.equal(f.judgments, 1);
  assert.equal(f.repairs, 0);
  assert.deepEqual(f.result.remaining, {
    tasks: [],
    reportedTasks: [],
    blockers: [],
  });
});
test("normal repair reports are judged and tenth repair may succeed", async (t) => {
  const f = await graph(t, { repairs: 10 });
  assert.equal(f.result.outcome, "success");
  assert.equal(f.result.repairAttempts, 10);
  assert.equal(f.judgments, 11);
  assert.equal(f.refreshes, 12);
});
test("both pause categories exhaust before eleventh repair or extra steering", async (t) => {
  for (const escalation of [false, true]) {
    const f = await graph(t, { repairs: 11, escalation });
    assert.equal(f.result.outcome, "limit_reached");
    assert.equal(f.repairs, 10);
    assert.equal(f.judgments, 11);
    assert.equal(f.steering, escalation ? 10 : 0);
  }
});
test("unsupported completed claims cannot bypass tasks gates or fresh evidence", async (t) => {
  for (const unsupported of ["tasks", "gates", "stale"] as const) {
    const f = await graph(t, { unsupported });
    assert.equal(f.result.outcome, "limit_reached");
    assert.equal(f.repairs, 10);
  }
});
test("mixed consequential blockers collect scoped accumulated authorization", async (t) => {
  const f = await graph(t, { repairs: 2, escalation: true });
  assert.equal(f.result.outcome, "success");
  assert.equal(f.steering, 2);
  assert.deepEqual(f.result.remaining.blockers, []);
});
test("steering cancellation unavailable input and malformed answers stop before repair", async (t) => {
  for (const steering of ["cancelled", "needs_human", "malformed"] as const) {
    const f = await graph(t, { repairs: 1, escalation: true, steering });
    assert.equal(f.repairs, 0);
    assert.equal(
      f.result.outcome,
      steering === "malformed" ? "failed" : steering,
    );
    assert.equal(f.result.remaining.blockers.length, 1);
  }
});
test("guarded failures emit terminal fields and failed dispatches count without retry", async (t) => {
  for (const fail of ["apply", "repair", "judge", "snapshot"] as const) {
    const f = await graph(t, { repairs: 1, fail });
    assert.equal(f.result.outcome, "failed");
    assert.equal(f.result.repairAttempts, fail === "repair" ? 1 : 0);
    assert.equal(f.result.changeId, "example");
    assert.ok(f.result.summary);
    assert.ok(Array.isArray(f.result.remaining.tasks));
    assert.equal(f.repairs, fail === "repair" ? 1 : 0);
  }
});
test("blocked CLI state cannot be bypassed even by completion judgment", async (t) => {
  const f = await graph(t, { blocked: true, steering: "needs_human" });
  assert.equal(f.result.outcome, "needs_human");
  assert.equal(f.repairs, 0);
  assert.equal(f.steering, 1);
});

test("phase timeout is guarded and never silently retried", async (t) => {
  const f = await graph(t, { timeout: true });
  assert.equal(f.result.outcome, "failed");
  assert.equal(f.result.repairAttempts, 0);
  assert.equal(f.judgments, 0);
  assert.match(f.result.summary, /timed out|timeout/i);
});
