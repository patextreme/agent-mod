import assert from "node:assert/strict";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { type FlowNodeContext, FlowRunner } from "acpx/flows";
import { createFinalizeFlow, type FinalizeResult } from "./flow.js";
import {
  parseAssessment,
  type SyncInputs,
  type WorkerReport,
} from "./helpers.js";
import { accepted, fixture, merged, original } from "./test-fixture.js";

const interrupted = () =>
  Object.assign(new Error("Interrupted"), { name: "InterruptedError" });
const context = (signal?: AbortSignal): FlowNodeContext =>
  ({
    signal,
    input: { changeId: "example" },
    outputs: { preflight: { changeId: "example", cwd: "/workspace" } },
    results: {},
    services: {},
    state: { runId: "fixture", steps: [] },
  }) as unknown as FlowNodeContext;

test("native graph has exactly fresh sync and independent assessor; executable outcomes guarded", () => {
  const flow = createFinalizeFlow();
  assert.deepEqual(
    Object.entries(flow.nodes)
      .filter(([, n]) => n.nodeType === "acp")
      .map(([id]) => id),
    ["sync", "assess"],
  );
  for (const id of ["sync", "assess"]) {
    const node = flow.nodes[id];
    assert.ok(node.nodeType === "acp");
    assert.equal(node.profile, "pi");
    assert.deepEqual(node.session, { isolated: true });
    assert.equal(node.timeoutMs, 90 * 60 * 1000);
  }
  for (const id of [
    "preflight",
    "prepare",
    "selection",
    "sync",
    "sync_result",
    "current",
    "assess",
    "acceptance",
    "no_delta",
    "archive",
  ]) {
    const edge = flow.edges.find((e) => e.from === id);
    assert.ok(edge && "switch" in edge);
    assert.equal(edge.switch.on, "$result.outcome");
    assert.deepEqual(Object.keys(edge.switch.cases).sort(), [
      "cancelled",
      "failed",
      "ok",
      "timed_out",
    ]);
  }
  assert.ok(
    !Object.keys(flow.nodes).some((id) => /verify|repair|steer/.test(id)),
  );
});
for (const id of ["sync", "assess"])
  test(`${id} attempt cancellation before routing emits once and prevents later dispatch`, async () => {
    const emitted: FinalizeResult[] = [];
    const flow = createFinalizeFlow({ emit: (r) => emitted.push(r) });
    const controller = new AbortController();
    const c = context(controller.signal);
    const node = flow.nodes[id];
    assert.ok(node.nodeType === "acp" && typeof node.cwd === "function");
    await node.cwd(c);
    controller.abort(interrupted());
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].outcome, "cancelled");
    assert.equal(
      emitted[0].phases[id === "sync" ? "sync" : "assessment"],
      "failed",
    );
    assert.equal(emitted[0].phases.archive, "not_started");
    const later = flow.nodes.archive;
    assert.ok("run" in later && later.run);
    await assert.rejects(
      Promise.resolve().then(() => later.run?.(c)),
      /cancelled/,
    );
    const terminal = flow.nodes.cancelled;
    assert.ok("run" in terminal && terminal.run);
    await terminal.run(c);
    assert.equal(emitted.length, 1);
  });
