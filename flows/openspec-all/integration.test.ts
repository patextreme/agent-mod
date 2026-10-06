import assert from "node:assert/strict";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { createGroomFlow, type GroomResult } from "../openspec-groom/flow.js";
import {
  createImplementFlow,
  type ImplementResult,
} from "../openspec-implement/flow.js";
import {
  createVerifyFlow,
  type VerifyResult,
} from "../openspec-verify/flow.js";
import { collectSteering, SteeringError } from "../shared/steering.js";
import { createAllFlow } from "./flow.js";
import { type Stage, stages } from "./helpers.js";
import { fixture } from "./test-fixture.js";

for (const noDelta of [false, true])
  test(`single native pipeline ${noDelta ? "no-delta" : "independent multi-capability sync"} success has one aggregate`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(t, { noDelta });
    const run = await f.runner.run(f.flow, { changeId: f.id });
    assert.equal(run.state.status, "completed");
    assert.equal(f.emitted.length, 1);
    const result = f.emitted[0];
    assert.equal(result.outcome, "success");
    assert.equal(result.workspace, f.cwd);
    assert.equal(result.failedStage, null);
    assert.deepEqual(
      result.stages.map((s) => [s.stage, s.status, s.result?.changeId]),
      stages.map((stage) => [stage, "success", f.id]),
    );
    assert.equal(result.archive?.state, "archived");
    assert.equal(result.archive?.destination, f.destination);
    assert.deepEqual(
      f.messages.filter((s) => s.endsWith("starting")),
      stages.map((stage) => `[openspec-all:${stage}] starting`),
    );
    const acp = run.state.steps.filter((s) => s.nodeType === "acp");
    assert.deepEqual(
      acp.map((s) => s.nodeId),
      [
        "groom:review",
        "groom:classify",
        "implement:apply",
        "implement:judge",
        "verify:verify",
        "verify:judge",
        ...(noDelta ? [] : ["finalize:sync", "finalize:assess"]),
      ],
    );
    assert.equal(
      new Set(acp.map((s) => s.session?.acpSessionId)).size,
      acp.length,
    );
    assert.ok(acp.every((s) => s.session?.cwd === f.cwd));
    assert.equal(
      new Set(run.state.steps.map((s) => s.attemptId.split("#")[0])).has(
        "verify:verify",
      ),
      true,
    );
    assert.equal(
      result.finalization?.phases.assessment,
      noDelta ? "not_applicable" : "completed",
    );
    assert.match(
      await readFile(f.implementation, "utf8"),
      /KEEP DIRTY IMPLEMENTATION EDIT/,
    );
    assert.match(
      await readFile(`${f.destination}/proposal.md`, "utf8"),
      /KEEP DIRTY PLANNING EDIT/,
    );
    await f.unchanged();
    await assert.rejects(lstat(f.changeRoot));
  });

for (const scenario of [
  { fail: "groom:agent", stage: "groom" },
  { fail: "implement:agent", stage: "implement" },
  { fail: "verify:inconclusive", stage: "verify" },
  { fail: "finalize:mismatch", stage: "finalize" },
  { fail: "finalize:partial-sync", stage: "finalize" },
] as const)
  test(`native ${scenario.fail} preserves edits and prevents later stages`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(t, { fail: scenario.fail });
    await assert.rejects(
      f.runner.run(f.flow, { changeId: f.id }),
      /OpenSpec pipeline unsuccessful/,
    );
    assert.equal(f.emitted.length, 1);
    const report = f.emitted[0];
    assert.equal(report.outcome, "failed");
    assert.equal(report.failedStage, scenario.stage);
    assert.equal(
      report.stages[stages.indexOf(scenario.stage)].result?.outcome,
      "failed",
    );
    assert.deepEqual(
      report.stages.map((s) => s.status),
      stages.map((_, i) =>
        i < stages.indexOf(scenario.stage)
          ? "success"
          : i === stages.indexOf(scenario.stage)
            ? "failed"
            : "not_started",
      ),
    );
    const [state] = await f.states();
    assert.equal(state.status, "failed");
    assert.ok(
      !state.steps.some((s) =>
        stages
          .slice(stages.indexOf(scenario.stage) + 1)
          .some((stage) => s.nodeId.startsWith(`${stage}:`)),
      ),
    );
    if (scenario.fail === "implement:agent")
      assert.match(
        await readFile(f.implementation, "utf8"),
        /partial implement edit/,
      );
    if (scenario.fail === "finalize:mismatch") {
      assert.equal(report.finalization?.phases.sync, "completed");
      assert.equal(report.finalization?.assessment?.verdict, "mismatch");
    }
    if (scenario.stage === "finalize")
      assert.match(
        await readFile(f.mainPath, "utf8"),
        /KEEP DIRTY HUMAN SCENARIO/,
      );
    assert.ok(await lstat(f.changeRoot));
    await assert.rejects(lstat(f.destination));
    await f.unchanged();
  });

