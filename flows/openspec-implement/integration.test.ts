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
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { type TestContext, test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { FlowRunner, type FlowRunResult, type FlowRunState } from "acpx/flows";
import type { Command, CommandResult } from "../shared/command.js";
import { collectSteering, SteeringError } from "../shared/steering.js";
import { createImplementFlow } from "./flow.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fakeAgent = join(repo, "flows/shared/fixtures/fake-agent.mjs");
const flowFile = join(repo, "flows/openspec-implement/index.ts");
const cliFile = join(repo, "node_modules/acpx/dist/cli.js");
const changeId = "fixture-change";
const dirtySentinel = "Uncommitted human edit: KEEP THIS EXACTLY.\n";
interface Result {
  changeId: string;
  outcome: "success" | "limit_reached" | "needs_human" | "cancelled" | "failed";
  repairAttempts: number;
  summary: string;
  remaining: unknown;
}
interface Config {
  changeId: string;
  artifact: string;
  contextFiles: Record<string, string[]>;
  dirtySentinel: string;
  repairsNeeded?: number;
  tasksDoneAt?: number;
  tasksInitiallyDone?: boolean;
  noGates?: boolean;
  escalation?: boolean;
  escalationAt?: number;
  mixedBlockers?: boolean;
  mode?:
    | "agent-failure"
    | "malformed-report"
    | "malformed-judge"
    | "judge-failure"
    | "snapshot-failure"
    | "malformed-snapshot"
    | "apply-interrupt"
    | "repair-interrupt"
    | "assessment-failure"
    | "malformed-assessment"
    | "empty-assessment";
  failureAt?: number;
  failureBeforeWrite?: boolean;
  readyPort?: number;
  initialUpdates?: number;
  forceEscalation?: boolean;
  reportFault?:
    | "duplicate-blockers"
    | "missing-gates"
    | "stale-gates"
    | "failed-gates";
  forceCompleted?: boolean;
}

// The injected command and the executable CLI fixture share these exact wire shapes.
// Completion is derived from actual existing-file edits, never precomputed replies.
function openspecReply(
  args: string[],
  cwd: string,
  config: Config,
  content: string,
): CommandResult {
  const json = (value: unknown, exitCode = 0, stderr = ""): CommandResult => ({
    stdout: JSON.stringify(value),
    stderr,
    exitCode,
  });
  const root = `${cwd}/openspec/changes/${config.changeId}`;
  if (JSON.stringify(args) === JSON.stringify(["list", "--json"]))
    return json({ root: { path: cwd }, changes: [{ name: config.changeId }] });
  if (
    JSON.stringify(args) ===
    JSON.stringify(["status", "--change", config.changeId, "--json"])
  )
    return json({
      changeRoot: root,
      planningHome: { kind: "repo", root: cwd },
      actionContext: { mode: "repo-local" },
    });
  if (
    JSON.stringify(args) ===
    JSON.stringify([
      "instructions",
      "apply",
      "--change",
      config.changeId,
      "--json",
    ])
  ) {
    const markers = [...content.matchAll(/^\/\/ fixture-implement-(\d+)$/gm)];
    const latest = markers.length ? Number(markers.at(-1)?.[1]) : -1;
    if (config.mode === "snapshot-failure" && latest >= (config.failureAt ?? 0))
      return json({}, 2, "fixture apply instructions failure");
    const done =
      config.tasksInitiallyDone ||
      latest >= (config.tasksDoneAt ?? config.repairsNeeded ?? 0);
    return json({
      changeName: config.changeId,
      changeDir: root,
      state: done ? "all_done" : "ready",
      contextFiles: config.contextFiles,
      tasks: [
        { id: "1.1", description: "Implement first substantive group", done },
        {
          id: "2.1",
          description: "Consolidate dependent second group",
          done:
            config.mode === "malformed-snapshot" &&
            latest >= (config.failureAt ?? 0)
              ? "yes"
              : done,
        },
      ],
      instruction: "Read every context file, complete tasks and run gates.",
      context: "Preserve existing edits; npm test is the applicable gate.",
      operationGuidance: [
        "Parent consolidates task checklist after delegates return.",
      ],
    });
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

async function fixture(
  t: TestContext,
  options: Partial<Config> = {},
  editTasks = false,
) {
  const base = await mkdtemp(join(tmpdir(), "implement-integration-"));
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
  const planning = ["proposal.md", "design.md", "tasks.md"].map((name) =>
    join(changeRoot, name),
  );
  await Promise.all(
    planning.map((path) =>
      writeFile(path, `# ${path.split("/").at(-1)}\n\n${dirtySentinel}`),
    ),
  );
  const implementation = join(cwd, "implementation.ts");
  await writeFile(
    implementation,
    `// ${dirtySentinel}export const original = true;\n`,
  );
  await writeFile(
    join(cwd, "unrelated.txt"),
    "Human-owned unrelated content.\n",
  );
  const artifact = editTasks ? planning[2] : implementation;
  const config: Config = {
    changeId,
    artifact,
    contextFiles: {
      proposal: [planning[0]],
      design: [planning[1]],
      tasks: [planning[2]],
    },
    dirtySentinel,
    ...options,
  };
  await writeFile(join(cwd, ".implement-fixture.json"), JSON.stringify(config));
  await writeFile(
    join(home, ".acpx/config.json"),
    JSON.stringify({ agents: { pi: { argv: [process.execPath, fakeAgent] } } }),
  );
  const executable = join(bin, "openspec");
  const invocations = [
    ["list", "--json"],
    ["status", "--change", changeId, "--json"],
    ["instructions", "apply", "--change", changeId, "--json"],
  ];
  // Materialize the shared wire shapes for each bounded edit count. The executable
  // selects by markers read at invocation time, not by a mutable counter/state file.
  const replies = invocations.flatMap((args) =>
    Array.from({ length: 12 }, (_, count) => {
      const content = Array.from(
        { length: count },
        (_, i) => `// fixture-implement-${i}\n`,
      ).join("");
      return [
        JSON.stringify([args, count - 1]),
        openspecReply(args, cwd, config, content),
      ];
    }),
  );
  await writeFile(
    executable,
    `#!${process.execPath}\nconst { readFileSync } = require("node:fs");\nconst replies = new Map(${JSON.stringify(replies)});\nconst content = readFileSync(${JSON.stringify(artifact)}, "utf8");\nconst markers = [...content.matchAll(/^\\/\\/ fixture-implement-(\\d+)$/gm)];\nconst latest = markers.length ? Number(markers.at(-1)[1]) : -1;\nconst args = process.argv.slice(2);\nconst result = replies.get(JSON.stringify([args, latest]));\nif (!result) throw new Error("Unexpected OpenSpec invocation: " + JSON.stringify(args));\nprocess.stdout.write(result.stdout);\nprocess.stderr.write(result.stderr);\nprocess.exitCode = result.exitCode;\n`,
  );
  await chmod(executable, 0o755);
  const initial = await files(cwd);
  const calls: string[][] = [];
  const command: Command = async (args, root, signal) => {
    assert.equal(root, cwd);
    assert.equal(signal?.aborted, false);
    calls.push(args);
    return openspecReply(args, root, config, await readFile(artifact, "utf8"));
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
  async function assertEdits(count: number, restartedEdits = 0) {
    const after = await files(cwd);
    assert.deepEqual(
      [...after.keys()].sort(),
      [...initial.keys()].sort(),
      "no new reports, files or Git state",
    );
    for (const [path, content] of initial)
      assert.equal(
        after.get(path),
        join(cwd, path) === artifact
          ? content +
              Array.from(
                { length: count },
                (_, i) => `// fixture-implement-${i}\n`,
              ).join("") +
              Array.from(
                { length: restartedEdits },
                (_, i) => `// fixture-implement-${i}\n`,
              ).join("")
          : content,
        `only existing designated sentinel may change: ${path}`,
      );
  }
  return { base, cwd, home, bin, config, calls, command, runner, assertEdits };
}
const visits = (state: FlowRunState, node: string) =>
  state.steps.filter((step) => step.nodeId === node);
async function persistedRun(f: Awaited<ReturnType<typeof fixture>>) {
  const [runId] = await readdir(join(f.base, "runs"));
  const runDir = join(f.base, "runs", runId);
  const state: FlowRunState = JSON.parse(
    await readFile(join(runDir, "projections/run.json"), "utf8"),
  );
  return { runDir, state };
}

async function assertPersisted({ runDir, state }: FlowRunResult) {
  const saved = JSON.parse(
    await readFile(join(runDir, "projections/run.json"), "utf8"),
  );
  assert.deepEqual(saved.steps, JSON.parse(JSON.stringify(state.steps)));
  const trace = await readFile(join(runDir, "trace.ndjson"), "utf8");
  assert.match(trace, /acp_prompt_prepared/);
  const steps = state.steps.filter((step) => step.nodeType === "acp");
  assert.ok(steps.length);
  const ids = new Set<string>();
  const bundles = new Set<string>();
  for (const step of steps) {
    assert.ok(step.session);
    const id = step.session.acpSessionId;
    assert.match(id, /^[0-9a-f-]{36}$/);
    assert.ok(!ids.has(id), `actual ACP session reused: ${step.attemptId}`);
    ids.add(id);
    bundles.add(step.session.bundleId);
    assert.ok(step.trace?.promptArtifact);
    assert.ok(step.trace.rawResponseArtifact);
    for (const [ref, expected] of [
      [step.trace.promptArtifact, step.promptText],
      [step.trace.rawResponseArtifact, step.rawText ?? ""],
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
    const events = (await readFile(join(sessionDir, "events.ndjson"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const created = events.find((event) => event.message?.result?.sessionId)
      ?.message.result.sessionId;
    assert.equal(
      created,
      id,
      "persisted ACP session/new response proves fresh identity",
    );
    const prompts = events.filter(
      (event) => event.message?.method === "session/prompt",
    );
    assert.equal(prompts.length, 1, "isolated session has exactly one prompt");
    assert.deepEqual(prompts[0].message.params.prompt, [
      { type: "text", text: step.promptText },
    ]);
    const record = JSON.stringify(
      JSON.parse(await readFile(join(sessionDir, "record.json"), "utf8")),
    );
    assert.ok(
      record.includes(JSON.stringify(step.promptText)),
      "transcript retains prompt",
    );
    if (step.rawText) {
      assert.ok(
        record.includes(JSON.stringify(step.rawText)),
        "transcript retains raw response, including malformed reports",
      );
      const actualId = step.rawText.startsWith("{")
        ? JSON.parse(step.rawText).sessionId
        : step.rawText.match(/ACP_SESSION_ID=([0-9a-f-]+)/)?.[1];
      assert.equal(actualId, id, "server response proves actual identity");
    }
  }
  assert.equal(bundles.size, steps.length);
}

for (const repairs of [0, 2, 10]) {
  test(`real FlowRunner succeeds after initial apply plus ${repairs} repairs, judging the final return`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(t, { repairsNeeded: repairs });
    const emitted: Result[] = [];
    const flow = createImplementFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
    });
    for (const node of Object.values(flow.nodes))
      if (node.nodeType === "acp") assert.equal(node.session?.isolated, true);
    const result = await f.runner.run(flow, { changeId });
    assert.equal(result.state.status, "completed");
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].changeId, changeId);
    assert.equal(emitted[0].outcome, "success");
    assert.equal(emitted[0].repairAttempts, repairs);
    assert.equal(visits(result.state, "apply").length, 1);
    assert.equal(visits(result.state, "repair").length, repairs);
    assert.equal(visits(result.state, "judge").length, repairs + 1);
    assert.equal(visits(result.state, "steering").length, 0);
    assert.deepEqual(
      result.state.steps
        .filter((step) => ["apply", "repair", "judge"].includes(step.nodeId))
        .map((step) => step.nodeId),
      [
        "apply",
        "judge",
        ...Array.from({ length: repairs }, () => ["repair", "judge"]).flat(),
      ],
    );
    assert.deepEqual(
      visits(result.state, "judge").map(
        (step) => (step.output as { route: string }).route,
      ),
      [
        ...Array.from({ length: repairs }, () => "repairable_pause"),
        "completed",
      ],
    );
    assert.equal(
      f.calls.filter((args) => args[0] === "instructions").length,
      repairs + 2,
      "initial state and a fresh snapshot after every normal return",
    );
    const implementers = result.state.steps.filter((step) =>
      ["apply", "repair"].includes(step.nodeId),
    );
    for (const [attempt, step] of implementers.entries()) {
      assert.ok(
        step.promptText?.startsWith(
          `/skill:openspec-apply-change ${changeId}\n`,
        ),
      );
      assert.ok(
        step.promptText?.includes(`attempt ${attempt} (0 is initial apply)`),
      );
    }
    await assertPersisted(result);
    await f.assertEdits(repairs + 1);
  });
}

for (const options of [
  { tasksInitiallyDone: true, repairsNeeded: 1 },
  { tasksDoneAt: 0, repairsNeeded: 2 },
  { noGates: true },
]) {
  test(`task completion still needs fresh gates: ${JSON.stringify(options)}`, {
    timeout: 30000,
  }, async (t) => {
    const f = await fixture(t, options, true);
    const emitted: Result[] = [];
    const result = await f.runner.run(
      createImplementFlow({
        cwd: f.cwd,
        command: f.command,
        emit: (item) => emitted.push(item),
      }),
      { changeId },
    );
    assert.equal(emitted[0].outcome, "success");
    assert.equal(emitted[0].repairAttempts, options.repairsNeeded ?? 0);
    const latestJudge = visits(result.state, "judge").at(-1);
    assert.ok(latestJudge?.promptText?.includes('"state":"all_done"'));
    assert.ok(
      latestJudge?.promptText?.includes('"afterEdits":true') ||
        latestJudge?.promptText?.includes("Documentation-only scope"),
    );
    await assertPersisted(result);
    await f.assertEdits((options.repairsNeeded ?? 0) + 1);
  });
}

for (const escalationAt of [undefined, 10]) {
  test(`ten-repair budget stops ${escalationAt === 10 ? "escalation" : "repairable pause"} after final judge without steering`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(t, { repairsNeeded: 11, escalationAt });
    const emitted: Result[] = [];
    await assert.rejects(
      f.runner.run(
        createImplementFlow({
          cwd: f.cwd,
          command: f.command,
          emit: (item) => emitted.push(item),
          steering: async () => {
            assert.fail("budget must be checked before steering");
          },
        }),
        { changeId },
      ),
      /unsuccessful/i,
    );
    assert.equal(emitted[0].outcome, "limit_reached");
    assert.equal(emitted[0].repairAttempts, 10);
    const result = await persistedRun(f);
    assert.equal(visits(result.state, "repair").length, 10);
    assert.equal(visits(result.state, "judge").length, 11);
    assert.equal(visits(result.state, "steering").length, 0);
    assert.equal(
      (visits(result.state, "judge").at(-1)?.output as { route: string }).route,
      escalationAt === 10 ? "escalation_required" : "repairable_pause",
    );
    assert.ok(
      JSON.stringify(emitted[0].remaining).includes("attempt-10-design"),
      "terminal remaining work comes from last report",
    );
    await assertPersisted(result);
    await f.assertEdits(11);
  });
}

function answer(issue: { id: string; scope: string }) {
  return `ANSWER ${issue.id}: permit only ${issue.scope}`;
}
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

test("mixed consequential blockers collect every answer before repair and retain scoped answers across fresh sessions", {
  timeout: 30000,
}, async (t) => {
  const f = await fixture(t, {
    repairsNeeded: 2,
    escalation: true,
    mixedBlockers: true,
  });
  const emitted: Result[] = [];
  const io = terminal(t);
  let collections = 0;
  const result = await f.runner.run(
    createImplementFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
      steering: async (issues, signal) => {
        assert.equal(signal?.aborted, false);
        const cycle = collections++;
        assert.deepEqual(
          issues.map((issue) => issue.id),
          [`attempt-${cycle}-design`, `attempt-${cycle}-product`],
        );
        const collection = collectSteering(issues, signal, io);
        void collection.catch(() => {});
        await f.assertEdits(cycle + 1);
        io.input.write(" \t \n");
        await nextTurn();
        assert.match(io.text, /Please enter a non-blank answer/);
        await f.assertEdits(cycle + 1);
        const first = issues[0] as (typeof issues)[0] & { scope: string };
        const second = issues[1] as (typeof issues)[1] & { scope: string };
        io.input.write(`${answer(first)}\n`);
        await nextTurn();
        assert.ok(io.text.includes(`[${second.id}]`));
        await f.assertEdits(cycle + 1); // No autonomous correction or other repair before all answers.
        io.input.write(`${answer(second)}\n`);
        return collection;
      },
    }),
    { changeId },
  );
  assert.equal(collections, 2);
  assert.equal(emitted[0].outcome, "success");
  assert.equal(emitted[0].repairAttempts, 2);
  assert.deepEqual(
    result.state.steps
      .filter((step) =>
        ["apply", "judge", "steering", "repair"].includes(step.nodeId),
      )
      .map((step) => step.nodeId),
    [
      "apply",
      "judge",
      "steering",
      "repair",
      "judge",
      "steering",
      "repair",
      "judge",
    ],
  );
  const last = visits(result.state, "repair").at(-1);
  assert.ok(last?.promptText);
  const scoped = JSON.parse(
    last.promptText.split("ACCUMULATED SCOPED STEERING: ")[1].split("\n")[0],
  ) as { blocker: { id: string; scope: string }; answer: string }[];
  assert.deepEqual(
    scoped.map((item) => item.blocker.id),
    [
      "attempt-0-design",
      "attempt-0-product",
      "attempt-1-design",
      "attempt-1-product",
    ],
  );
  for (const item of scoped) assert.equal(item.answer, answer(item.blocker));
  await assertPersisted(result);
  await f.assertEdits(3);
});

for (const outcome of ["cancelled", "needs_human"] as const) {
  test(`${outcome} steering terminates with earlier apply/repair edits intact`, {
    timeout: 30000,
  }, async (t) => {
    const f = await fixture(t, { repairsNeeded: 3, escalation: true });
    const emitted: Result[] = [];
    let calls = 0;
    await assert.rejects(
      f.runner.run(
        createImplementFlow({
          cwd: f.cwd,
          command: f.command,
          emit: (item) => emitted.push(item),
          steering: async (issues) => {
            if (++calls === 2)
              throw new SteeringError(outcome, `fixture ${outcome}`);
            return Object.fromEntries(
              issues.map((issue) => [
                issue.id,
                answer(issue as typeof issue & { scope: string }),
              ]),
            );
          },
        }),
        { changeId },
      ),
      /unsuccessful/i,
    );
    assert.equal(emitted[0].outcome, outcome);
    assert.equal(emitted[0].repairAttempts, 1);
    const result = await persistedRun(f);
    assert.equal(result.state.status, "failed");
    assert.equal(visits(result.state, "repair").length, 1);
    await assertPersisted(result);
    await f.assertEdits(2);
  });
}

test("EOF after a partial mixed answer preserves edits and dispatches no repair", {
  timeout: 15000,
}, async (t) => {
  const f = await fixture(t, {
    repairsNeeded: 1,
    escalation: true,
    mixedBlockers: true,
  });
  const emitted: Result[] = [];
  const io = terminal(t);
  await assert.rejects(
    f.runner.run(
      createImplementFlow({
        cwd: f.cwd,
        command: f.command,
        emit: (item) => emitted.push(item),
        steering: async (issues, signal) => {
          const collection = collectSteering(issues, signal, io);
          void collection.catch(() => {});
          io.input.write(
            `${answer(issues[0] as (typeof issues)[0] & { scope: string })}\n`,
          );
          await nextTurn();
          await f.assertEdits(1);
          io.input.end();
          return collection;
        },
      }),
      { changeId },
    ),
    /unsuccessful/i,
  );
  assert.equal(emitted[0].outcome, "needs_human");
  assert.equal(emitted[0].repairAttempts, 0);
  const result = await persistedRun(f);
  assert.equal(visits(result.state, "repair").length, 0);
  await assertPersisted(result);
  await f.assertEdits(1);
});

for (const incomplete of ["missing", "blank", "extra"] as const) {
  test(`${incomplete} steering fails authorization without a repair dispatch`, {
    timeout: 15000,
  }, async (t) => {
    const f = await fixture(t, {
      repairsNeeded: 1,
      escalation: true,
      mixedBlockers: true,
    });
    const emitted: Result[] = [];
    await assert.rejects(
      f.runner.run(
        createImplementFlow({
          cwd: f.cwd,
          command: f.command,
          emit: (item) => emitted.push(item),
          steering: async (issues) => ({
            [issues[0].id]: answer(
              issues[0] as (typeof issues)[0] & { scope: string },
            ),
            ...(incomplete === "missing"
              ? {}
              : {
                  [issues[1].id]:
                    incomplete === "blank"
                      ? " \t "
                      : answer(
                          issues[1] as (typeof issues)[1] & { scope: string },
                        ),
                }),
            ...(incomplete === "extra"
              ? { "unrelated-issue": "invented authority" }
              : {}),
          }),
        }),
        { changeId },
      ),
      /unsuccessful/i,
    );
    assert.equal(emitted[0].outcome, "failed");
    assert.equal(emitted[0].repairAttempts, 0);
    const result = await persistedRun(f);
    assert.equal(visits(result.state, "repair").length, 0);
    await assertPersisted(result);
    await f.assertEdits(1);
  });
}

const failures: {
  name: string;
  config: Partial<Config>;
  repairs: number;
  edits: number;
  failedNode?: string;
}[] = [
  {
    name: "initial apply failure after write",
    config: { mode: "agent-failure" },
    repairs: 0,
    edits: 1,
    failedNode: "apply",
  },
  {
    name: "failed second repair dispatch counts and preserves partial edits",
    config: { mode: "agent-failure", failureAt: 2, repairsNeeded: 3 },
    repairs: 2,
    edits: 3,
    failedNode: "repair",
  },
  {
    name: "failed repair before write still consumes budget",
    config: {
      mode: "agent-failure",
      failureAt: 1,
      failureBeforeWrite: true,
      repairsNeeded: 2,
    },
    repairs: 1,
    edits: 1,
    failedNode: "repair",
  },
  {
    name: "failed tenth repair is failure, not limit",
    config: { mode: "agent-failure", failureAt: 10, repairsNeeded: 11 },
    repairs: 10,
    edits: 11,
    failedNode: "repair",
  },
  {
    name: "malformed initial report",
    config: { mode: "malformed-report" },
    repairs: 0,
    edits: 1,
    failedNode: "apply",
  },
  {
    name: "malformed repair report preserves edits",
    config: { mode: "malformed-report", failureAt: 1, repairsNeeded: 2 },
    repairs: 1,
    edits: 2,
    failedNode: "repair",
  },
  {
    name: "duplicate blocker identities",
    config: { reportFault: "duplicate-blockers", repairsNeeded: 1 },
    repairs: 0,
    edits: 1,
    failedNode: "apply",
  },
  {
    name: "unusable judge route",
    config: { mode: "malformed-judge" },
    repairs: 0,
    edits: 1,
    failedNode: "judge",
  },
  {
    name: "judge invocation fails after repair",
    config: { mode: "judge-failure", failureAt: 1, repairsNeeded: 2 },
    repairs: 1,
    edits: 2,
    failedNode: "judge",
  },
  {
    name: "refresh command fails after repair",
    config: { mode: "snapshot-failure", failureAt: 1, repairsNeeded: 2 },
    repairs: 1,
    edits: 2,
  },
  {
    name: "refresh task evidence is malformed",
    config: { mode: "malformed-snapshot" },
    repairs: 0,
    edits: 1,
  },
];
for (const scenario of failures) {
  test(`failure: ${scenario.name}`, { timeout: 60000 }, async (t) => {
    const f = await fixture(t, scenario.config);
    const emitted: Result[] = [];
    await assert.rejects(
      f.runner.run(
        createImplementFlow({
          cwd: f.cwd,
          command: f.command,
          emit: (item) => emitted.push(item),
        }),
        { changeId },
      ),
      /unsuccessful/i,
    );
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].outcome, "failed");
    assert.equal(emitted[0].repairAttempts, scenario.repairs);
    assert.ok(emitted[0].summary.trim());
    const result = await persistedRun(f);
    assert.equal(result.state.status, "failed");
    assert.equal(visits(result.state, "apply").length, 1);
    assert.equal(
      visits(result.state, "repair").length,
      scenario.repairs,
      "failed dispatch is counted without retries",
    );
    if (scenario.failedNode)
      assert.equal(
        visits(result.state, scenario.failedNode).at(-1)?.outcome,
        "failed",
      );
    if (scenario.config.mode === "agent-failure") {
      assert.equal(visits(result.state, "judge").length, scenario.repairs);
      const failed = visits(result.state, scenario.failedNode ?? "apply").at(
        -1,
      );
      assert.ok(failed?.session);
      const events = await readFile(
        join(
          result.runDir,
          "sessions",
          failed.session.bundleId,
          "events.ndjson",
        ),
        "utf8",
      );
      assert.match(events, /fixture implementer failure/);
    }
    await assertPersisted(result);
    await f.assertEdits(scenario.edits);
  });
}