test("already-aborted attempt observed on installation without dispatch or completion", async () => {
  const emitted: FinalizeResult[] = [];
  const flow = createFinalizeFlow({ emit: (r) => emitted.push(r) });
  const controller = new AbortController();
  controller.abort(interrupted());
  const node = flow.nodes.sync;
  assert.ok(node.nodeType === "acp" && typeof node.cwd === "function");
  const cwd = node.cwd;
  assert.throws(() => cwd(context(controller.signal)), /cancelled/);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].sync, null);
  assert.equal(emitted[0].archive.state, "not_started");
});
test("timeout is not interruption; guarded routing owns operational failures", async () => {
  const emitted: FinalizeResult[] = [];
  const flow = createFinalizeFlow({ emit: (r) => emitted.push(r) });
  const controller = new AbortController();
  const node = flow.nodes.sync;
  assert.ok(node.nodeType === "acp" && typeof node.cwd === "function");
  await node.cwd(context(controller.signal));
  controller.abort(
    Object.assign(new Error("timeout"), { name: "TimeoutError" }),
  );
  assert.equal(emitted.length, 0);
});
test("ACP parse ends listener scope; callback gaps deliberately have no flow-owned coverage", async () => {
  const emitted: FinalizeResult[] = [];
  const flow = createFinalizeFlow({ emit: (r) => emitted.push(r) });
  const controller = new AbortController();
  const c = context(controller.signal);
  const node = flow.nodes.sync;
  assert.ok(
    node.nodeType === "acp" && typeof node.cwd === "function" && node.parse,
  );
  let additions = 0;
  let removals = 0;
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (
    ...args: Parameters<AbortSignal["addEventListener"]>
  ) => {
    additions++;
    add(...args);
  };
  controller.signal.removeEventListener = (
    ...args: Parameters<AbortSignal["removeEventListener"]>
  ) => {
    removals++;
    remove(...args);
  };
  await node.cwd(c);
  await node.parse(
    JSON.stringify({
      outcome: "success",
      summary: "claim",
      issues: [],
      placeholders: [],
    }),
    c,
  );
  assert.equal(additions, 1);
  assert.equal(removals, 1);
  controller.abort(interrupted());
  assert.equal(
    emitted.length,
    0,
    "persisted acpx history/transcripts, not fabricated completion, diagnose gaps",
  );
});
test("malformed ACP parse cleans listener; fresh next attempt is separately observed", async () => {
  const emitted: FinalizeResult[] = [];
  const flow = createFinalizeFlow({ emit: (r) => emitted.push(r) });
  const first = new AbortController();
  const node = flow.nodes.sync;
  assert.ok(
    node.nodeType === "acp" && typeof node.cwd === "function" && node.parse,
  );
  const c = context(first.signal);
  await node.cwd(c);
  const parse = node.parse;
  assert.throws(() => parse("not JSON", c));
  first.abort(interrupted());
  assert.equal(emitted.length, 0);
  const second = new AbortController();
  await node.cwd({ ...c, signal: second.signal });
  second.abort(interrupted());
  assert.equal(emitted.length, 1);
});
for (const drift of [
  "delta",
  "main",
  "selection",
  "no-delta-to-delta",
] as const)
  test(`real runner blocks archive on ${drift} drift without assessment retry`, async (t) => {
    const f = await fixture(t, { noDelta: drift === "no-delta-to-delta" });
    const emitted: FinalizeResult[] = [];
    const flow = createFinalizeFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (r) => emitted.push(r),
    });
    let assessmentCount = 0;
    flow.nodes.sync = {
      nodeType: "compute",
      run: async (c) => {
        await f.apply(c.outputs.prepare as SyncInputs);
        return f.sync as WorkerReport;
      },
    };
    flow.nodes.assess = {
      nodeType: "compute",
      run: async (c) => {
        assessmentCount++;
        const inputs = c.outputs.prepare as SyncInputs;
        const report = parseAssessment(
          JSON.stringify(accepted(inputs)),
          inputs,
        );
        if (drift === "delta")
          await writeFile(
            f.deltaPath,
            `${inputs.capabilities[0].delta}\nNew drift\n`,
          );
        if (drift === "main")
          await writeFile(f.mainPath, `${merged}\nNew dirty edit\n`);
        if (drift === "selection")
          f.status.artifactPaths.specs.existingOutputPaths.pop();
        return report;
      },
    };
    if (drift === "no-delta-to-delta") {
      const noDelta = flow.nodes.no_delta;
      assert.ok("run" in noDelta && noDelta.run);
      const run = noDelta.run;
      flow.nodes.no_delta = {
        nodeType: "compute",
        run: async (c) => {
          const output = await run(c);
          await mkdir(dirname(f.freshPath), { recursive: true });
          await writeFile(f.freshPath, f.freshDelta);
          f.status.artifactPaths.specs.existingOutputPaths = [f.freshPath];
          return output;
        },
      };
    }
    const runner = new FlowRunner({
      resolveAgent: () => ({
        agentName: "unused",
        agentCommand: "false",
        cwd: f.cwd,
      }),
      permissionMode: "approve-reads",
      outputRoot: `${f.base}/runs`,
    });
    await assert.rejects(
      runner.run(flow, { changeId: f.id }),
      /Finalization unsuccessful/,
    );
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].failedPhase, "archive");
    assert.equal(emitted[0].archive.state, "failed");
    assert.equal(assessmentCount, drift === "no-delta-to-delta" ? 0 : 1);
    await f.unchanged();
    if (drift === "main")
      assert.match(await readFile(f.mainPath, "utf8"), /New dirty edit/);
  });

