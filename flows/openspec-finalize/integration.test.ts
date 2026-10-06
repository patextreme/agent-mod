import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { type TestContext, test } from "node:test";
import { fileURLToPath } from "node:url";
import { FlowRunner, type FlowRunState } from "acpx/flows";
import { createFinalizeFlow, type FinalizeResult } from "./flow.js";
import { fixture, merged, original } from "./test-fixture.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fakeAgent = join(repo, "flows/openspec-finalize/fixtures/fake-agent.mjs");
async function runnerFixture(
  t: TestContext,
  options: Parameters<typeof fixture>[1] = {},
) {
  const f = await fixture(t, options);
  const runner = new FlowRunner({
    resolveAgent: (profile) => {
      assert.ok(profile === undefined || profile === "pi");
      return {
        agentName: "pi",
        agentCommand: `${process.execPath} ${fakeAgent}`,
        agentArgv: [process.execPath, fakeAgent],
        cwd: f.cwd,
      };
    },
    permissionMode: "approve-reads",
    defaultNodeTimeoutMs: 10000,
    outputRoot: join(f.base, "runs"),
    suppressSdkConsoleErrors: true,
  });
  const emitted: FinalizeResult[] = [];
  const flow = createFinalizeFlow({
    cwd: f.cwd,
    command: f.command,
    emit: (r) => emitted.push(r),
    now: () => new Date("2026-10-05Z"),
  });
  const destination = join(f.changesDir, "archive", `2026-10-05-${f.id}`);
  return { ...f, runner, emitted, flow, destination };
}
async function persisted(f: Awaited<ReturnType<typeof runnerFixture>>) {
  const [run] = await readdir(join(f.base, "runs"));
  return JSON.parse(
    await readFile(join(f.base, "runs", run, "projections/run.json"), "utf8"),
  ) as FlowRunState;
}
for (const noDelta of [false, true])
  test(`real native runner ${noDelta ? "no-delta skips both ACP nodes" : "multi-capability sync then fresh independent assessment"} archives`, {
    timeout: 20000,
  }, async (t) => {
    const f = await runnerFixture(t, { noDelta });
    const result = await f.runner.run(f.flow, { changeId: f.id });
    assert.equal(result.state.status, "completed");
    assert.equal(f.emitted.length, 1);
    const report = f.emitted[0];
    assert.equal(report.outcome, "success");
    assert.equal(report.archive.state, "archived");
    assert.equal(report.archive.destination, f.destination);
    assert.deepEqual(report.phases, {
      preflight: "completed",
      prepare: "completed",
      sync: noDelta ? "not_applicable" : "completed",
      assessment: noDelta ? "not_applicable" : "completed",
      archive: "completed",
    });
    assert.equal(
      f.calls.filter((args) => args[0] === "instructions").length,
      noDelta ? 0 : 1,
    );
    assert.deepEqual(
      result.state.steps
        .filter((s) => s.nodeType === "acp")
        .map((s) => s.nodeId),
      noDelta ? [] : ["sync", "assess"],
    );
    const agentSteps = result.state.steps.filter((s) => s.nodeType === "acp");
    assert.equal(
      new Set(agentSteps.map((s) => s.session?.acpSessionId)).size,
      agentSteps.length,
    );
    for (const step of agentSteps) {
      assert.ok(step.session);
      const ref = step.trace?.promptArtifact;
      assert.ok(ref);
      assert.equal(
        await readFile(join(result.runDir, ref.path), "utf8"),
        step.promptText,
      );
    }
    if (!noDelta) {
      assert.equal(await readFile(f.mainPath, "utf8"), merged);
      assert.equal(await readFile(f.freshMain, "utf8"), f.freshMerged);
      const assess = agentSteps[1].promptText ?? "";
      assert.ok(!assess.includes(f.sync.summary));
      assert.ok(assess.includes("KEEP DIRTY HUMAN SCENARIO"));
    }
    assert.match(
      await readFile(join(f.destination, ".openspec.yaml"), "utf8"),
      /retire_capabilities: true/,
    );
    await assert.rejects(lstat(f.changeRoot));
    await f.unchanged();
  });