test("archive failure after verification and sync acceptance retains progress; restart begins at groom, archived target rejects", {
  timeout: 120000,
}, async (t) => {
  const f = await fixture(
    t,
    {},
    {
      move: async () => {
        throw new Error("Archive blocked");
      },
    },
  );
  await assert.rejects(
    f.runner.run(f.flow, { changeId: f.id }),
    /pipeline unsuccessful/,
  );
  assert.equal(f.emitted[0].failedStage, "finalize");
  assert.equal(f.emitted[0].finalization?.phases.assessment, "completed");
  assert.equal(f.emitted[0].archive?.state, "failed");
  const retry = createAllFlow({ ...f.deps, move: undefined });
  const result = await f.runner.run(retry, { changeId: f.id });
  assert.equal(
    result.state.steps.find((s) => s.nodeType === "acp")?.nodeId,
    "groom:review",
  );
  assert.equal(f.emitted[1].outcome, "success");
  await assert.rejects(
    f.runner.run(createAllFlow({ ...f.deps }), { changeId: f.id }),
    /pipeline unsuccessful/,
  );
  assert.equal(f.emitted[2].activeStage, null);
  assert.ok(
    f.emitted[2].stages.every(
      (s) => s.status === "not_started" && s.result === null,
    ),
  );
  await f.unchanged();
});

test("post-assessment delta drift invalidates finalization without another assessment", {
  timeout: 60000,
}, async (t) => {
  const f = await fixture(t);
  const node = f.flow.nodes["finalize:acceptance"];
  assert.ok("run" in node && node.run);
  const callback = node.run;
  node.run = async (c) => {
    const result = await callback(c);
    await writeFile(
      f.deltaPath,
      `${await readFile(f.deltaPath, "utf8")}\nCONCURRENT DELTA DRIFT\n`,
    );
    return result;
  };
  await assert.rejects(
    f.runner.run(f.flow, { changeId: f.id }),
    /pipeline unsuccessful/,
  );
  assert.equal(f.emitted[0].stages[2].status, "success");
  assert.equal(f.emitted[0].outcome, "failed");
  assert.equal(f.emitted[0].finalization?.assessment?.verdict, "accepted");
  assert.match(f.emitted[0].summary, /inputs changed/);
  assert.notEqual(f.emitted[0].archive?.state, "archived");
  const [state] = await f.states();
  assert.equal(
    state.steps.filter((s) => s.nodeId === "finalize:assess").length,
    1,
  );
  assert.ok(await lstat(f.changeRoot));
  await f.unchanged();
});

test("completed archive move with failed confirmation retains moved_unconfirmed, not success", {
  timeout: 60000,
}, async (t) => {
  const f = await fixture(
    t,
    { noDelta: true },
    {
      move: async (source, destination) => {
        await rename(source, destination);
        throw new Error("Move completed; confirmation unavailable");
      },
    },
  );
  await assert.rejects(
    f.runner.run(f.flow, { changeId: f.id }),
    /pipeline unsuccessful/,
  );
  assert.equal(f.emitted[0].outcome, "failed");
  assert.equal(f.emitted[0].archive?.state, "moved_unconfirmed");
  assert.equal(f.emitted[0].archive?.destination, f.destination);
  await assert.rejects(lstat(f.changeRoot));
  assert.ok(await lstat(f.destination));
  await f.unchanged();
});