for (const options of [
  ...(["missing-gates", "stale-gates", "failed-gates"] as const).map(
    (reportFault) => ({ reportFault, forceCompleted: true }),
  ),
  { repairsNeeded: 1, forceCompleted: true },
]) {
  test(`unsupported judge completion is routed to repair: ${JSON.stringify(options)}`, {
    timeout: 15000,
  }, async (t) => {
    const f = await fixture(t, options);
    const emitted: Result[] = [];
    const result = await f.runner.run(
      createImplementFlow({
        cwd: f.cwd,
        command: f.command,
        emit: (item) => emitted.push(item),
      }),
      { changeId },
    );
    assert.equal(emitted[0].outcome, "success");
    assert.equal(emitted[0].repairAttempts, 1);
    assert.equal(
      (visits(result.state, "judge")[0].output as { route: string }).route,
      "completed",
      "fixture deliberately overclaims completion",
    );
    assert.equal(
      (visits(result.state, "classification")[0].output as { route: string })
        .route,
      "repairable_pause",
      "deterministic consistency guard refuses unsupported completion",
    );
    assert.equal(visits(result.state, "judge").length, 2);
    await assertPersisted(result);
    await f.assertEdits(2);
  });
}

async function runCli(
  f: Awaited<ReturnType<typeof fixture>>,
  modulePath = flowFile,
  signalWhenReady?: Promise<void>,
  signal: NodeJS.Signals = "SIGINT",
) {
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
  child.stdin.end();
  const interrupt = signalWhenReady?.then(() => {
    assert.ok(child.kill(signal), "signal actual CLI after phase readiness");
  });
  void interrupt?.catch(() => child.kill("SIGKILL"));
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
  timer.unref();
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolveExit(code));
  }).finally(() => clearTimeout(timer));
  await interrupt;
  const emitted = stdout
    .split("\n")
    .filter((line) => line.startsWith('{"changeId":'))
    .map((line) => JSON.parse(line)) as Result[];
  assert.equal(
    emitted.length,
    1,
    `CLI must emit a result, not just fail loading: ${stdout}\n${stderr}`,
  );
  const [runId] = await readdir(join(f.home, ".acpx/flows/runs"));
  const runDir = join(f.home, ".acpx/flows/runs", runId);
  const state: FlowRunState = JSON.parse(
    await readFile(join(runDir, "projections/run.json"), "utf8"),
  );
  return { exitCode, stdout, stderr, emitted: emitted[0], runDir, state };
}
for (const scenario of [
  {
    name: "initial success",
    config: {},
    outcome: "success",
    repairs: 0,
    edits: 1,
  },
  {
    name: "repair success",
    config: { repairsNeeded: 1 },
    outcome: "success",
    repairs: 1,
    edits: 2,
  },
  {
    name: "limit reached",
    config: { repairsNeeded: 11, escalationAt: 10 },
    outcome: "limit_reached",
    repairs: 10,
    edits: 11,
  },
  {
    name: "unavailable TTY",
    config: { repairsNeeded: 1, escalation: true },
    outcome: "needs_human",
    repairs: 0,
    edits: 1,
  },
  {
    name: "failed repair invocation",
    config: { mode: "agent-failure", failureAt: 1, repairsNeeded: 2 },
    outcome: "failed",
    repairs: 1,
    edits: 2,
  },
] satisfies {
  name: string;
  config: Partial<Config>;
  outcome: Result["outcome"];
  repairs: number;
  edits: number;
}[]) {
  test(`CLI exits correctly: ${scenario.name}`, {
    timeout: 70000,
  }, async (t) => {
    const f = await fixture(t, scenario.config);
    const result = await runCli(f);
    assert.equal(result.emitted.changeId, changeId);
    assert.equal(result.emitted.outcome, scenario.outcome, result.stderr);
    assert.equal(result.emitted.repairAttempts, scenario.repairs);
    assert.equal(
      result.exitCode === 0,
      scenario.outcome === "success",
      result.stderr,
    );
    assert.equal(
      result.state.status,
      scenario.outcome === "success" ? "completed" : "failed",
    );
    assert.equal(visits(result.state, "repair").length, scenario.repairs);
    assert.ok(
      result.stderr.includes(
        `${changeId}: ${scenario.outcome}, ${scenario.repairs}/10 repairs`,
      ),
    );
    await assertPersisted(result);
    await f.assertEdits(scenario.edits);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  for (const phase of ["apply", "repair", "steering"] as const) {
    test(`actual CLI ${signal} during ${phase} emits one cancellation and counts active repair`, {
      timeout: 30000,
    }, async (t) => {
      let resolveReady!: (message: { phase: string; cycle: number }) => void;
      const ready = new Promise<{ phase: string; cycle: number }>((resolve) => {
        resolveReady = resolve;
      });
      const server = createServer((socket) => {
        let message = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk: string) => {
          message += chunk;
        });
        socket.on("end", () => resolveReady(JSON.parse(message)));
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      t.after(
        () => new Promise<void>((resolve) => server.close(() => resolve())),
      );
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const f = await fixture(t, {
        repairsNeeded: 3,
        readyPort: address.port,
        failureAt: phase === "apply" ? 0 : 1,
        escalation: phase === "steering",
        ...(phase !== "steering"
          ? { mode: `${phase}-interrupt` as const }
          : {}),
      });
      let modulePath = flowFile;
      if (phase === "steering") {
        modulePath = join(f.base, "interrupt-steering.flow.ts");
        await writeFile(
          modulePath,
          `import { createConnection } from "node:net";\nimport { createImplementFlow } from ${JSON.stringify(join(repo, "flows/openspec-implement/flow.ts"))};\nimport { SteeringError } from ${JSON.stringify(join(repo, "flows/shared/steering.ts"))};\nlet calls = 0;\nexport default createImplementFlow({ steering: async (issues, signal) => {\nif (++calls === 1) return Object.fromEntries(issues.map(issue => [issue.id, "ANSWER " + issue.id + ": permit only " + issue.scope]));\nreturn new Promise((_, reject) => {\nsignal.addEventListener("abort", () => reject(new SteeringError("cancelled", "interrupted pending steering")), { once: true });\nconst socket = createConnection({ host: "127.0.0.1", port: ${address.port} }, () => socket.end(JSON.stringify({ phase: "steering", cycle: 1 }) + "\\n"));\nsocket.on("error", reject);\n});\n} });\n`,
        );
      }
      const edits = phase === "apply" ? 1 : 2;
      const signalWhenReady = ready.then(async (message) => {
        assert.equal(message.phase, phase);
        assert.equal(message.cycle, phase === "apply" ? 0 : 1);
        await f.assertEdits(edits);
      });
      const result = await runCli(f, modulePath, signalWhenReady, signal);
      assert.equal(result.emitted.outcome, "cancelled", result.stderr);
      assert.equal(result.emitted.repairAttempts, phase === "apply" ? 0 : 1);
      assert.match(
        result.emitted.summary,
        new RegExp(`Interrupted during ${phase}`),
      );
      assert.notEqual(result.exitCode, 0);
      assert.equal(visits(result.state, "success").length, 0);
      assert.equal(
        visits(result.state, "repair").length,
        phase === "steering" ? 1 : 0,
      );
      if (phase === "apply") {
        // Global interruption deliberately leaves the active ACP step unrecorded.
        assert.equal(visits(result.state, "apply").length, 0);
        const saved = JSON.parse(
          await readFile(join(result.runDir, "projections/run.json"), "utf8"),
        );
        assert.deepEqual(saved.steps, result.state.steps);
        const sessions = await readdir(join(result.runDir, "sessions"));
        assert.equal(sessions.length, 1);
        const events = await readFile(
          join(result.runDir, "sessions", sessions[0], "events.ndjson"),
          "utf8",
        );
        assert.match(events, /session\/prompt/);
        assert.match(events, /openspec-apply-change/);
      } else {
        await assertPersisted(result);
      }
      await f.assertEdits(edits);
    });
  }
}

for (const mode of [
  undefined,
  "assessment-failure",
  "malformed-assessment",
  "empty-assessment",
] as const) {
  test(`real escalation assessment fallback: ${mode ?? "success"}`, {
    timeout: 30000,
  }, async (t) => {
    const f = await fixture(t, { forceEscalation: true, mode });
    const emitted: Result[] = [];
    let questions = 0;
    const flow = createImplementFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
      steering: async (issues) => {
        questions++;
        assert.equal(issues.length, 1);
        assert.equal(issues[0].id, "assessment-0");
        return {
          "assessment-0":
            "ANSWER assessment-0: permit only design.md section 0 only",
        };
      },
    });
    const modulePath = join(f.base, "assessment.flow.ts");
    await writeFile(
      modulePath,
      `import { createImplementFlow } from ${JSON.stringify(join(repo, "flows/openspec-implement/flow.ts"))};\nexport default createImplementFlow({ steering: async issues => Object.fromEntries(issues.map(issue => [issue.id, "ANSWER " + issue.id + ": permit only " + issue.scope])) });\n`,
    );
    if (mode) {
      // Actual CLI supplies nonzero-exit coverage for every bad fallback packet.
      const result = await runCli(f, modulePath);
      assert.equal(result.emitted.outcome, "failed");
      assert.notEqual(result.exitCode, 0);
      assert.equal(visits(result.state, "assess").length, 1);
      assert.equal(visits(result.state, "steering").length, 0);
      assert.equal(visits(result.state, "repair").length, 0);
      await assertPersisted(result);
      await f.assertEdits(1);
    } else {
      const result = await f.runner.run(flow, { changeId });
      assert.equal(emitted[0].outcome, "success");
      assert.equal(emitted[0].repairAttempts, 1);
      assert.equal(questions, 1);
      assert.equal(visits(result.state, "assess").length, 1);
      assert.equal(
        visits(result.state, "assess")[0].session?.acpSessionId ===
          visits(result.state, "judge")[0].session?.acpSessionId,
        false,
      );
      await assertPersisted(result);
      await f.assertEdits(2);
    }
  });
}