for (const scenario of [
  { mode: "ambiguity", assess: 0, writes: false, phase: "sync" },
  { mode: "sync-failure", assess: 0, writes: false, phase: "sync" },
  { mode: "partial-sync-failure", assess: 0, writes: true, phase: "sync" },
  { mode: "malformed-sync", assess: 0, writes: true, phase: "sync" },
  { mode: "assessment-failure", assess: 1, writes: true, phase: "assessment" },
  {
    mode: "malformed-assessment",
    assess: 1,
    writes: true,
    phase: "assessment",
  },
  { mode: "mismatch", assess: 1, writes: true, phase: "assessment" },
  { mode: "inconclusive", assess: 1, writes: true, phase: "assessment" },
  { mode: "missing-coverage", assess: 1, writes: true, phase: "assessment" },
  { mode: "overclaimed", assess: 1, writes: true, phase: "assessment" },
])
  test(`real ACP ${scenario.mode} blocks archive without retries and preserves partial state`, {
    timeout: 20000,
  }, async (t) => {
    const f = await runnerFixture(t, { mode: scenario.mode });
    await assert.rejects(
      f.runner.run(f.flow, { changeId: f.id }),
      /Finalization unsuccessful/,
    );
    assert.equal(f.emitted.length, 1);
    const report = f.emitted[0];
    assert.equal(report.outcome, "failed");
    assert.equal(report.failedPhase, scenario.phase);
    assert.equal(report.phases.archive, "not_started");
    assert.equal(report.archive.state, "not_started");
    const state = await persisted(f);
    assert.equal(state.steps.filter((s) => s.nodeId === "sync").length, 1);
    assert.equal(
      state.steps.filter((s) => s.nodeId === "assess").length,
      scenario.assess,
    );
    assert.equal(state.steps.filter((s) => s.nodeId === "archive").length, 0);
    assert.equal(
      await readFile(f.mainPath, "utf8"),
      scenario.writes ? merged : original,
    );
    assert.ok(await lstat(f.changeRoot));
    await assert.rejects(lstat(f.destination));
    await f.unchanged();
  });
