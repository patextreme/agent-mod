import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { getEventListeners } from "node:events";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import type { FlowRunState } from "acpx/flows";
import { createAllFlow } from "./flow.js";
import { type Stage, stages } from "./helpers.js";
import { fixture } from "./test-fixture.js";

function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
  assert.ok(signal);
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
    setImmediate(() => process.emit("SIGINT"));
  });
}
for (const nodeId of [
  "groom:review",
  "implement:apply",
  "verify:verify",
  "finalize:sync",
  "finalize:assess",
] as const)
  test(`real native ACP interruption ${nodeId} bypasses routing but emits one observed aggregate`, {
    timeout: 60000,
  }, async (t) => {
    let ready!: () => void;
    const signalReady = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const server = createServer((socket) => {
      socket.on("data", () => ready());
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    t.after(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const f = await fixture(t);
    await writeFile(
      join(f.cwd, ".all-fixture.json"),
      JSON.stringify({
        ...f.config,
        interrupt: nodeId,
        readyPort: address.port,
      }),
    );
    const interrupted = signalReady.then(() => process.emit("SIGINT"));
    await assert.rejects(
      f.runner.run(f.flow, { changeId: f.id }),
      /interrupt|cancel|attempt cleanup failed/i,
    );
    await interrupted;
    assert.equal(f.emitted.length, 1);
    const result = f.emitted[0];
    const stage = nodeId.split(":")[0] as Stage;
    assert.equal(result.outcome, "cancelled");
    assert.equal(result.failedStage, stage);
    assert.deepEqual(
      result.stages.map((s) => s.status),
      stages.map((s, i) =>
        i < stages.indexOf(stage)
          ? "success"
          : s === stage
            ? "cancelled"
            : "not_started",
      ),
    );
    if (stage === "groom")
      assert.equal(
        result.stages[0].result,
        null,
        "groom has no child cancellation emitter: never fabricate its result",
      );
    assert.ok(
      result.stages
        .slice(stages.indexOf(stage) + 1)
        .every((s) => s.result === null),
    );
    assert.notEqual(result.archive?.state, "archived");
    const [state] = await f.states();
    assert.ok(
      ["cancelled", "failed"].includes(state.status),
      "installed runtime may record interruption cleanup as failed",
    );
    assert.ok(
      !state.steps.some((s) =>
        stages
          .slice(stages.indexOf(stage) + 1)
          .some((later) => s.nodeId.startsWith(`${later}:`)),
      ),
    );
    assert.ok(await lstat(f.changeRoot));
    assert.match(
      await readFile(f.implementation, "utf8"),
      /KEEP DIRTY IMPLEMENTATION EDIT/,
    );
    if (stage === "finalize") {
      assert.match(
        await readFile(f.mainPath, "utf8"),
        /KEEP DIRTY HUMAN SCENARIO/,
      );
      assert.equal(
        result.finalization?.phases.sync,
        nodeId === "finalize:assess" ? "completed" : "failed",
      );
    }
    await f.unchanged();
  });

for (const phase of ["command", "steering", "archive"] as const)
  test(`supported active ${phase} abort keeps observed child progress and blocks dispatch`, {
    timeout: 60000,
  }, async (t) => {
    let activeSignal: AbortSignal | undefined;
    const f = await fixture(
      t,
      phase === "steering"
        ? { implementRepairs: 1, escalation: "implement" }
        : {},
    );
    const flow = createAllFlow({
      ...f.deps,
      command:
        phase === "command"
          ? async (args, cwd, signal) => {
              if (args[0] === "validate") {
                activeSignal = signal;
                return waitForAbort(signal);
              }
              return f.command(args, cwd, signal);
            }
          : f.command,
      steering:
        phase === "steering"
          ? async (_, signal) => {
              activeSignal = signal;
              return waitForAbort(signal);
            }
          : undefined,
      move:
        phase === "archive"
          ? async (_, __, signal) => {
              activeSignal = signal;
              return waitForAbort(signal);
            }
          : undefined,
    });
    await assert.rejects(
      f.runner.run(flow, { changeId: f.id }),
      /interrupt|cancel|attempt cleanup failed/i,
    );
    assert.equal(f.emitted.length, 1);
    assert.equal(f.emitted[0].outcome, "cancelled");
    assert.equal(
      f.emitted[0].activeStage,
      phase === "command"
        ? "groom"
        : phase === "steering"
          ? "implement"
          : "finalize",
    );
    assert.notEqual(f.emitted[0].archive?.state, "archived");
    assert.ok(await lstat(f.changeRoot));
    if (phase === "command") {
      assert.equal(f.emitted[0].stages[0].result, null);
      assert.equal(f.emitted[0].stages[1].status, "not_started");
      assert.ok(activeSignal);
      assert.equal(
        getEventListeners(activeSignal, "abort").length,
        0,
        "parent attempt listener cleaned even when routing bypassed",
      );
    }
    if (phase === "archive") {
      assert.equal(f.emitted[0].finalization?.phases.assessment, "completed");
      assert.equal(f.emitted[0].archive?.state, "moving");
    }
    await f.unchanged();
  });

// Installed-version diagnostic probes only: these are deliberately uncovered
// intervals, not production runtime hooks or an invented public parent signal.
for (const interval of [
  "node-start",
  "callback-gap",
  "routing-before-install",
] as const)
  test(`uncovered ${interval} allows absent aggregate and retains persisted acpx diagnostics`, {
    timeout: 30000,
  }, async (t) => {
    const f = await fixture(t, { noDelta: true });
    const runs = join(f.base, "probe-runs");
    await mkdir(runs);
    const module = join(f.base, "uncovered.mjs");
    const acpx = new URL(
      "../../node_modules/acpx/dist/flows.js",
      import.meta.url,
    ).pathname;
    const flow = new URL("./flow.ts", import.meta.url).pathname;
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
    const replacement =
      interval === "routing-before-install"
        ? `function(...args){ const result=original.apply(this,args); if(${match}) process.emit("SIGINT"); return result; }`
        : `async function(...args){ await original.apply(this,args); if(${match}) { process.emit("SIGINT"); throw Object.assign(new Error("Interrupted in uncovered interval"),{name:"InterruptedError"}); } }`;
    await writeFile(
      module,
      `import {FlowRunner} from ${JSON.stringify(acpx)}; import {createAllFlow} from ${JSON.stringify(flow)}; const original=FlowRunner.prototype[${JSON.stringify(method)}]; if(typeof original!=="function") throw Error("Installed acpx probe unavailable"); FlowRunner.prototype[${JSON.stringify(method)}]=${replacement}; const command=async(args)=>({exitCode:0,stderr:"",stdout:JSON.stringify(args[0]==="list"?${JSON.stringify(f.listing)}:${JSON.stringify(f.status)})}); const runner=new FlowRunner({resolveAgent:()=>({agentName:"unused",agentCommand:"false",cwd:${JSON.stringify(f.cwd)}}),permissionMode:"approve-reads",outputRoot:${JSON.stringify(runs)}}); try { await runner.run(createAllFlow({cwd:${JSON.stringify(f.cwd)},command}),{changeId:${JSON.stringify(f.id)}}); } catch(error){ process.stderr.write(String(error)+"\\n");process.exitCode=1; }\n`,
    );
    const child = spawn(
      process.execPath,
      [
        "--import",
        new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url)
          .pathname,
        module,
      ],
      { cwd: f.cwd, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }).finally(() => clearTimeout(timer));
    assert.notEqual(code, 0, stderr);
    assert.match(stderr, /interrupt|cancel|attempt cleanup failed/i);
    assert.ok(
      !stdout.includes('{"changeId":'),
      "do not fabricate absent flow-owned output",
    );
    const [id] = await readdir(runs);
    assert.ok(await lstat(join(runs, id, "trace.ndjson")));
    const state = JSON.parse(
      await readFile(join(runs, id, "projections/run.json"), "utf8"),
    ) as FlowRunState;
    assert.ok(
      ["cancelled", "failed"].includes(state.status),
      "installed runtime may record interruption cleanup as failed",
    );
    assert.ok(!state.steps.some((s) => s.nodeId.includes(":")));
    assert.ok(await lstat(f.changeRoot));
    await f.unchanged();
  });