test("same-workspace restart after exhaustion preserves edits and starts a fresh ten-repair budget", {
  timeout: 120000,
}, async (t) => {
  const f = await fixture(t, { repairsNeeded: 11 });
  const emitted: Result[] = [];
  const flow = createImplementFlow({
    cwd: f.cwd,
    command: f.command,
    emit: (item) => emitted.push(item),
  });
  await assert.rejects(f.runner.run(flow, { changeId }), /unsuccessful/i);
  const first = await persistedRun(f);
  assert.equal(emitted[0].outcome, "limit_reached");
  assert.equal(emitted[0].repairAttempts, 10);
  await f.assertEdits(11);
  // Configure only the fixture's existing-marker offset, never flow state/checkpoints.
  f.config.initialUpdates = 11;
  await writeFile(
    join(f.cwd, ".implement-fixture.json"),
    JSON.stringify(f.config),
  );
  const configBefore = await readFile(
    join(f.cwd, ".implement-fixture.json"),
    "utf8",
  );
  await assert.rejects(f.runner.run(flow, { changeId }), /unsuccessful/i);
  assert.equal(emitted[1].outcome, "limit_reached");
  assert.equal(emitted[1].repairAttempts, 10);
  const runIds = await readdir(join(f.base, "runs"));
  const secondDir = join(
    f.base,
    "runs",
    runIds.find((id) => id !== first.state.runId) as string,
  );
  const second: FlowRunState = JSON.parse(
    await readFile(join(secondDir, "projections/run.json"), "utf8"),
  );
  assert.equal(visits(second, "repair").length, 10);
  assert.equal(visits(second, "judge").length, 11);
  assert.match(
    visits(second, "apply")[0].promptText ?? "",
    /attempt 0 \(0 is initial apply\)/,
  );
  const priorSessions = new Set(
    first.state.steps.map((step) => step.session?.acpSessionId),
  );
  for (const step of second.steps.filter((item) => item.session))
    assert.ok(!priorSessions.has(step.session?.acpSessionId));
  assert.equal(
    await readFile(join(f.cwd, ".implement-fixture.json"), "utf8"),
    configBefore,
  );
  // Config change is test setup; restore only that fixture config for exact tree comparison.
  delete f.config.initialUpdates;
  await writeFile(
    join(f.cwd, ".implement-fixture.json"),
    JSON.stringify(f.config),
  );
  await f.assertEdits(11, 11);
  await assertPersisted(first);
  await assertPersisted({ runDir: secondDir, state: second });
});

test("CLI cancelled steering emits cancelled and exits nonzero", {
  timeout: 20000,
}, async (t) => {
  const f = await fixture(t, { repairsNeeded: 1, escalation: true });
  const modulePath = join(f.base, "cancelled.flow.ts");
  await writeFile(
    modulePath,
    `import { createImplementFlow } from ${JSON.stringify(join(repo, "flows/openspec-implement/flow.ts"))};\nimport { SteeringError } from ${JSON.stringify(join(repo, "flows/shared/steering.ts"))};\nexport default createImplementFlow({ steering: async () => { throw new SteeringError("cancelled", "fixture cancellation"); } });\n`,
  );
  const result = await runCli(f, modulePath);
  assert.equal(result.emitted.outcome, "cancelled");
  assert.equal(result.emitted.repairAttempts, 0);
  assert.notEqual(result.exitCode, 0);
  assert.equal(visits(result.state, "repair").length, 0);
  await assertPersisted(result);
  await f.assertEdits(1);
});