for (const stage of ["groom", "implement", "verify"] as const)
  test(`transparent ${stage} steering uses real collector; complete answers authorize only originating stage`, {
    timeout: 90000,
  }, async (t) => {
    const input = new PassThrough() as PassThrough & { isTTY: boolean };
    const output = new PassThrough() as PassThrough & { isTTY: boolean };
    input.isTTY = output.isTTY = true;
    let text = "";
    output.on("data", (chunk) => {
      text += chunk.toString();
      if (chunk.toString().includes("Your steering:"))
        input.write("Permit only the current requested scope\n");
    });
    const f = await fixture(
      t,
      { escalation: stage, [`${stage}Repairs`]: 1 },
      {
        steering: (issues, signal) =>
          collectSteering(issues, signal, { input, output }),
      },
    );
    const run = await f.runner.run(f.flow, { changeId: f.id });
    assert.equal(f.emitted[0].outcome, "success");
    assert.match(text, /Recommendation:/);
    if (stage !== "groom") assert.match(text, /Requested authorization scope:/);
    assert.ok(
      f.messages.includes(
        `[openspec-all:${stage}] paused for scoped human steering`,
      ),
    );
    const repaired = run.state.steps.find(
      (s) => s.nodeId === `${stage}:${stage === "groom" ? "update" : "repair"}`,
    );
    assert.match(
      repaired?.promptText ?? "",
      /Permit only the current requested scope/,
    );
    assert.equal(f.flow.nodes[`${stage}:steering`].timeoutMs, 604801000);
    input.destroy();
    output.destroy();
  });

for (const stage of ["groom", "implement", "verify"] as const)
  test(`non-TTY ${stage} escalation preserves needs_human and does not dispatch a repair or later stage`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(
      t,
      { escalation: stage, [`${stage}Repairs`]: 1 },
      {
        steering: (issues, signal) =>
          collectSteering(issues, signal, {
            input: new PassThrough(),
            output: new PassThrough(),
          }),
      },
    );
    await assert.rejects(
      f.runner.run(f.flow, { changeId: f.id }),
      /pipeline unsuccessful/,
    );
    const result = f.emitted[0];
    assert.equal(result.outcome, "needs_human");
    assert.equal(result.failedStage, stage);
    assert.ok(
      result.stages
        .slice(stages.indexOf(stage) + 1)
        .every((s) => s.status === "not_started"),
    );
    const [state] = await f.states();
    assert.equal(
      state.steps.filter(
        (s) =>
          s.nodeId === `${stage}:${stage === "groom" ? "update" : "repair"}`,
      ).length,
      0,
    );
  });

for (const stage of ["groom", "implement", "verify"] as const)
  test(`${stage} incomplete steering cannot authorize edits`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(
      t,
      { escalation: stage, [`${stage}Repairs`]: 1 },
      { steering: async () => ({}) },
    );
    await assert.rejects(
      f.runner.run(f.flow, { changeId: f.id }),
      /pipeline unsuccessful/,
    );
    assert.equal(f.emitted[0].outcome, "failed");
    const [state] = await f.states();
    assert.ok(
      !state.steps.some(
        (s) =>
          s.nodeId === `${stage}:${stage === "groom" ? "update" : "repair"}`,
      ),
    );
  });

test("interactive EOF cannot return partial steering or authorize implementation repair", {
  timeout: 60000,
}, async (t) => {
  const input = new PassThrough() as PassThrough & { isTTY: boolean };
  const output = new PassThrough() as PassThrough & { isTTY: boolean };
  input.isTTY = output.isTTY = true;
  output.on("data", (chunk) => {
    if (chunk.toString().includes("Your steering:")) input.end();
  });
  const f = await fixture(
    t,
    { escalation: "implement", implementRepairs: 1 },
    {
      steering: (issues, signal) =>
        collectSteering(issues, signal, { input, output }),
    },
  );
  await assert.rejects(
    f.runner.run(f.flow, { changeId: f.id }),
    /pipeline unsuccessful/,
  );
  assert.equal(f.emitted[0].outcome, "needs_human");
  assert.match(f.emitted[0].stages[1].result?.summary ?? "", /EOF/);
  const [state] = await f.states();
  assert.ok(!state.steps.some((s) => s.nodeId === "implement:repair"));
  assert.ok(
    f.emitted[0].stages.slice(2).every((s) => s.status === "not_started"),
  );
  input.destroy();
  output.destroy();
});