for (const scenario of [
  {
    label: "star rename",
    delta:
      "## RENAMED Requirements\n* FROM: `### Requirement: Old name`\n* TO: `### Requirement: New name`\n",
    missing: "RENAMED:Old name->New name",
  },
  {
    label: "plus rename with normalized names",
    delta:
      "## renamed requirements\n+ FROM: `###Requirement: Old name ###`\n+ TO: `###Requirement: New name ###`\n",
    missing: "RENAMED:Old name->New name",
  },
  {
    label: "lowercase removal section",
    delta: "## Removed Requirements\n### Requirement: Legacy\n",
    missing: "REMOVED:Legacy",
  },
  {
    label: "lowercase addition header",
    delta:
      "## ADDED Requirements\n### requirement: Missing\nThe system SHALL add missing behavior.\n",
    missing: "ADDED:Missing",
  },
  {
    label: "lowercase modification section/header",
    delta:
      "## modified requirements\n###requirement: Login ###\nThe system SHALL update login.\n",
    missing: "MODIFIED:Login",
  },
  {
    label: "rename without evidence",
    delta:
      "## Renamed Requirements\nFROM: ###Requirement: Old name\nTO: ###Requirement: New name\n",
    missing: "RENAMED:Old name->New name",
    noEvidence: true,
  },
])
  test(`native runner rejects addition-only sync/assessment with ${scenario.label} before archive`, async (t) => {
    const f = await fixture(t);
    f.status.artifactPaths.specs.existingOutputPaths = [f.deltaPath];
    await writeFile(
      f.deltaPath,
      "## ADDED Requirements\n### Requirement: Fresh\nThe system SHALL add fresh behavior.\n" +
        scenario.delta,
    );
    const partial =
      original +
      "\n### Requirement: Fresh\nThe system SHALL add fresh behavior.\n";
    const results: FinalizeResult[] = [];
    const flow = createFinalizeFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (r) => results.push(r),
      now: () => new Date("2026-10-05Z"),
      move: async () =>
        assert.fail("Incomplete assessment must not move the change"),
    });
    let assessments = 0;
    flow.nodes.sync = {
      nodeType: "compute",
      run: async (c) => {
        const inputs = c.outputs.prepare as SyncInputs;
        assert.deepEqual(
          inputs.capabilities[0].operations.map((op) => op.id),
          ["ADDED:Fresh", scenario.missing],
        );
        await writeFile(f.mainPath, partial);
        return f.sync;
      },
    };
    flow.nodes.assess = {
      nodeType: "compute",
      run: (c) => {
        assessments++;
        const inputs = c.outputs.prepare as SyncInputs;
        const report = accepted(inputs);
        if (scenario.noEvidence) report.coverage[0].operations[1].evidence = [];
        else
          report.coverage[0].operations = report.coverage[0].operations.filter(
            (op) => op.id === "ADDED:Fresh",
          );
        return parseAssessment(JSON.stringify(report), inputs);
      },
    };
    const runner = new FlowRunner({
      resolveAgent: () => ({
        agentName: "unused",
        agentCommand: "false",
        cwd: f.cwd,
      }),
      permissionMode: "approve-reads",
      outputRoot: `${f.base}/runs`,
    });
    await assert.rejects(
      runner.run(flow, { changeId: f.id }),
      /Finalization unsuccessful/,
    );
    assert.equal(assessments, 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].failedPhase, "assessment");
    assert.equal(results[0].archive.state, "not_started");
    assert.equal(results[0].phases.archive, "not_started");
    assert.ok(await lstat(f.changeRoot));
    await assert.rejects(
      lstat(join(f.changesDir, "archive/2026-10-05-fixture-change")),
      { code: "ENOENT" },
    );
    assert.equal(await readFile(f.mainPath, "utf8"), partial);
    await f.unchanged();
  });

