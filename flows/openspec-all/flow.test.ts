import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { lstat, rename, symlink } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  compute,
  defineFlow,
  type FlowDefinition,
  type FlowNodeContext,
} from "acpx/flows";
import { createFinalizeFlow } from "../openspec-finalize/flow.js";
import { createGroomFlow } from "../openspec-groom/flow.js";
import { createImplementFlow } from "../openspec-implement/flow.js";
import type { VerifyResult } from "../openspec-verify/flow.js";
import { createVerifyFlow } from "../openspec-verify/flow.js";
import { type AllDependencies, createAllFlow } from "./flow.js";
import {
  type ChildResult,
  sameTarget,
  stages,
  validateResult,
} from "./helpers.js";
import { fixture } from "./test-fixture.js";

function samples(
  id: string,
  destination: string,
): Record<(typeof stages)[number], ChildResult> {
  return {
    groom: {
      changeId: id,
      outcome: "success",
      updateAttempts: 0,
      summary: "Conclusive review",
      remaining: "No Critical findings",
    },
    implement: {
      changeId: id,
      outcome: "success",
      repairAttempts: 0,
      summary: "Tasks and gates complete",
      remaining: { tasks: [], reportedTasks: [], blockers: [] },
    },
    verify: {
      changeId: id,
      outcome: "success",
      repairAttempts: 0,
      summary: "Strict acceptance",
      remaining: [],
      report: {
        report: "Full current report",
        conclusive: true,
        dimensions: {
          completeness: {
            status: "checked",
            reason: "Tasks checked",
            evidence: ["tasks:1"],
          },
          correctness: {
            status: "checked",
            reason: "Correctness inspected",
            evidence: ["implementation:1"],
          },
          coherence: {
            status: "inapplicable",
            reason: "No design",
            evidence: [],
          },
        },
        findings: [],
        gates: [
          { command: "fixture gate", exitCode: 0, result: "Current output" },
        ],
        noApplicableGates: null,
        missingEvidence: [],
      },
    },
    finalize: {
      changeId: id,
      outcome: "success",
      summary: "No delta; archive confirmed",
      phase: "archive",
      failedPhase: null,
      phases: {
        preflight: "completed",
        prepare: "completed",
        sync: "not_applicable",
        assessment: "not_applicable",
        archive: "completed",
      },
      sync: null,
      assessment: null,
      remaining: [],
      archive: { destination, state: "archived" },
    },
  };
}
function nativeFactories(
  f: Awaited<ReturnType<typeof fixture>>,
  results: ReturnType<typeof samples>,
  hook?: (
    stage: (typeof stages)[number],
    emit: (r: ChildResult) => void,
    c: FlowNodeContext,
  ) => unknown,
): AllDependencies["factories"] {
  const factory =
    (stage: (typeof stages)[number]) => (deps: { emit?: (r: never) => void }) =>
      defineFlow({
        name: stage,
        startAt: "preflight",
        nodes: {
          preflight: compute({
            run: () => ({
              changeId: f.id,
              cwd: f.cwd,
              changeRoot: f.changeRoot,
            }),
          }),
          refresh: compute({
            run: () => ({
              state: "all_done",
              tasks: [],
              instructions: {},
              status: {},
            }),
          }),
          success: compute({
            run(c) {
              const emit = deps.emit as (r: ChildResult) => void;
              if (hook) return hook(stage, emit, c);
              emit(results[stage]);
              return results[stage];
            },
          }),
          unsuccessful: compute({
            run: () => {
              throw new Error("Intentional terminal unsuccessful");
            },
          }),
        },
        edges: [
          { from: "preflight", to: "refresh" },
          { from: "refresh", to: "success" },
        ],
      });
  return {
    groom: factory("groom") as typeof createGroomFlow,
    implement: factory("implement") as typeof createImplementFlow,
    verify: factory("verify") as typeof createVerifyFlow,
    finalize: factory("finalize") as typeof createFinalizeFlow,
  };
}

for (const input of [
  undefined,
  {},
  { changeId: "fixture-change", store: "no" },
  { changeId: "../escape" },
  { changeId: "archived-change" },
])
  test(`unsupported pipeline input ${JSON.stringify(input)} dispatches no stage`, async (t) => {
    const f = await fixture(t);
    await assert.rejects(f.runner.run(f.flow, input), /pipeline unsuccessful/);
    assert.equal(f.emitted.length, 1);
    assert.equal(f.emitted[0].workspace, null);
    assert.ok(
      f.emitted[0].stages.every(
        (s) => s.status === "not_started" && s.result === null,
      ),
    );
    const [state] = await f.states();
    assert.ok(!state.steps.some((s) => s.nodeId.includes(":")));
    assert.ok(await lstat(f.changeRoot));
  });

