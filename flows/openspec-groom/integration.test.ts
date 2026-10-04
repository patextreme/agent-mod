import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { type TestContext, test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { FlowRunner, type FlowRunResult, type FlowRunState } from "acpx/flows";
import type { Command, CommandResult } from "../shared/command.js";
import { collectSteering, SteeringError } from "../shared/steering.js";
import { createGroomFlow, type GroomResult } from "./flow.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fakeAgent = join(repo, "flows/shared/fixtures/fake-agent.mjs");
const flowFile = join(repo, "flows/openspec-groom/index.ts");
const cliFile = join(repo, "node_modules/acpx/dist/cli.js");
const changeId = "fixture-change";
const dirtySentinel = "Uncommitted human edit: KEEP THIS EXACTLY.\n";

interface Config {
  changeId: string;
  artifact: string;
  artifacts: string[];
  dirtySentinel: string;
  mode?:
    | "agent-failure"
    | "updater-failure"
    | "inconclusive"
    | "operational-failure"
    | "structural-invalid";
  updaterFailureAfter?: number;
  repairsNeeded?: number;
  escalation?: boolean;
  mixedResolutions?: boolean;
  assessmentFailure?: "missing-artifacts" | "inconclusive";
  assessmentFailureAfter?: number;
}

// CLI and injected-command fixtures use the same targeted wire shapes.
function openspecReply(
  args: string[],
  cwd: string,
  config: Config,
): CommandResult {
  const json = (value: unknown, exitCode = 0): CommandResult => ({
    stdout: JSON.stringify(value),
    stderr: "",
    exitCode,
  });
  if (JSON.stringify(args) === JSON.stringify(["list", "--json"])) {
    return json({ root: { path: cwd }, changes: [{ name: config.changeId }] });
  }
  if (
    JSON.stringify(args) ===
    JSON.stringify(["status", "--change", config.changeId, "--json"])
  ) {
    return json({
      changeRoot: `${cwd}/openspec/changes/${config.changeId}`,
      planningHome: { kind: "repo", root: cwd },
      actionContext: { mode: "repo-local" },
      artifactPaths: { planning: { existingOutputPaths: config.artifacts } },
    });
  }
  if (
    JSON.stringify(args) ===
    JSON.stringify([
      "validate",
      config.changeId,
      "--type",
      "change",
      "--strict",
      "--json",
      "--no-interactive",
    ])
  ) {
    const result = json(
      {
        items: [
          {
            id: config.changeId,
            type: "change",
            valid: config.mode !== "structural-invalid",
            issues:
              config.mode === "structural-invalid"
                ? [{ level: "ERROR", message: "Persistent structural error" }]
                : [],
          },
        ],
      },
      config.mode === "operational-failure"
        ? 2
        : config.mode === "structural-invalid"
          ? 1
          : 0,
    );
    if (config.mode === "operational-failure")
      result.stderr = "fixture operational validation failure";
    return result;
  }
  throw new Error(`Unexpected OpenSpec invocation: ${JSON.stringify(args)}`);
}

async function files(root: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else {
        assert.ok(entry.isFile(), `unexpected non-file: ${path}`);
        result.set(path.slice(root.length + 1), await readFile(path, "utf8"));
      }
    }
  }
  await visit(root);
  return result;
}