for (const outcome of ["cancelled", "failed"] as const)
  test(`steering ${outcome} propagates without transition confirmations`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(
      t,
      { escalation: "implement", implementRepairs: 1 },
      {
        steering: async () => {
          throw new SteeringError(outcome, `Steering ${outcome}`);
        },
      },
    );
    await assert.rejects(
      f.runner.run(f.flow, { changeId: f.id }),
      /pipeline unsuccessful/,
    );
    assert.equal(f.emitted[0].outcome, outcome);
    assert.equal(f.emitted[0].stages[2].status, "not_started");
  });

test("standalone/composed repeated-repair parity preserves fresh budgets and prompts", {
  timeout: 180000,
}, async (t) => {
  const options = {
    groomRepairs: 2,
    implementRepairs: 2,
    verifyRepairs: 2,
    noDelta: true,
  };
  const composed = await fixture(t, options);
  const full = await composed.runner.run(composed.flow, {
    changeId: composed.id,
  });
  const alone = await fixture(t, options);
  const results: (GroomResult | ImplementResult | VerifyResult)[] = [];
  const standalone = [
    createGroomFlow({ ...alone.deps, emit: (r) => results.push(r) }),
    createImplementFlow({ ...alone.deps, emit: (r) => results.push(r) }),
    createVerifyFlow({ ...alone.deps, emit: (r) => results.push(r) }),
  ];
  for (const [i, graph] of standalone.entries()) {
    const run = await alone.runner.run(graph, { changeId: alone.id });
    assert.deepEqual(composed.emitted[0].stages[i].result, results[i]);
    const expected = run.state.steps.filter((s) => s.nodeType === "acp");
    const actual = full.state.steps.filter(
      (s) => s.nodeType === "acp" && s.nodeId.startsWith(`${stages[i]}:`),
    );
    assert.deepEqual(
      actual.map((s) => s.nodeId.split(":")[1]),
      expected.map((s) => s.nodeId),
    );
    for (const [j, step] of actual.entries()) {
      const normalize = (text: string) =>
        text
          .replaceAll(composed.cwd, "WORKSPACE")
          .replaceAll(alone.cwd, "WORKSPACE");
      assert.equal(
        normalize(step.promptText ?? ""),
        normalize(expected[j].promptText ?? ""),
      );
    }
  }
  assert.equal(
    (composed.emitted[0].stages[0].result as GroomResult).updateAttempts,
    2,
  );
  assert.equal(
    (composed.emitted[0].stages[1].result as ImplementResult).repairAttempts,
    2,
  );
  assert.equal(
    (composed.emitted[0].stages[2].result as VerifyResult).repairAttempts,
    2,
  );
});

for (const stage of ["groom", "implement", "verify"] as const)
  test(`native ${stage} budget exhaustion remains limit_reached with later stages unstarted`, {
    timeout: 180000,
  }, async (t) => {
    const f = await fixture(t, { [`${stage}Repairs`]: 11, noDelta: true });
    await assert.rejects(
      f.runner.run(f.flow, { changeId: f.id }),
      /pipeline unsuccessful/,
    );
    assert.equal(f.emitted[0].outcome, "limit_reached");
    assert.equal(f.emitted[0].failedStage, stage);
    const child = f.emitted[0].stages[stages.indexOf(stage)].result;
    assert.equal(
      stage === "groom"
        ? (child as GroomResult).updateAttempts
        : (child as ImplementResult).repairAttempts,
      10,
    );
    assert.ok(
      f.emitted[0].stages
        .slice(stages.indexOf(stage) + 1)
        .every((s) => s.status === "not_started"),
    );
  });

test("implementation's ten repairs cannot consume verification's ten-repair budget", {
  timeout: 240000,
}, async (t) => {
  const f = await fixture(t, {
    implementRepairs: 10,
    verifyRepairs: 10,
    noDelta: true,
  });
  await f.runner.run(f.flow, { changeId: f.id });
  assert.equal(f.emitted[0].outcome, "success");
  for (const stage of ["implement", "verify"] as Stage[])
    assert.equal(
      (f.emitted[0].stages[stages.indexOf(stage)].result as ImplementResult)
        .repairAttempts,
      10,
    );
});