test("accepted sync survives archive failure; explicit rerun converges and archived restart rejects", {
  timeout: 30000,
}, async (t) => {
  const f = await runnerFixture(t);
  const results: FinalizeResult[] = [];
  const fail = createFinalizeFlow({
    cwd: f.cwd,
    command: f.command,
    emit: (r) => results.push(r),
    now: () => new Date("2026-10-05Z"),
    move: async () => {
      throw new Error("move blocked");
    },
  });
  await assert.rejects(
    f.runner.run(fail, { changeId: f.id }),
    /Finalization unsuccessful/,
  );
  assert.equal(results[0].phases.sync, "completed");
  assert.equal(results[0].phases.assessment, "completed");
  assert.equal(results[0].archive.state, "failed");
  assert.equal(results[0].failedPhase, "archive");
  assert.equal(await readFile(f.mainPath, "utf8"), merged);
  assert.ok(await lstat(f.changeRoot));
  await f.runner.run(f.flow, { changeId: f.id });
  assert.equal(f.emitted[0].outcome, "success");
  assert.equal(await readFile(f.mainPath, "utf8"), merged);
  f.listing.changes = [];
  const restart: FinalizeResult[] = [];
  await assert.rejects(
    f.runner.run(
      createFinalizeFlow({
        cwd: f.cwd,
        command: f.command,
        emit: (r) => restart.push(r),
      }),
      { changeId: f.id },
    ),
    /Finalization unsuccessful/,
  );
  assert.equal(restart[0].failedPhase, "preflight");
  assert.equal(restart[0].phases.sync, "not_started");
  await f.unchanged();
});
test("completed move with failed confirmation is unconfirmed, never still-active or success", async (t) => {
  const f = await runnerFixture(t, { noDelta: true });
  const results: FinalizeResult[] = [];
  await assert.rejects(
    f.runner.run(
      createFinalizeFlow({
        cwd: f.cwd,
        command: f.command,
        emit: (r) => results.push(r),
        move: async (s, d) => {
          await rename(s, d);
          throw new Error("post-move failure");
        },
      }),
      { changeId: f.id },
    ),
    /Finalization unsuccessful/,
  );
  assert.equal(results[0].archive.state, "moved_unconfirmed");
  assert.equal(results[0].phases.archive, "failed");
  await assert.rejects(lstat(f.changeRoot));
  assert.ok(await lstat(results[0].archive.destination as string));
});
async function cliFixture(
  t: TestContext,
  options: Parameters<typeof fixture>[1] = {},
) {
  const f = await runnerFixture(t, options);
  const home = join(f.base, "home");
  const bin = join(f.base, "bin");
  await mkdir(join(home, ".acpx"), { recursive: true });
  await mkdir(bin);
  await writeFile(
    join(home, ".acpx/config.json"),
    JSON.stringify({ agents: { pi: { argv: [process.execPath, fakeAgent] } } }),
  );
  const executable = join(bin, "openspec");
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require("node:fs"); const config = JSON.parse(fs.readFileSync(${JSON.stringify(join(f.cwd, ".finalize-fixture.json"))}, "utf8")); const args = process.argv.slice(2); let value; if (JSON.stringify(args) === JSON.stringify(["list","--json"])) value = {...config.listing, changes: fs.existsSync(config.status.changeRoot) ? config.listing.changes : []}; else if (JSON.stringify(args) === JSON.stringify(["status","--change",config.changeId,"--json"])) value = config.status; else if (JSON.stringify(args) === JSON.stringify(["instructions","specs","--change",config.changeId,"--json"])) value = config.instructions; else throw Error("Forbidden command " + args); process.stdout.write(JSON.stringify(value));\n`,
  );
  await chmod(executable, 0o755);
  return { ...f, home, bin };
}
async function cli(
  f: Awaited<ReturnType<typeof cliFixture>>,
  module = join(repo, "flows/openspec-finalize/index.ts"),
  ready?: Promise<unknown>,
  runnerProbe = false,
) {
  const child = spawn(
    process.execPath,
    runnerProbe
      ? ["--import", join(repo, "node_modules/tsx/dist/loader.mjs"), module]
      : [
          join(repo, "node_modules/acpx/dist/cli.js"),
          "flow",
          "run",
          module,
          "--input-json",
          JSON.stringify({ changeId: f.id }),
        ],
    {
      cwd: f.cwd,
      env: {
        ...process.env,
        HOME: f.home,
        PATH: `${f.bin}:${process.env.PATH}`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (c: string) => {
    stdout += c;
  });
  child.stderr.setEncoding("utf8").on("data", (c: string) => {
    stderr += c;
  });
  const interrupted = ready?.then(() => {
    assert.ok(child.kill("SIGINT"));
  });
  void interrupted?.catch(() => child.kill("SIGKILL"));
  const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
  timer.unref();
  const code = await new Promise<number | null>((res, rej) => {
    child.once("error", rej);
    child.once("close", res);
  }).finally(() => clearTimeout(timer));
  await interrupted;
  const results: FinalizeResult[] = stdout
    .split("\n")
    .filter((line) => line.startsWith('{"changeId":'))
    .map((line) => JSON.parse(line));
  const [runId] = await readdir(join(f.home, ".acpx/flows/runs")).catch(
    (error) => {
      throw new Error(`Runtime did not persist run: ${stdout}\n${stderr}`, {
        cause: error,
      });
    },
  );
  const runDir = join(f.home, ".acpx/flows/runs", runId);
  const state: FlowRunState = JSON.parse(
    await readFile(join(runDir, "projections/run.json"), "utf8"),
  );
  return { code, stdout, stderr, results, state, runDir };
}
for (const mode of [
  undefined,
  "mismatch",
  "partial-sync-failure",
  "malformed-assessment",
] as const)
  test(`actual finalize entrypoint CLI ${mode ?? "success"} exit and terminal result`, {
    timeout: 35000,
  }, async (t) => {
    const f = await cliFixture(t, { mode });
    const result = await cli(f);
    assert.equal(result.results.length, 1, result.stdout + result.stderr);
    assert.equal(result.results[0].outcome, mode ? "failed" : "success");
    assert.equal(result.code === 0, !mode);
    assert.match(
      result.stderr,
      new RegExp(`${f.id}: ${mode ? "failed" : "success"} at`),
    );
    await f.unchanged();
  });
for (const phase of ["prepare", "sync", "assessment", "archive"] as const)
  test(`actual CLI SIGINT during ${phase}: at-most-once observed cancellation, no later archive`, {
    timeout: 35000,
  }, async (t) => {
    let resolveReady!: (data: unknown) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });
    void ready.catch(() => {});
    const server = createServer((socket) => {
      let data = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        data += chunk;
      });
      socket.on("end", () => {
        try {
          resolveReady(JSON.parse(data));
        } catch (e) {
          rejectReady(e as Error);
        }
      });
      socket.on("error", rejectReady);
    });
    await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
    t.after(() => new Promise<void>((res) => server.close(() => res())));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const f = await cliFixture(t, { mode: `${phase}-interrupt` });
    await writeFile(
      join(f.cwd, ".finalize-fixture.json"),
      JSON.stringify({ ...f.config, readyPort: address.port }),
    );
    let module = join(repo, "flows/openspec-finalize/index.ts");
    if (phase === "prepare" || phase === "archive") {
      module = join(f.base, "interrupt.flow.ts");
      const wait = `await new Promise((_,reject) => { signal.addEventListener("abort", () => reject(signal.reason), {once:true}); const socket = createConnection({host:"127.0.0.1",port:${address.port}}, () => socket.end(JSON.stringify({phase:${JSON.stringify(phase)}})+"\\n")); socket.on("error",reject); });`;
      await writeFile(
        module,
        `import {createConnection} from "node:net"; import {createFinalizeFlow} from ${JSON.stringify(join(repo, "flows/openspec-finalize/flow.ts"))}; import {command} from ${JSON.stringify(join(repo, "flows/shared/command.ts"))}; export default createFinalizeFlow({ ${phase === "prepare" ? `command: async (args,cwd,signal) => { if(args[0] === "instructions") { ${wait} } return command(args,cwd,signal); }` : `move: async (source,destination,signal) => { ${wait} }`} });\n`,
      );
    }
    const result = await cli(f, module, ready);
    assert.equal(result.results.length, 1, result.stdout + result.stderr);
    assert.equal(result.results[0].outcome, "cancelled");
    assert.equal(result.results[0].phase, phase);
    assert.notEqual(result.code, 0);
    assert.notEqual(result.results[0].archive.state, "archived");
    assert.ok(await lstat(f.changeRoot));
    await f.unchanged();
    if (phase !== "prepare")
      assert.equal(await readFile(f.mainPath, "utf8"), merged);
    assert.equal(
      result.state.steps.filter((s) => s.nodeId === "success").length,
      0,
    );
    assert.ok(
      await lstat(join(result.runDir, "trace.ndjson")),
      "persisted runtime diagnostics remain available",
    );
  });

// Installed-version regression probes, not production runtime hooks: acpx has
// no public parent-run signal. These exact uncovered intervals must not imply
// an exactly-once whole-invocation delivery guarantee.
for (const interval of [
  "node-start",
  "callback-gap",
  "routing-before-install",
] as const)
  test(`real runner child process uncovered ${interval} allows absent JSON and retains runtime diagnostics`, {
    timeout: 35000,
  }, async (t) => {
    const f = await cliFixture(t, { noDelta: true });
    const module = join(f.base, "uncovered.flow.mjs");
    const method =
      interval === "node-start"
        ? "writeNodeStartedSnapshot"
        : interval === "callback-gap"
          ? "recordFlowStepOutcome"
          : "resolveNextNode";
    const match =
      interval === "node-start"
        ? 'args[2] === "preflight"'
        : interval === "callback-gap"
          ? 'args[2].nodeId === "preflight"'
          : 'args[1].nodeId === "preflight"';
    // SIGINT is emitted only after entering the actual persisted runtime boundary;
    // it bypasses terminal routing without a flow listener in scope.
    const replacement =
      interval === "routing-before-install"
        ? `function (...args) { const result = original.apply(this,args); if (${match}) process.emit("SIGINT"); return result; }`
        : `async function (...args) { await original.apply(this,args); if (${match}) { process.emit("SIGINT"); throw Object.assign(new Error("Interrupted in uncovered runtime interval"), {name:"InterruptedError"}); } }`;
    await writeFile(
      module,
      `import {FlowRunner} from ${JSON.stringify(join(repo, "node_modules/acpx/dist/flows.js"))}; import {createFinalizeFlow} from ${JSON.stringify(join(repo, "flows/openspec-finalize/flow.ts"))}; const original = FlowRunner.prototype[${JSON.stringify(method)}]; if(typeof original !== "function") throw Error("Installed acpx probe no longer valid"); FlowRunner.prototype[${JSON.stringify(method)}] = ${replacement}; const runner = new FlowRunner({resolveAgent:()=>({agentName:"unused",agentCommand:"false",cwd:process.cwd()}),permissionMode:"approve-reads",outputRoot:${JSON.stringify(join(f.home, ".acpx/flows/runs"))}}); try { await runner.run(createFinalizeFlow(), {changeId:${JSON.stringify(f.id)}}); } catch(error) { process.stderr.write(String(error)+"\\n"); process.exitCode=1; }\n`,
    );
    const result = await cli(f, module, undefined, true);
    assert.notEqual(result.code, 0, result.stderr);
    assert.equal(
      result.results.length,
      0,
      "No callback listener is installed: do not fabricate terminal JSON",
    );
    assert.match(
      result.stderr,
      /interrupt|cancel|attempt cleanup failed/i,
      "actual cancellation, not load failure",
    );
    assert.ok(await lstat(join(result.runDir, "projections/run.json")));
    assert.ok(
      await lstat(join(result.runDir, "trace.ndjson")),
      "acpx persisted run history/transcripts are the diagnostic fallback",
    );
    assert.ok(await lstat(f.changeRoot));
    await f.unchanged();
  });