async function fixture(t: TestContext, options: Partial<Config> = {}) {
  const base = await mkdtemp(join(tmpdir(), "groom-integration-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const cwd = join(base, "workspace");
  const home = join(base, "home");
  const bin = join(base, "bin");
  const changeRoot = join(cwd, "openspec/changes", changeId);
  await Promise.all([
    mkdir(changeRoot, { recursive: true }),
    mkdir(join(home, ".acpx"), { recursive: true }),
    mkdir(bin),
  ]);
  const artifact = join(changeRoot, "design.md");
  const artifacts = [
    artifact,
    join(changeRoot, "proposal.md"),
    join(changeRoot, "tasks.md"),
  ];
  await Promise.all(
    artifacts.map((path) =>
      writeFile(path, `# ${path.split("/").at(-1)}\n\n${dirtySentinel}`),
    ),
  );
  // An implementation file and unrelated planning content must stay untouched.
  await writeFile(
    join(cwd, "implementation.ts"),
    "export const untouched = true;\n",
  );
  const config: Config = {
    changeId,
    artifact,
    artifacts,
    dirtySentinel,
    ...options,
  };
  await writeFile(join(cwd, ".groom-fixture.json"), JSON.stringify(config));
  await writeFile(
    join(home, ".acpx/config.json"),
    JSON.stringify({
      agents: { pi: { argv: [process.execPath, fakeAgent] } },
    }),
  );
  const executable = join(bin, "openspec");
  const invocations = [
    ["list", "--json"],
    ["status", "--change", changeId, "--json"],
    [
      "validate",
      changeId,
      "--type",
      "change",
      "--strict",
      "--json",
      "--no-interactive",
    ],
  ].map((args) => [JSON.stringify(args), openspecReply(args, cwd, config)]);
  await writeFile(
    executable,
    `#!${process.execPath}\nconst replies = new Map(${JSON.stringify(invocations)});\nconst args = JSON.stringify(process.argv.slice(2));\nconst result = replies.get(args);\nif (!result) throw new Error("Unexpected OpenSpec invocation: " + args);\nprocess.stdout.write(result.stdout);\nprocess.stderr.write(result.stderr);\nprocess.exitCode = result.exitCode;\n`,
  );
  await chmod(executable, 0o755);
  const initial = await files(cwd);
  const calls: string[][] = [];
  const command: Command = async (args, root, signal) => {
    assert.equal(root, cwd);
    assert.equal(signal?.aborted, false);
    calls.push(args);
    return openspecReply(args, root, config);
  };
  const runner = new FlowRunner({
    resolveAgent: (profile) => {
      assert.ok(profile === undefined || profile === "pi");
      return {
        agentName: "pi",
        agentCommand: `${process.execPath} ${fakeAgent}`,
        agentArgv: [process.execPath, fakeAgent],
        cwd,
      };
    },
    permissionMode: "approve-reads",
    outputRoot: join(base, "runs"),
    defaultNodeTimeoutMs: 10000,
    suppressSdkConsoleErrors: true,
  });
  async function assertEdits(updates: number) {
    const after = await files(cwd);
    assert.deepEqual(
      [...after.keys()].sort(),
      [...initial.keys()].sort(),
      "no new files, reports, or Git state",
    );
    for (const [path, content] of initial) {
      assert.equal(
        after.get(path),
        join(cwd, path) === artifact
          ? content +
              Array.from(
                { length: updates },
                (_, i) => `<!-- fixture-repair-${i + 1} -->\n`,
              ).join("")
          : content,
        `only designated existing artifact may change: ${path}`,
      );
    }
  }
  return {
    base,
    cwd,
    home,
    bin,
    config,
    initial,
    calls,
    command,
    runner,
    assertEdits,
  };
}

async function assertPersisted(result: FlowRunResult) {
  const { runDir, state } = result;
  const saved = JSON.parse(
    await readFile(join(runDir, "projections/run.json"), "utf8"),
  );
  assert.deepEqual(saved.steps, JSON.parse(JSON.stringify(state.steps)));
  const trace = await readFile(join(runDir, "trace.ndjson"), "utf8");
  assert.match(trace, /acp_prompt_prepared/);
  assert.match(trace, /acp_response_parsed/);
  const acpSteps = state.steps.filter(
    (step) => step.nodeType === "acp" && step.outcome === "ok",
  );
  assert.ok(acpSteps.length);
  const ids = new Set<string>();
  const bundles = new Set<string>();
  for (const step of acpSteps) {
    assert.ok(step.session);
    assert.ok(step.trace?.promptArtifact);
    assert.ok(step.trace.rawResponseArtifact);
    const sessionId = step.session.acpSessionId;
    assert.match(sessionId, /^[0-9a-f-]{36}$/);
    assert.ok(
      !ids.has(sessionId),
      `actual ACP session reused: ${step.attemptId}`,
    );
    ids.add(sessionId);
    bundles.add(step.session.bundleId);
    const raw = step.rawText;
    assert.ok(raw);
    const actualId = raw.startsWith("{")
      ? JSON.parse(raw).sessionId
      : raw.match(/ACP_SESSION_ID=([0-9a-f-]+)/)?.[1];
    assert.equal(
      actualId,
      sessionId,
      "binding must contain the ID actually minted by the ACP server",
    );
    for (const [ref, expected] of [
      [step.trace.promptArtifact, step.promptText],
      [step.trace.rawResponseArtifact, raw],
    ] as const) {
      const content = await readFile(join(runDir, ref.path));
      assert.equal(content.toString(), expected);
      assert.equal(content.byteLength, ref.bytes);
      assert.equal(
        createHash("sha256").update(content).digest("hex"),
        ref.sha256,
      );
    }
    const sessionDir = join(runDir, "sessions", step.session.bundleId);
    const record = JSON.parse(
      await readFile(join(sessionDir, "record.json"), "utf8"),
    );
    const events = (await readFile(join(sessionDir, "events.ndjson"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const newSession = events.find((event) => event.message?.result?.sessionId)
      ?.message.result.sessionId;
    assert.equal(
      newSession,
      sessionId,
      "persisted ACP session/new response proves identity",
    );
    const prompts = events.filter(
      (event) => event.message?.method === "session/prompt",
    );
    assert.equal(
      prompts.length,
      1,
      "isolated session must contain exactly one prompt",
    );
    assert.deepEqual(prompts[0].message.params.prompt, [
      { type: "text", text: step.promptText },
    ]);
    assert.ok(
      JSON.stringify(record).includes(JSON.stringify(raw)),
      "acpx transcript must retain the raw response",
    );
    assert.ok(
      JSON.stringify(record).includes(JSON.stringify(step.promptText)),
      "acpx transcript must retain the prompt",
    );
    assert.ok(step.trace.conversation);
  }
  assert.equal(bundles.size, acpSteps.length);
}

const visits = (state: FlowRunState, node: string) =>
  state.steps.filter((step) => step.nodeId === node);

test("real FlowRunner converges through escalation and two updates with fresh ACP sessions", {
  timeout: 30000,
}, async (t) => {
  const f = await fixture(t, { escalation: true, repairsNeeded: 2 });
  const emitted: GroomResult[] = [];
  const steeringIds: string[] = [];
  const flow = createGroomFlow({
    cwd: f.cwd,
    command: f.command,
    emit: (result) => emitted.push(result),
    steering: async (issues, signal) => {
      assert.equal(signal?.aborted, false);
      assert.equal(issues.length, 1);
      const cycle = steeringIds.length + 1;
      assert.equal(issues[0].id, `cycle-${cycle}`);
      assert.match(issues[0].issue, new RegExp(`FINDING-${cycle}:`));
      steeringIds.push(issues[0].id);
      return {
        [issues[0].id]: `STEERING-${cycle}: retain the existing design`,
      };
    },
  });
  for (const node of Object.values(flow.nodes))
    if (node.nodeType === "acp") assert.equal(node.session?.isolated, true);
  const result = await f.runner.run(flow, { changeId });
  assert.equal(result.state.status, "completed");
  assert.deepEqual(
    emitted.map((item) => [item.outcome, item.updateAttempts]),
    [["success", 2]],
  );
  assert.deepEqual(
    result.state.steps
      .filter((step) =>
        [
          "validate",
          "review",
          "classify",
          "assess",
          "steering",
          "update",
        ].includes(step.nodeId),
      )
      .map((step) => step.nodeId),
    [
      "validate",
      "review",
      "classify",
      "assess",
      "steering",
      "update",
      "validate",
      "review",
      "classify",
      "assess",
      "steering",
      "update",
      "validate",
      "review",
      "classify",
    ],
  );
  assert.deepEqual(
    visits(result.state, "classify").map(
      (step) => (step.output as { route: string }).route,
    ),
    ["critical", "critical", "clear"],
  );
  assert.match(String(result.state.outputs.review), /Major:.*Verdict: blocked/);
  assert.match(emitted[0].summary, /not implementation readiness/);
  assert.equal(emitted[0].remaining, result.state.outputs.review);
  assert.match(String(emitted[0].remaining), /Major:/);
  assert.doesNotMatch(String(emitted[0].remaining), /FINDING-/);
  assert.deepEqual(steeringIds, ["cycle-1", "cycle-2"]);
  const freshCycle = result.state.steps.slice(
    result.state.steps.findIndex((step) => step.attemptId === "review#2"),
  );
  for (const step of freshCycle)
    if (step.nodeType === "acp") {
      assert.ok(!step.promptText?.includes("FINDING-1:"), step.attemptId);
      assert.ok(!step.promptText?.includes("STEERING-1:"), step.attemptId);
    }
  for (const step of visits(result.state, "review"))
    assert.equal(step.promptText, `/skill:openspec-review ${changeId}`);
  assert.equal(f.calls.filter((args) => args[0] === "validate").length, 3);
  await assertPersisted(result);
  await f.assertEdits(2);
});

test("structural validation errors are repaired before the first semantic review", {
  timeout: 15000,
}, async (t) => {
  const f = await fixture(t);
  const emitted: GroomResult[] = [];
  const issues = [
    { level: "ERROR", message: "Existing artifact needs structural repair" },
  ];
  const command: Command = async (args, cwd, signal) => {
    const reply = await f.command(args, cwd, signal);
    if (
      args[0] === "validate" &&
      !(await readFile(f.config.artifact, "utf8")).includes("fixture-repair-1")
    ) {
      return {
        stdout: JSON.stringify({
          items: [{ id: changeId, type: "change", valid: false, issues }],
        }),
        stderr: "",
        exitCode: 1,
      };
    }
    return reply;
  };
  const result = await f.runner.run(
    createGroomFlow({
      cwd: f.cwd,
      command,
      emit: (item) => emitted.push(item),
    }),
    { changeId },
  );
  assert.equal(result.state.status, "completed");
  assert.deepEqual(
    emitted.map((item) => [item.outcome, item.updateAttempts]),
    [["success", 1]],
  );
  const assess = visits(result.state, "assess")[0];
  assert.ok(assess.promptText?.includes(JSON.stringify(issues)));
  assert.equal(
    result.state.steps.find((step) => step.nodeType === "acp")?.nodeId,
    "assess",
  );
  assert.equal(visits(result.state, "review").length, 1);
  assert.equal(visits(result.state, "steering").length, 0);
  await assertPersisted(result);
  await f.assertEdits(1);
});

test("steering cancellation fails the run and preserves earlier authorized edits", {
  timeout: 20000,
}, async (t) => {
  const f = await fixture(t, { escalation: true, repairsNeeded: 2 });
  const emitted: GroomResult[] = [];
  let count = 0;
  const flow = createGroomFlow({
    cwd: f.cwd,
    command: f.command,
    emit: (result) => emitted.push(result),
    steering: async (issues) => {
      if (++count === 2)
        throw new SteeringError("cancelled", "fixture cancellation");
      return { [issues[0].id]: "STEERING-1: keep intent" };
    },
  });
  await assert.rejects(
    f.runner.run(flow, { changeId }),
    /Grooming unsuccessful/,
  );
  assert.deepEqual(
    emitted.map((item) => [item.outcome, item.updateAttempts]),
    [["cancelled", 1]],
  );
  const [runId] = await readdir(join(f.base, "runs"));
  const runDir = join(f.base, "runs", runId);
  const state: FlowRunState = JSON.parse(
    await readFile(join(runDir, "projections/run.json"), "utf8"),
  );
  assert.equal(state.status, "failed");
  assert.equal(
    (state.outputs.steering as { route: string }).route,
    "cancelled",
  );
  assert.equal(visits(state, "update").length, 1);
  await assertPersisted({ runDir, state });
  await f.assertEdits(1);
});

function terminal(t: TestContext) {
  const input = Object.assign(new PassThrough(), { isTTY: true });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  let text = "";
  output.setEncoding("utf8").on("data", (chunk: string) => {
    text += chunk;
  });
  t.after(() => {
    input.destroy();
    output.destroy();
  });
  return {
    input,
    output,
    get text() {
      return text;
    },
  };
}

async function persistedRun(f: Awaited<ReturnType<typeof fixture>>) {
  const [runId] = await readdir(join(f.base, "runs"));
  const runDir = join(f.base, "runs", runId);
  const state: FlowRunState = JSON.parse(
    await readFile(join(runDir, "projections/run.json"), "utf8"),
  );
  return { runDir, state };
}

test("mixed repairs wait for every escalated answer, reprompting blanks before one coordinated update", {
  timeout: 15000,
}, async (t) => {
  const f = await fixture(t, { mixedResolutions: true });
  const io = terminal(t);
  const emitted: GroomResult[] = [];
  const answers = {
    "cycle-1-product": "STEERING-1: preserve product intent",
    "cycle-1-design": "STEERING-1: preserve design intent",
  };
  let collections = 0;
  const result = await f.runner.run(
    createGroomFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
      steering: async (issues, signal) => {
        collections++;
        assert.deepEqual(
          issues.map((issue) => issue.id),
          Object.keys(answers),
        );
        const collection = collectSteering(issues, signal, io);
        void collection.catch(() => {});
        assert.match(io.text, /\[cycle-1-product\]/);
        await f.assertEdits(0); // Even the autonomous repair must wait.
        io.input.write("  \t  \n");
        await nextTurn();
        assert.match(io.text, /Please enter a non-blank answer/);
        await f.assertEdits(0);
        io.input.write(`${answers["cycle-1-product"]}\n`);
        await nextTurn();
        assert.match(io.text, /\[cycle-1-design\]/);
        await f.assertEdits(0); // One answered issue is not enough.
        io.input.write("\n");
        await nextTurn();
        assert.equal(
          io.text.match(/Please enter a non-blank answer/g)?.length,
          2,
        );
        await f.assertEdits(0);
        io.input.write(`${answers["cycle-1-design"]}\n`);
        return collection;
      },
    }),
    { changeId },
  );
  assert.equal(collections, 1);
  assert.equal(result.state.status, "completed");
  assert.deepEqual(
    emitted.map((item) => [item.outcome, item.updateAttempts]),
    [["success", 1]],
  );
  assert.equal(visits(result.state, "update").length, 1);
  const update = visits(result.state, "update")[0];
  assert.ok(update.promptText);
  const authorization = JSON.parse(update.promptText.split("\n")[3]);
  assert.deepEqual(
    authorization.resolutions.map(
      (issue: { id: string; escalation: boolean }) => [
        issue.id,
        issue.escalation,
      ],
    ),
    [
      ["cycle-1-autonomous", false],
      ["cycle-1-product", true],
      ["cycle-1-design", true],
    ],
  );
  assert.deepEqual(authorization.steering, answers);
  assert.deepEqual(
    authorization.resolutions,
    (result.state.outputs.assess as { resolutions: unknown }).resolutions,
  );
  await assertPersisted(result);
  await f.assertEdits(1);
});

for (const incomplete of ["missing", "blank"] as const) {
  test(`mixed repairs reject ${incomplete} steering at authorization without any updater dispatch`, {
    timeout: 15000,
  }, async (t) => {
    const f = await fixture(t, { mixedResolutions: true });
    const emitted: GroomResult[] = [];
    const flow = createGroomFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
      // Deliberately bypass collection to exercise the independent authorization gate.
      steering: async (issues) => {
        assert.equal(issues.length, 2);
        return {
          [issues[0].id]: "Preserve product intent",
          ...(incomplete === "blank" ? { [issues[1].id]: "  \t  " } : {}),
        };
      },
    });
    await assert.rejects(
      f.runner.run(flow, { changeId }),
      /Grooming unsuccessful/,
    );
    assert.deepEqual(
      emitted.map((item) => [item.outcome, item.updateAttempts]),
      [["failed", 0]],
    );
    assert.match(
      emitted[0].summary,
      /authorize:.*Missing steering for cycle-1-design/,
    );
    const result = await persistedRun(f);
    assert.equal(result.state.status, "failed");
    assert.equal(visits(result.state, "authorize")[0].outcome, "failed");
    assert.equal(visits(result.state, "update").length, 0);
    await assertPersisted(result);
    await f.assertEdits(0);
  });
}

test("EOF after partial mixed steering preserves the earlier cycle and applies none of the current repairs", {
  timeout: 20000,
}, async (t) => {
  const f = await fixture(t, { mixedResolutions: true, repairsNeeded: 2 });
  const io = terminal(t);
  const emitted: GroomResult[] = [];
  let cycle = 0;
  const flow = createGroomFlow({
    cwd: f.cwd,
    command: f.command,
    emit: (item) => emitted.push(item),
    steering: async (issues, signal) => {
      if (++cycle === 1)
        return Object.fromEntries(
          issues.map((issue) => [issue.id, "STEERING-1: keep intent"]),
        );
      assert.deepEqual(
        issues.map((issue) => issue.id),
        ["cycle-2-product", "cycle-2-design"],
      );
      const collection = collectSteering(issues, signal, io);
      // Attach a handler before EOF can reject the pending collection.
      void collection.catch(() => {});
      io.input.write("STEERING-2: keep product intent\n");
      await nextTurn();
      assert.match(io.text, /\[cycle-2-design\]/);
      io.input.write(" \t \n");
      await nextTurn();
      assert.match(io.text, /Please enter a non-blank answer/);
      await f.assertEdits(1);
      io.input.end();
      return collection;
    },
  });
  await assert.rejects(
    f.runner.run(flow, { changeId }),
    /Grooming unsuccessful/,
  );
  assert.deepEqual(
    emitted.map((item) => [item.outcome, item.updateAttempts]),
    [["needs_human", 1]],
  );
  assert.match(emitted[0].summary, /EOF.*before all answers/);
  const result = await persistedRun(f);
  assert.equal(result.state.status, "failed");
  assert.equal(visits(result.state, "update").length, 1);
  assert.equal(visits(result.state, "authorize").length, 1);
  assert.equal(
    (result.state.outputs.steering as { route: string }).route,
    "needs_human",
  );
  await assertPersisted(result);
  await f.assertEdits(1);
});

async function runCli(
  f: Awaited<ReturnType<typeof fixture>>,
  modulePath = flowFile,
) {
  // Exact documented payload: only changeId; no test-only graph inputs.
  const child = spawn(
    process.execPath,
    [
      cliFile,
      "flow",
      "run",
      modulePath,
      "--input-json",
      JSON.stringify({ changeId }),
    ],
    {
      cwd: f.cwd,
      env: {
        ...process.env,
        HOME: f.home,
        PATH: `${f.bin}:${process.env.PATH ?? ""}`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end(); // Deliberately no TTY, even when the test runner has one.
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 45000);
  timer.unref();
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolveExit(code));
  }).finally(() => clearTimeout(timer));
  const emitted = stdout
    .split("\n")
    .filter((line) => line.startsWith('{"changeId":'))
    .map((line) => JSON.parse(line)) as GroomResult[];
  assert.equal(
    emitted.length,
    1,
    `CLI must emit one grooming result, not just fail loading: ${stdout}\n${stderr}`,
  );
  const runs = join(f.home, ".acpx/flows/runs");
  const [runId] = await readdir(runs);
  assert.ok(runId);
  const runDir = join(runs, runId);
  const state: FlowRunState = JSON.parse(
    await readFile(join(runDir, "projections/run.json"), "utf8"),
  );
  return { exitCode, stdout, stderr, emitted: emitted[0], runDir, state };
}