// Semantic workers are agents, not a deterministic merge implementation. This
// fixture exercises their explicit retirement/TBD contracts through the native
// graph while the real ACP fixtures above exercise prompt/session independence.
test("explicit retirement and new TBD Purpose are represented and independently covered", async (t) => {
  const f = await fixture(t);
  await writeFile(
    f.deltaPath,
    "# Delta\n\n## REMOVED Requirements\n\n### Requirement: Login\n\n### Requirement: Legacy\n\n### Requirement: Old name\n",
  );
  await writeFile(
    f.freshPath,
    f.freshDelta.replace(/## Purpose[\s\S]*?## ADDED/, "## ADDED"),
  );
  const results: FinalizeResult[] = [];
  const flow = createFinalizeFlow({
    cwd: f.cwd,
    command: f.command,
    emit: (r) => results.push(r),
  });
  flow.nodes.sync = {
    nodeType: "compute",
    run: async (c) => {
      const inputs = c.outputs.prepare as SyncInputs;
      assert.match(inputs.metadata ?? "", /retire_capabilities: true/);
      assert.equal(inputs.capabilities[0].operations.length, 3);
      await rm(f.mainPath);
      await mkdir(dirname(f.freshMain), { recursive: true });
      await writeFile(
        f.freshMain,
        "# New Specification\n\n## Purpose\nTBD: describe new capability.\n\n## Requirements\n\n### Requirement: New capability\nThe system SHALL create this capability.\n\n#### Scenario: Create\n- **WHEN** input arrives\n- **THEN** create output\n",
      );
      return {
        outcome: "success",
        summary: "Explicit retirement; new Purpose reported",
        issues: [],
        placeholders: ["new-capability"],
      };
    },
  };
  flow.nodes.assess = {
    nodeType: "compute",
    run: (c) => {
      const inputs = c.outputs.prepare as SyncInputs;
      const current = (
        c.outputs.current as { current: Record<string, string | null> }
      ).current;
      assert.equal(current[f.cap], null);
      assert.match(current["new-capability"] ?? "", /TBD/);
      const report = accepted(inputs);
      report.coverage[0].retirementEvidence = [
        "Explicit retire_capabilities: true authorizes absence after all three removals; not inferred from emptiness",
      ];
      report.coverage[0].purposeEvidence = [
        "Retired capability: Purpose correctly absent with whole spec",
      ];
      report.coverage[0].structureEvidence = [
        "Explicitly retired capability main file absent",
      ];
      report.coverage[0].preservationEvidence = [
        "Every baseline requirement explicitly removed, no unaffected content remains",
      ];
      report.coverage[1].purposeEvidence = [
        "Delta lacks Purpose; new main has reported TBD placeholder",
      ];
      return parseAssessment(JSON.stringify(report), inputs);
    },
  };
  const runner = new FlowRunner({
    resolveAgent: () => ({
      agentName: "unused",
      agentCommand: "false",
      cwd: f.cwd,
    }),
    permissionMode: "approve-reads",
    outputRoot: `${f.base}/runs`,
  });
  await runner.run(flow, { changeId: f.id });
  assert.equal(results[0].outcome, "success");
  assert.deepEqual(results[0].sync?.placeholders, ["new-capability"]);
  await f.unchanged();
});

for (const commandPhase of ["list", "status", "instructions"] as const)
  test(`native graph ${commandPhase} command failure emits one failed result without ACP dispatch`, async (t) => {
    const f = await fixture(t);
    const results: FinalizeResult[] = [];
    const flow = createFinalizeFlow({
      cwd: f.cwd,
      emit: (r) => results.push(r),
      command: async (args, cwd, signal) =>
        args[0] === commandPhase
          ? { stdout: "{}", stderr: "operational command failure", exitCode: 2 }
          : f.command(args, cwd, signal),
    });
    const runner = new FlowRunner({
      resolveAgent: () => ({
        agentName: "unused",
        agentCommand: "false",
        cwd: f.cwd,
      }),
      permissionMode: "approve-reads",
      outputRoot: `${f.base}/runs`,
    });
    await assert.rejects(
      runner.run(flow, { changeId: f.id }),
      /Finalization unsuccessful/,
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].outcome, "failed");
    assert.equal(
      results[0].failedPhase,
      commandPhase === "instructions" ? "prepare" : "preflight",
    );
    assert.equal(results[0].phases.sync, "not_started");
    assert.equal(results[0].archive.state, "not_started");
    assert.equal(await readFile(f.mainPath, "utf8"), original);
    await f.unchanged();
  });