test("store-backed workspace is rejected before stage writes", async (t) => {
  const f = await fixture(t);
  // A status claiming store-backed scope must fail shared local-target checks.
  await assert.rejects(
    f.runner.run(
      createAllFlow({
        ...f.deps,
        command: async (args, cwd, signal) =>
          args[0] === "status"
            ? {
                stdout: JSON.stringify({
                  ...f.status,
                  planningHome: { kind: "store", root: f.cwd },
                }),
                stderr: "",
                exitCode: 0,
              }
            : f.command(args, cwd, signal),
      }),
      { changeId: f.id },
    ),
    /pipeline unsuccessful/,
  );
  assert.ok(f.emitted[0].stages.every((s) => s.status === "not_started"));
});

for (const kind of ["root", "change"] as const)
  test(`symlinked/escaping ${kind} rejects before stage writes`, async (t) => {
    const f = await fixture(t);
    const source = kind === "root" ? join(f.cwd, "openspec") : f.changeRoot;
    const moved = join(f.base, `escaped-${kind}`);
    await rename(source, moved);
    await symlink(moved, source);
    await assert.rejects(
      f.runner.run(f.flow, { changeId: f.id }),
      /pipeline unsuccessful/,
    );
    assert.ok(
      f.emitted[0].stages.every(
        (s) => s.status === "not_started" && s.result === null,
      ),
    );
  });

for (const targetStage of stages)
  for (const fault of [
    "missing",
    "malformed",
    "wrong-id",
    "duplicate-conflict",
    "wrong-return",
    "unexpected-throw",
    "contradictory-success",
  ] as const)
    test(`native ${targetStage} gate rejects ${fault} without inferred child success`, async (t) => {
      const f = await fixture(t, { noDelta: true });
      const results = samples(f.id, f.destination);
      const factories = nativeFactories(f, results, (stage, emit) => {
        const result = results[stage];
        if (stage !== targetStage) {
          emit(result);
          return result;
        }
        if (fault === "unexpected-throw")
          throw new Error("Unexpected terminal exception");
        const contradictions = {
          groom: { remaining: { route: "invalid" } },
          implement: {
            remaining: {
              tasks: [],
              reportedTasks: ["unfinished"],
              blockers: [],
            },
          },
          verify: { report: null },
          finalize: {
            archive: { destination: f.destination, state: "moved_unconfirmed" },
          },
        };
        if (fault !== "missing")
          emit(
            (fault === "malformed"
              ? { changeId: f.id, outcome: "success" }
              : fault === "wrong-id"
                ? { ...result, changeId: "other-change" }
                : fault === "contradictory-success"
                  ? { ...result, ...contradictions[stage] }
                  : result) as ChildResult,
          );
        if (fault === "duplicate-conflict")
          emit({ ...result, summary: "different terminal result" });
        return fault === "wrong-return"
          ? { ...result, summary: "mismatching returned result" }
          : result;
      });
      await assert.rejects(
        f.runner.run(createAllFlow({ ...f.deps, factories }), {
          changeId: f.id,
        }),
        /pipeline unsuccessful/,
      );
      assert.equal(f.emitted.length, 1);
      assert.equal(f.emitted[0].outcome, "failed");
      assert.equal(f.emitted[0].failedStage, targetStage);
      assert.ok(
        f.emitted[0].stages
          .slice(stages.indexOf(targetStage) + 1)
          .every((s) => s.status === "not_started"),
      );
      if (
        [
          "missing",
          "malformed",
          "wrong-id",
          "unexpected-throw",
          "contradictory-success",
        ].includes(fault)
      )
        assert.equal(
          f.emitted[0].stages[stages.indexOf(targetStage)].result,
          null,
        );
    });

test("identical emitter capture is idempotent; target drift blocks later callbacks", async (t) => {
  const f = await fixture(t, { noDelta: true });
  const results = samples(f.id, f.destination);
  const factories = nativeFactories(f, results, (stage, emit) => {
    emit(results[stage]);
    emit(results[stage]);
    return results[stage];
  });
  await f.runner.run(createAllFlow({ ...f.deps, factories }), {
    changeId: f.id,
  });
  assert.equal(f.emitted.length, 1);
  const drifted = nativeFactories(f, results);
  const groom = drifted?.groom;
  assert.ok(groom);
  drifted.groom = (deps) => {
    const graph = groom(deps);
    graph.nodes.preflight = compute({
      run: () => ({ changeId: f.id, cwd: f.base, changeRoot: f.changeRoot }),
    });
    return graph as ReturnType<typeof createGroomFlow>;
  };
  await assert.rejects(
    f.runner.run(createAllFlow({ ...f.deps, factories: drifted }), {
      changeId: f.id,
    }),
    /pipeline unsuccessful/,
  );
  assert.equal(f.emitted[1].outcome, "failed");
  assert.equal(f.emitted[1].stages[0].result, null);
  assert.equal(f.emitted[1].stages[1].status, "not_started");
});