const scenarios: {
  name: string;
  config: Partial<Config>;
  outcome: GroomResult["outcome"];
  updates: number;
  summary?: RegExp;
}[] = [
  {
    name: "success with remaining Major/blocker",
    config: {},
    outcome: "success",
    updates: 1,
  },
  {
    name: "ten-attempt budget exhaustion",
    config: { repairsNeeded: 11 },
    outcome: "limit_reached",
    updates: 10,
  },
  {
    name: "structural errors exhaust ten updates with final validation",
    config: { mode: "structural-invalid" },
    outcome: "limit_reached",
    updates: 10,
  },
  {
    name: "partial updater failure preserves prior and current edits",
    config: {
      mode: "updater-failure",
      updaterFailureAfter: 1,
      repairsNeeded: 2,
    },
    outcome: "failed",
    updates: 2,
    summary: /update:.*fixture updater failure after write/,
  },
  {
    name: "missing TTY steering",
    config: { escalation: true },
    outcome: "needs_human",
    updates: 0,
    summary: /TTY/,
  },
  {
    name: "inconclusive review",
    config: { mode: "inconclusive" },
    outcome: "failed",
    updates: 0,
    summary: /inconclusive/,
  },
  ...(["missing-artifacts", "inconclusive"] as const).flatMap(
    (assessmentFailure) =>
      [0, 1].map((updates) => ({
        name: `${assessmentFailure} assessment after ${updates} authorized edits`,
        config: {
          assessmentFailure,
          assessmentFailureAfter: updates,
          repairsNeeded: updates + 1,
        },
        outcome: "failed" as const,
        updates,
        summary:
          assessmentFailure === "missing-artifacts"
            ? /^Required artifacts are missing; creation is unsupported: specs\/missing-capability\/spec\.md$/
            : /^Review or assessment is inconclusive\.$/,
      })),
  ),
  {
    name: "agent failure",
    config: { mode: "agent-failure" },
    outcome: "failed",
    updates: 0,
    summary: /review:.*fixture agent failure/,
  },
  {
    name: "operational validation failure",
    config: { mode: "operational-failure" },
    outcome: "failed",
    updates: 0,
    summary: /Operational validation failure \(2\)/,
  },
];
for (const scenario of scenarios) {
  test(`CLI: ${scenario.name}`, { timeout: 55000 }, async (t) => {
    const f = await fixture(t, scenario.config);
    const result = await runCli(f);
    assert.equal(result.emitted.outcome, scenario.outcome, result.stderr);
    assert.equal(result.emitted.updateAttempts, scenario.updates);
    assert.equal(
      result.exitCode === 0,
      scenario.outcome === "success",
      result.stderr,
    );
    assert.equal(
      result.state.status,
      scenario.outcome === "success" ? "completed" : "failed",
    );
    if (scenario.summary)
      assert.match(result.emitted.summary, scenario.summary);
    assert.equal(visits(result.state, "update").length, scenario.updates);
    if (scenario.outcome === "limit_reached") {
      const structural = scenario.config.mode === "structural-invalid";
      assert.equal(visits(result.state, "validate").length, 11);
      assert.equal(visits(result.state, "review").length, structural ? 0 : 11);
      assert.equal(visits(result.state, "assess").length, 10);
      if (structural) {
        assert.equal(visits(result.state, "classify").length, 0);
        assert.deepEqual(result.emitted.remaining, [
          { level: "ERROR", message: "Persistent structural error" },
        ]);
        assert.deepEqual(
          result.state.steps
            .filter((step) => ["validate", "update"].includes(step.nodeId))
            .map((step) => step.nodeId),
          [
            ...Array.from({ length: 10 }, () => ["validate", "update"]).flat(),
            "validate",
          ],
        );
      }
    }
    if (scenario.config.mode === "updater-failure") {
      const updates = visits(result.state, "update");
      assert.deepEqual(
        updates.map((step) => step.outcome),
        ["ok", "failed"],
      );
      assert.equal(visits(result.state, "validate").length, 2);
      assert.equal(visits(result.state, "review").length, 2);
      assert.equal(visits(result.state, "authorize").length, 2);
      const failed = updates[1];
      assert.ok(failed.session);
      const events = await readFile(
        join(
          result.runDir,
          "sessions",
          failed.session.bundleId,
          "events.ndjson",
        ),
        "utf8",
      );
      assert.match(events, /fixture updater failure after write/);
      assert.ok(
        result.stderr.includes(
          `${changeId}: failed, 2/10 updates — ${result.emitted.summary}`,
        ),
      );
    }
    if (scenario.config.assessmentFailure) {
      const missing = scenario.config.assessmentFailure === "missing-artifacts";
      const assessment = result.state.outputs.assess as {
        route: string;
        resolutions: { id: string; issue: string }[];
        missingArtifacts: string[];
      };
      assert.equal(assessment.route, missing ? "missing" : "inconclusive");
      assert.deepEqual(
        assessment.missingArtifacts,
        missing ? ["specs/missing-capability/spec.md"] : [],
      );
      assert.deepEqual(result.emitted.remaining, assessment);
      assert.equal(
        assessment.resolutions[0].id,
        `cycle-${scenario.updates + 1}`,
      );
      assert.match(
        assessment.resolutions[0].issue,
        new RegExp(`FINDING-${scenario.updates + 1}:`),
      );
      assert.equal(visits(result.state, "assess").length, scenario.updates + 1);
      assert.equal(visits(result.state, "review").length, scenario.updates + 1);
      assert.equal(visits(result.state, "authorize").length, scenario.updates);
      assert.equal(visits(result.state, "steering").length, 0);
      assert.ok(
        result.stderr.includes(
          `${changeId}: failed, ${scenario.updates}/10 updates — ${result.emitted.summary}`,
        ),
      );
      assert.notEqual(result.exitCode, 0);
    }
    if (scenario.config.mode === "agent-failure") {
      const failed = visits(result.state, "review")[0];
      assert.equal(failed.outcome, "failed");
      assert.equal(visits(result.state, "classify").length, 0);
      assert.ok(failed.trace?.promptArtifact);
      assert.equal(
        await readFile(
          join(result.runDir, failed.trace.promptArtifact.path),
          "utf8",
        ),
        `/skill:openspec-review ${changeId}`,
      );
      assert.ok(failed.trace.rawResponseArtifact);
      assert.equal(
        await readFile(
          join(result.runDir, failed.trace.rawResponseArtifact.path),
          "utf8",
        ),
        "",
      );
      assert.ok(failed.session);
      const events = await readFile(
        join(
          result.runDir,
          "sessions",
          failed.session.bundleId,
          "events.ndjson",
        ),
        "utf8",
      );
      assert.match(events, /fixture agent failure/);
    }
    if (scenario.config.mode === "operational-failure")
      assert.equal(visits(result.state, "review").length, 0);
    if (scenario.config.mode === "inconclusive")
      assert.equal(
        (result.state.outputs.classify as { route: string }).route,
        "inconclusive",
      );
    if (
      result.state.steps.some(
        (step) => step.nodeType === "acp" && step.outcome === "ok",
      )
    )
      await assertPersisted(result);
    await f.assertEdits(scenario.updates);
  });
}

test("CLI: cancelled steering emits cancelled and exits nonzero", {
  timeout: 15000,
}, async (t) => {
  const f = await fixture(t, { escalation: true });
  const modulePath = join(f.base, "cancelled.flow.ts");
  await writeFile(
    modulePath,
    `import { createGroomFlow } from ${JSON.stringify(join(repo, "flows/openspec-groom/flow.ts"))};\nimport { SteeringError } from ${JSON.stringify(join(repo, "flows/shared/steering.ts"))};\nexport default createGroomFlow({ steering: async () => { throw new SteeringError("cancelled", "fixture cancellation"); } });\n`,
  );
  const result = await runCli(f, modulePath);
  assert.equal(result.emitted.outcome, "cancelled");
  assert.equal(result.emitted.updateAttempts, 0);
  assert.notEqual(result.exitCode, 0);
  assert.equal(visits(result.state, "update").length, 0);
  await f.assertEdits(0);
});