test("result validators reject malformed/contradictory child contracts without weakening acceptance", () => {
  const valid = samples("example", "/archive/example");
  for (const stage of stages) {
    assert.strictEqual(
      validateResult(stage, valid[stage], "example"),
      valid[stage],
    );
    for (const common of [
      { summary: "" },
      { outcome: "ok" },
      { changeId: "other" },
      { unsupportedField: true },
      { remaining: undefined },
    ])
      assert.throws(() =>
        validateResult(stage, { ...valid[stage], ...common }, "example"),
      );
  }
  assert.throws(() =>
    validateResult(
      "implement",
      {
        ...valid.implement,
        remaining: { tasks: [], reportedTasks: ["unfinished"], blockers: [] },
      },
      "example",
    ),
  );
  assert.throws(() =>
    validateResult(
      "verify",
      {
        ...valid.verify,
        report: { ...(valid.verify as VerifyResult).report, conclusive: false },
      },
      "example",
    ),
  );
  assert.throws(() =>
    validateResult(
      "verify",
      {
        ...valid.verify,
        report: {
          ...(valid.verify as VerifyResult).report,
          missingEvidence: ["Absent test"],
        },
      },
      "example",
    ),
  );
  assert.throws(() =>
    validateResult(
      "finalize",
      {
        ...valid.finalize,
        archive: {
          destination: "/archive/example",
          state: "moved_unconfirmed",
        },
      },
      "example",
    ),
  );
  for (const stage of ["groom", "implement", "verify"] as const)
    assert.throws(() =>
      validateResult(
        stage,
        { ...valid[stage], outcome: "limit_reached" },
        "example",
      ),
    );
  const target = {
    changeId: "example",
    cwd: "/repo",
    changeRoot: "/repo/openspec/changes/example",
    status: {},
  };
  for (const field of ["changeId", "cwd", "changeRoot"])
    assert.throws(() => sameTarget({ ...target, [field]: "changed" }, target));
});

test("native graph retains factory ACP configuration, policies, authorization and steering timeouts", () => {
  const flow = createAllFlow();
  const originals: Record<string, FlowDefinition> = {
    groom: createGroomFlow(),
    implement: createImplementFlow(),
    verify: createVerifyFlow(),
    finalize: createFinalizeFlow(),
  };
  for (const stage of stages)
    for (const [id, node] of Object.entries(originals[stage].nodes)) {
      const scoped = flow.nodes[`${stage}:${id}`];
      assert.equal(scoped.nodeType, node.nodeType);
      assert.equal(scoped.timeoutMs, node.timeoutMs);
      if (scoped.nodeType === "acp" && node.nodeType === "acp") {
        assert.equal(scoped.profile, node.profile);
        assert.deepEqual(scoped.session, node.session);
        assert.deepEqual(scoped.session, { isolated: true });
      }
    }
  assert.ok(Object.keys(flow.nodes).every((id) => !id.includes("retry")));
});

test("already-aborted callback emits once, skips invoke, and cleans parent listener", async (t) => {
  const f = await fixture(t, { noDelta: true });
  const controller = new AbortController();
  controller.abort(
    Object.assign(new Error("Interrupted"), { name: "InterruptedError" }),
  );
  const now = new Date().toISOString();
  const c: FlowNodeContext = {
    input: { changeId: f.id },
    outputs: {},
    results: {},
    services: {},
    signal: controller.signal,
    runShell: async () => {
      throw new Error("unused");
    },
    state: {
      runId: "manual-attempt",
      flowName: "openspec-all",
      input: { changeId: f.id },
      outputs: {},
      results: {},
      steps: [],
      status: "running",
      startedAt: now,
      updatedAt: now,
      sessionBindings: {},
    },
  };
  const node = f.flow.nodes["groom:preflight"];
  assert.ok("run" in node && node.run);
  assert.throws(() => node.run?.(c), /cancelled/);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(f.emitted.length, 1);
  assert.equal(f.emitted[0].outcome, "cancelled");
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.ok(f.emitted[0].stages.every((s) => s.result === null));
});
