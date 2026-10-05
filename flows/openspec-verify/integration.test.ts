import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
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
import { promisify } from "node:util";
import { FlowRunner, type FlowRunResult, type FlowRunState } from "acpx/flows";
import type { Command, CommandResult } from "../shared/command.js";
import { collectSteering, SteeringError } from "../shared/steering.js";
import { createVerifyFlow, type VerifyResult } from "./flow.js";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fakeAgent = join(repo, "flows/shared/fixtures/fake-agent.mjs");
const flowFile = join(repo, "flows/openspec-verify/index.ts");
const cliFile = join(repo, "node_modules/acpx/dist/cli.js");
const changeId = "fixture-change";
const dirtySentinel = "Uncommitted human edit: KEEP THIS EXACTLY.\n";
const execute = promisify(execFile);
interface Config {
  changeId: string;
  cwd: string;
  artifact: string;
  contextFiles: Record<string, string[]>;
  dirtySentinel: string;
  repairsNeeded?: number;
  escalation?: boolean;
  escalationAt?: number;
  mixedBlockers?: boolean;
  forceAccepted?: boolean;
  inapplicableCoherence?: boolean;
  noGates?: boolean;
  mode?: string;
  failureAt?: number;
  failureBeforeWrite?: boolean;
  reportFault?: string;
  incompleteTasks?: boolean;
  missingTasks?: boolean;
  readyPort?: number;
}

// Both the injected command and real CLI executable use these wire shapes.
// The current snapshot is always selected from edits on disk, not a call counter.
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
  const root = join(cwd, "openspec/changes", config.changeId);
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
    const count = [...content.matchAll(/^\/\/ fixture-verify-\d+$/gm)].length;
    if (config.mode === "snapshot-failure" && count >= (config.failureAt ?? 1))
      return json({}, 2, "fixture apply instructions failure");
    const done =
      !config.incompleteTasks &&
      !(config.mode === "reopened-task" && count === 1);
    return json({
      changeName: config.changeId,
      changeDir: root,
      state: done ? "all_done" : "ready",
      contextFiles: config.missingTasks
        ? { ...config.contextFiles, tasks: [] }
        : config.contextFiles,
      tasks: [
        {
          id: "1.1",
          description: "Implement approved behavior",
          done:
            config.mode === "malformed-snapshot" &&
            count >= (config.failureAt ?? 1)
              ? "yes"
              : done,
        },
      ],
      instruction:
        "Read every current approved artifact. Tasks are completed; independently verify.",
      context:
        "Preserve existing dirt and establish current fixture integrity evidence.",
    });
  }
  throw new Error(
    `Unexpected OpenSpec invocation (no sync/archive): ${JSON.stringify(args)}`,
  );
}

async function files(root: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else {
        assert.ok(entry.isFile(), `unexpected non-file: ${path}`);
        result.set(path.slice(root.length + 1), await readFile(path));
      }
    }
  }
  await visit(root);
  return result;
}

async function fixture(t: TestContext, options: Partial<Config> = {}) {
  const base = await mkdtemp(join(tmpdir(), "verify-integration-"));
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
  const planning = [
    "proposal.md",
    "design.md",
    "tasks.md",
    "specs/approved/spec.md",
  ].map((name) => join(changeRoot, name));
  for (const path of planning) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      `# ${path.split("/").at(-1)}\n\n${path.endsWith("tasks.md") ? "- [x] 1.1 Implement approved behavior\n" : "Approved intent stays unchanged.\n"}`,
    );
  }
  const artifact = join(cwd, "implementation.ts");
  await writeFile(artifact, "export const original = true;\n");
  await writeFile(
    join(cwd, "unrelated.txt"),
    "Human-owned unrelated content.\n",
  );
  await mkdir(join(cwd, "openspec/specs/approved"), { recursive: true });
  await writeFile(
    join(cwd, "openspec/specs/approved/spec.md"),
    "Main spec: must not sync from active change.\n",
  );
  await execute("git", ["init", "--quiet"], { cwd });
  await execute("git", ["add", "."], { cwd });
  await execute(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture baseline",
    ],
    { cwd },
  );
  for (const path of [...planning, artifact, join(cwd, "unrelated.txt")]) {
    const before = await readFile(path, "utf8");
    await writeFile(
      path,
      before + (path === artifact ? "// " : "") + dirtySentinel,
    );
  }
  const config: Config = {
    changeId,
    cwd,
    artifact,
    dirtySentinel,
    contextFiles: {
      proposal: [planning[0]],
      ...(options.inapplicableCoherence ? {} : { design: [planning[1]] }),
      tasks: [planning[2]],
      specs: [planning[3]],
    },
    ...options,
  };
  await writeFile(join(cwd, ".verify-fixture.json"), JSON.stringify(config));
  // Detection precedence is deliberate: verifier must never enter an older handler.
  await writeFile(join(cwd, ".implement-fixture.json"), "{}");
  await writeFile(
    join(home, ".acpx/config.json"),
    JSON.stringify({ agents: { pi: { argv: [process.execPath, fakeAgent] } } }),
  );
  const invocations = [
    ["list", "--json"],
    ["status", "--change", changeId, "--json"],
    ["instructions", "apply", "--change", changeId, "--json"],
  ];
  const replies = invocations.flatMap((args) =>
    Array.from({ length: 12 }, (_, count) => [
      JSON.stringify([args, count]),
      openspecReply(
        args,
        cwd,
        config,
        Array.from(
          { length: count },
          (_, i) => `// fixture-verify-${i + 1}\n`,
        ).join(""),
      ),
    ]),
  );
  const executable = join(bin, "openspec");
  await writeFile(
    executable,
    `#!${process.execPath}\nconst { readFileSync } = require("node:fs");\nconst replies = new Map(${JSON.stringify(replies)});\nconst content = readFileSync(${JSON.stringify(artifact)}, "utf8");\nconst count = [...content.matchAll(/^\\/\\/ fixture-verify-\\d+$/gm)].length;\nconst args = process.argv.slice(2);\nconst result = replies.get(JSON.stringify([args, count]));\nif (!result) throw new Error("Unexpected OpenSpec invocation: " + JSON.stringify(args));\nprocess.stdout.write(result.stdout);\nprocess.stderr.write(result.stderr);\nprocess.exitCode = result.exitCode;\n`,
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
  async function assertEdits(count: number) {
    const after = await files(cwd);
    assert.deepEqual(
      [...after.keys()].sort(),
      [...initial.keys()].sort(),
      "no new files, reports, archives or Git state",
    );
    for (const [path, content] of initial)
      assert.deepEqual(
        after.get(path),
        join(cwd, path) === artifact
          ? Buffer.concat([
              content,
              Buffer.from(
                Array.from(
                  { length: count },
                  (_, i) => `// fixture-verify-${i + 1}\n`,
                ).join(""),
              ),
            ])
          : content,
        `only existing implementation artifact may change; no sync/commit/stash/rollback: ${path}`,
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

async function assertPersisted({
  runDir,
  state,
}: Pick<FlowRunResult, "runDir" | "state">) {
  const saved = JSON.parse(
    await readFile(join(runDir, "projections/run.json"), "utf8"),
  );
  assert.deepEqual(saved.steps, JSON.parse(JSON.stringify(state.steps)));
  const steps = state.steps.filter((step) => step.nodeType === "acp");
  if (steps.length)
    assert.match(
      await readFile(join(runDir, "trace.ndjson"), "utf8"),
      /acp_prompt_prepared/,
    );
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
    for (const [ref, expected] of [
      [step.trace.promptArtifact, step.promptText],
      [step.trace.rawResponseArtifact, step.rawText ?? ""],
    ] as const) {
      if (!ref) {
        assert.notEqual(step.outcome, "ok");
        continue;
      }
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
    assert.equal(
      events.find((event) => event.message?.result?.sessionId)?.message.result
        .sessionId,
      id,
      "persisted ACP session/new proves fresh identity",
    );
    const prompts = events.filter(
      (event) => event.message?.method === "session/prompt",
    );
    assert.equal(
      prompts.length,
      1,
      "each isolated session receives exactly one prompt",
    );
    assert.deepEqual(prompts[0].message.params.prompt, [
      { type: "text", text: step.promptText },
    ]);
    const record = JSON.stringify(
      JSON.parse(await readFile(join(sessionDir, "record.json"), "utf8")),
    );
    // acpx's convenience record clips long text at 8,000 characters; the
    // events and hashed artifacts above must still retain the complete prompt.
    const transcriptText = (text: string) =>
      text.length > 8000 ? `${text.slice(0, 7997)}...` : text;
    assert.ok(
      record.includes(JSON.stringify(transcriptText(step.promptText ?? ""))),
      "transcript retains prompt (or acpx's bounded preview)",
    );
    if (step.rawText) {
      assert.ok(
        record.includes(JSON.stringify(transcriptText(step.rawText))),
        "transcript retains raw response, including malformed JSON",
      );
      const actualId = step.rawText.startsWith("{")
        ? JSON.parse(step.rawText).sessionId
        : step.rawText.match(/ACP_SESSION_ID=([0-9a-f-]+)/)?.[1];
      assert.equal(
        actualId,
        id,
        "agent output proves actual isolated session identity",
      );
    }
  }
  assert.equal(bundles.size, steps.length);
}

for (const repairs of [0, 1, 10]) {
  test(`real ACP verification succeeds after ${repairs} repairs and retains suggestions`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(t, { repairsNeeded: repairs });
    const emitted: VerifyResult[] = [];
    const flow = createVerifyFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
    });
    for (const node of Object.values(flow.nodes))
      if (node.nodeType === "acp") assert.equal(node.session?.isolated, true);
    const result = await f.runner.run(flow, { changeId });
    assert.equal(result.state.status, "completed");
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].outcome, "success");
    assert.equal(emitted[0].repairAttempts, repairs);
    assert.deepEqual(
      emitted[0].remaining.map((f) => [f.id, f.severity]),
      [["optional-polish", "SUGGESTION"]],
    );
    assert.match(
      emitted[0].report?.report ?? "",
      /## Completeness[\s\S]*## Correctness[\s\S]*## Coherence[\s\S]*Optional naming polish/,
    );
    assert.deepEqual(
      result.state.steps
        .filter((s) =>
          ["verify", "judge", "assess", "repair"].includes(s.nodeId),
        )
        .map((s) => s.nodeId),
      [
        "verify",
        "judge",
        ...Array.from({ length: repairs }, () => [
          "assess",
          "repair",
          "verify",
          "judge",
        ]).flat(),
      ],
    );
    assert.equal(visits(result.state, "steering").length, 0);
    assert.equal(
      f.calls.filter((args) => args[0] === "instructions").length,
      repairs + 2,
      "preflight plus current snapshot before every verification",
    );
    for (const [cycle, step] of visits(result.state, "verify").entries()) {
      assert.ok(
        step.promptText?.startsWith(
          `/skill:openspec-verify-change ${changeId}\n`,
        ),
      );
      assert.match(step.promptText ?? "", /READ-ONLY/);
      assert.ok(
        (step.output as { report: string }).report.startsWith(
          `# Verification after ${cycle} repairs`,
        ),
      );
    }
    await assertPersisted(result);
    await f.assertEdits(repairs);
  });
}

test("schema-inapplicable coherence and justified no applicable gates are accepted read-only", {
  timeout: 15000,
}, async (t) => {
  const f = await fixture(t, { inapplicableCoherence: true, noGates: true });
  const emitted: VerifyResult[] = [];
  const result = await f.runner.run(
    createVerifyFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
    }),
    { changeId },
  );
  assert.equal(emitted[0].outcome, "success");
  assert.equal(emitted[0].report?.dimensions.coherence.status, "inapplicable");
  assert.match(
    emitted[0].report?.noApplicableGates ?? "",
    /Documentation-only/,
  );
  await assertPersisted(result);
  await f.assertEdits(0);
});

for (const escalationAt of [undefined, 10]) {
  test(`tenth repair fresh verification still blocks; limit precedes ${escalationAt === 10 ? "consequential steering" : "assessment"}`, {
    timeout: 60000,
  }, async (t) => {
    const f = await fixture(t, { repairsNeeded: 11, escalationAt });
    const emitted: VerifyResult[] = [];
    await assert.rejects(
      f.runner.run(
        createVerifyFlow({
          cwd: f.cwd,
          command: f.command,
          emit: (item) => emitted.push(item),
          steering: async () => assert.fail("budget must precede steering"),
        }),
        { changeId },
      ),
      /unsuccessful/i,
    );
    assert.equal(emitted[0].outcome, "limit_reached");
    assert.equal(emitted[0].repairAttempts, 10);
    assert.ok(
      emitted[0].remaining.some((finding) =>
        finding.id.startsWith("finding-10-"),
      ),
    );
    assert.ok(
      emitted[0].report?.report.startsWith("# Verification after 10 repairs"),
    );
    const result = await persistedRun(f);
    assert.equal(visits(result.state, "verify").length, 11);
    assert.equal(visits(result.state, "judge").length, 11);
    assert.equal(visits(result.state, "assess").length, 10);
    assert.equal(visits(result.state, "repair").length, 10);
    assert.equal(visits(result.state, "steering").length, 0);
    await assertPersisted(result);
    await f.assertEdits(10);
  });
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
const scopedAnswer = (resolution: { id: string; scope: string }) =>
  `ANSWER ${resolution.id}: permit only ${resolution.scope}`;

// Use the real readline steering collector without driving a full-screen TUI.
test("mixed mechanical/consequential batches wait for every answer and accumulate issue-scoped authorization", {
  timeout: 30000,
}, async (t) => {
  const f = await fixture(t, {
    repairsNeeded: 2,
    escalation: true,
    mixedBlockers: true,
  });
  const emitted: VerifyResult[] = [];
  const io = terminal(t);
  let collections = 0;
  const result = await f.runner.run(
    createVerifyFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
      steering: async (issues, signal) => {
        const cycle = collections++;
        assert.deepEqual(
          issues.map((issue) => issue.id),
          [`cycle-${cycle}-design`, `cycle-${cycle}-product`],
        );
        const collection = collectSteering(issues, signal, io);
        void collection.catch(() => {});
        await f.assertEdits(cycle);
        io.input.write(" \t \n");
        await nextTurn();
        assert.match(io.text, /Please enter a non-blank answer/);
        await f.assertEdits(cycle);
        for (const [index, issue] of issues.entries()) {
          const scope = issue.issue.split("Requested authorization scope: ")[1];
          assert.ok(scope);
          io.input.write(`${scopedAnswer({ id: issue.id, scope })}\n`);
          if (index === 0) {
            await nextTurn();
            assert.ok(io.text.includes(`[${issues[1].id}]`));
            await f.assertEdits(cycle); // Neither mechanical nor consequential repairs start after partial consent.
          }
        }
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
      .filter((s) =>
        ["verify", "assess", "steering", "repair"].includes(s.nodeId),
      )
      .map((s) => s.nodeId),
    [
      "verify",
      "assess",
      "steering",
      "repair",
      "verify",
      "assess",
      "steering",
      "repair",
      "verify",
    ],
  );
  const lastVerify = visits(result.state, "verify").at(-1)?.promptText;
  assert.ok(lastVerify);
  const accumulated = JSON.parse(
    lastVerify.split("ACCUMULATED SCOPED STEERING: ")[1].split("\n")[0],
  ) as {
    resolution: {
      id: string;
      scope: string;
      paths: string[];
      findingIds: string[];
    };
    answer: string;
  }[];
  assert.deepEqual(
    accumulated.map((item) => item.resolution.id),
    ["cycle-0-design", "cycle-0-product", "cycle-1-design", "cycle-1-product"],
  );
  for (const item of accumulated) {
    assert.equal(item.answer, scopedAnswer(item.resolution));
    assert.deepEqual(item.resolution.paths, [f.config.artifact]);
    assert.equal(item.resolution.findingIds.length, 1);
  }
  await assertPersisted(result);
  await f.assertEdits(2);
});

for (const mode of [
  "eof",
  "cancelled",
  "needs_human",
  "timeout",
  "missing",
  "blank",
  "extra",
] as const) {
  test(`steering ${mode} never grants partial/broadened authority; earlier edits remain`, {
    timeout: 20000,
  }, async (t) => {
    const f = await fixture(t, {
      repairsNeeded: 3,
      escalation: true,
      mixedBlockers: true,
    });
    const io = terminal(t);
    const emitted: VerifyResult[] = [];
    let calls = 0;
    await assert.rejects(
      f.runner.run(
        createVerifyFlow({
          cwd: f.cwd,
          command: f.command,
          emit: (item) => emitted.push(item),
          steering: async (issues, signal) => {
            const answers = Object.fromEntries(
              issues.map((issue) => [
                issue.id,
                scopedAnswer({
                  id: issue.id,
                  scope: issue.issue.split(
                    "Requested authorization scope: ",
                  )[1],
                }),
              ]),
            );
            if (++calls === 1) return answers;
            await f.assertEdits(1);
            if (mode === "cancelled" || mode === "needs_human")
              throw new SteeringError(mode, `fixture ${mode}`);
            if (mode === "missing") delete answers[issues[1].id];
            else if (mode === "blank") answers[issues[1].id] = " \t ";
            else if (mode === "extra")
              answers["unrelated-issue"] = "invented authority";
            else {
              const collection = collectSteering(issues, signal, {
                ...io,
                ...(mode === "timeout" ? { timeoutMs: 20 } : {}),
              });
              void collection.catch(() => {});
              io.input.write(`${answers[issues[0].id]}\n`);
              await nextTurn();
              await f.assertEdits(1);
              if (mode === "eof") io.input.end();
              return collection;
            }
            return answers;
          },
        }),
        { changeId },
      ),
      /unsuccessful/i,
    );
    assert.equal(
      emitted[0].outcome,
      mode === "eof" || mode === "needs_human"
        ? "needs_human"
        : mode === "cancelled"
          ? "cancelled"
          : "failed",
    );
    assert.equal(emitted[0].repairAttempts, 1);
    const result = await persistedRun(f);
    assert.equal(visits(result.state, "repair").length, 1);
    await assertPersisted(result);
    await f.assertEdits(1);
  });
}

for (const reportFault of [
  "missing-gates",
  "failed-gates",
  "unavailable-gates",
  "missing-dimension",
  "missing-evidence",
]) {
  test(`overclaimed acceptance cannot waive ${reportFault}; assessment and fresh verify required`, {
    timeout: 20000,
  }, async (t) => {
    const f = await fixture(t, { reportFault, forceAccepted: true });
    const emitted: VerifyResult[] = [];
    const result = await f.runner.run(
      createVerifyFlow({
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
      "accepted",
    );
    assert.equal(
      (visits(result.state, "classification")[0].output as { route: string })
        .route,
      "blocking",
    );
    assert.match(
      visits(result.state, "assess")[0].promptText ?? "",
      /flow-(gate|gates|dimension|evidence)/,
    );
    await assertPersisted(result);
    await f.assertEdits(1);
  });
}

test("current reopened tasks override verifier/judge acceptance and are repaired before fresh verification", {
  timeout: 20000,
}, async (t) => {
  const f = await fixture(t, {
    repairsNeeded: 1,
    mode: "reopened-task",
    forceAccepted: true,
  });
  const emitted: VerifyResult[] = [];
  const result = await f.runner.run(
    createVerifyFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
    }),
    { changeId },
  );
  assert.equal(emitted[0].outcome, "success");
  assert.equal(emitted[0].repairAttempts, 2);
  assert.match(
    visits(result.state, "assess")[1].promptText ?? "",
    /flow-task-0/,
  );
  await assertPersisted(result);
  await f.assertEdits(2);
});

const failures = [
  {
    name: "verifier invocation",
    config: { mode: "verify-failure" },
    node: "verify",
    repairs: 0,
    edits: 0,
  },
  {
    name: "fresh verifier fails after repair",
    config: { mode: "verify-failure", failureAt: 1 },
    node: "verify",
    repairs: 1,
    edits: 1,
  },
  {
    name: "malformed verification report",
    config: { mode: "malformed-report" },
    node: "verify",
    repairs: 0,
    edits: 0,
  },
  {
    name: "malformed fresh report preserves earlier fix",
    config: { mode: "malformed-report", failureAt: 1 },
    node: "verify",
    repairs: 1,
    edits: 1,
  },
  {
    name: "duplicate finding identities",
    config: { reportFault: "duplicate-findings" },
    node: "verify",
    repairs: 0,
    edits: 0,
  },
  {
    name: "inconclusive report is not repaired/retried",
    config: { mode: "inconclusive-report" },
    node: "classification",
    repairs: 0,
    edits: 0,
  },
  {
    name: "decision invocation",
    config: { mode: "judge-failure" },
    node: "judge",
    repairs: 0,
    edits: 0,
  },
  {
    name: "malformed decision",
    config: { mode: "malformed-judge" },
    node: "judge",
    repairs: 0,
    edits: 0,
  },
  {
    name: "assessment invocation",
    config: { mode: "assess-failure" },
    node: "assess",
    repairs: 0,
    edits: 0,
  },
  {
    name: "malformed assessment",
    config: { mode: "malformed-assessment" },
    node: "assess",
    repairs: 0,
    edits: 0,
  },
  {
    name: "incomplete mixed assessment",
    config: { mode: "incomplete-assessment", mixedBlockers: true },
    node: "assess",
    repairs: 0,
    edits: 0,
  },
  {
    name: "repair invocation before write counts dispatch",
    config: { mode: "repair-failure", failureBeforeWrite: true },
    node: "repair",
    repairs: 1,
    edits: 0,
  },
  {
    name: "repair invocation after write preserves partial edit",
    config: { mode: "repair-failure" },
    node: "repair",
    repairs: 1,
    edits: 1,
  },
  {
    name: "malformed repair return preserves edit",
    config: { mode: "malformed-repair" },
    node: "repair",
    repairs: 1,
    edits: 1,
  },
  {
    name: "tenth failed repair is failure not limit",
    config: { mode: "repair-failure", failureAt: 9, repairsNeeded: 11 },
    node: "repair",
    repairs: 10,
    edits: 10,
  },
  {
    name: "fresh snapshot command failure",
    config: { mode: "snapshot-failure" },
    node: "refresh",
    repairs: 1,
    edits: 1,
  },
  {
    name: "malformed fresh task snapshot",
    config: { mode: "malformed-snapshot" },
    node: "refresh",
    repairs: 1,
    edits: 1,
  },
] satisfies {
  name: string;
  config: Partial<Config>;
  node: string;
  repairs: number;
  edits: number;
}[];
for (const scenario of failures) {
  test(`terminal failure: ${scenario.name}`, { timeout: 60000 }, async (t) => {
    const f = await fixture(t, { repairsNeeded: 2, ...scenario.config });
    const emitted: VerifyResult[] = [];
    await assert.rejects(
      f.runner.run(
        createVerifyFlow({
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
    assert.equal(
      visits(result.state, "repair").length,
      scenario.repairs,
      "no automatic retry and failed dispatch consumes budget",
    );
    assert.equal(visits(result.state, scenario.node).at(-1)?.outcome, "failed");
    await assertPersisted(result);
    await f.assertEdits(scenario.edits);
  });
}

for (const node of ["verify", "judge", "assess", "repair"] as const) {
  test(`real ACP ${node} timeout terminates without retry or rollback`, {
    timeout: 20000,
  }, async (t) => {
    const f = await fixture(t, {
      repairsNeeded: 2,
      mode: `${node}-timeout`,
      failureAt: 1,
    });
    const emitted: VerifyResult[] = [];
    const flow = createVerifyFlow({
      cwd: f.cwd,
      command: f.command,
      emit: (item) => emitted.push(item),
    });
    flow.nodes[node].timeoutMs = 1000;
    await assert.rejects(f.runner.run(flow, { changeId }), /unsuccessful/i);
    assert.equal(emitted[0].outcome, "failed");
    assert.equal(emitted[0].repairAttempts, node === "repair" ? 2 : 1);
    const result = await persistedRun(f);
    assert.equal(visits(result.state, node).at(-1)?.outcome, "timed_out");
    await assertPersisted(result);
    await f.assertEdits(1);
  });
}

async function runCli(
  f: Awaited<ReturnType<typeof fixture>>,
  modulePath = flowFile,
  signalWhenReady?: Promise<unknown>,
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
    assert.ok(
      child.kill("SIGINT"),
      "signal the actual CLI process after phase readiness",
    );
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
    .map((line) => JSON.parse(line)) as VerifyResult[];
  assert.equal(
    emitted.length,
    1,
    `CLI must emit result, not merely fail loading: ${stdout}\n${stderr}`,
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
    name: "no-repair success",
    config: {},
    outcome: "success",
    repairs: 0,
    edits: 0,
  },
  {
    name: "mechanical repair success",
    config: { repairsNeeded: 1 },
    outcome: "success",
    repairs: 1,
    edits: 1,
  },
  {
    name: "tenth repair accepted",
    config: { repairsNeeded: 10 },
    outcome: "success",
    repairs: 10,
    edits: 10,
  },
  {
    name: "ten-repair limit before consequential steering",
    config: { repairsNeeded: 11, escalationAt: 10 },
    outcome: "limit_reached",
    repairs: 10,
    edits: 10,
  },
  {
    name: "unavailable TTY",
    config: { repairsNeeded: 1, escalation: true },
    outcome: "needs_human",
    repairs: 0,
    edits: 0,
  },
  {
    name: "verifier fails",
    config: { mode: "verify-failure" },
    outcome: "failed",
    repairs: 0,
    edits: 0,
  },
  {
    name: "malformed report",
    config: { mode: "malformed-report" },
    outcome: "failed",
    repairs: 0,
    edits: 0,
  },
  {
    name: "assessment fails",
    config: { repairsNeeded: 1, mode: "assess-failure" },
    outcome: "failed",
    repairs: 0,
    edits: 0,
  },
  {
    name: "decision fails",
    config: { mode: "judge-failure" },
    outcome: "failed",
    repairs: 0,
    edits: 0,
  },
  {
    name: "repair fails after edit",
    config: { repairsNeeded: 1, mode: "repair-failure" },
    outcome: "failed",
    repairs: 1,
    edits: 1,
  },
  {
    name: "incomplete implementation preflight",
    config: { incompleteTasks: true },
    outcome: "failed",
    repairs: 0,
    edits: 0,
  },
  {
    name: "missing usable tasks artifact",
    config: { missingTasks: true },
    outcome: "failed",
    repairs: 0,
    edits: 0,
  },
] satisfies {
  name: string;
  config: Partial<Config>;
  outcome: VerifyResult["outcome"];
  repairs: number;
  edits: number;
}[]) {
  test(`actual CLI exit: ${scenario.name}`, { timeout: 70000 }, async (t) => {
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
    if (scenario.outcome === "success")
      assert.equal(result.emitted.remaining[0].severity, "SUGGESTION");
    await assertPersisted(result);
    await f.assertEdits(scenario.edits);
  });
}

for (const mode of ["cancelled", "timeout"] as const) {
  test(`CLI ${mode} emits unsuccessful result and exits nonzero`, {
    timeout: 20000,
  }, async (t) => {
    const f = await fixture(t, {
      repairsNeeded: 1,
      escalation: mode === "cancelled",
      ...(mode === "timeout" ? { mode: "verify-timeout" } : {}),
    });
    const modulePath = join(f.base, `${mode}.flow.ts`);
    await writeFile(
      modulePath,
      `import { createVerifyFlow } from ${JSON.stringify(join(repo, "flows/openspec-verify/flow.ts"))};\nimport { SteeringError } from ${JSON.stringify(join(repo, "flows/shared/steering.ts"))};\nconst flow = createVerifyFlow(${mode === "cancelled" ? '{ steering: async () => { throw new SteeringError("cancelled", "fixture cancellation"); } }' : "{}"});\n${mode === "timeout" ? "flow.nodes.verify.timeoutMs = 1000;\n" : ""}export default flow;\n`,
    );
    const result = await runCli(f, modulePath);
    assert.equal(
      result.emitted.outcome,
      mode === "cancelled" ? "cancelled" : "failed",
    );
    assert.equal(result.emitted.repairAttempts, 0);
    assert.notEqual(result.exitCode, 0);
    assert.equal(visits(result.state, "repair").length, 0);
    await assertPersisted(result);
    await f.assertEdits(0);
  });
}

for (const phase of ["verify", "steering", "repair"] as const) {
  test(`actual CLI SIGINT during ${phase} emits one cancelled result and preserves all edits`, {
    timeout: 20000,
  }, async (t) => {
    let resolveReady!: (message: {
      phase: string;
      sessionId?: string;
      cycle: number;
    }) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<{
      phase: string;
      sessionId?: string;
      cycle: number;
    }>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    void ready.catch(() => {});
    const server = createServer((socket) => {
      let message = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        message += chunk;
      });
      socket.on("end", () => {
        try {
          resolveReady(JSON.parse(message));
        } catch (error) {
          rejectReady(error as Error);
        }
      });
      socket.on("error", rejectReady);
    });
    server.on("error", rejectReady);
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
      failureAt: 1,
      escalation: phase === "steering",
      ...(phase !== "steering" ? { mode: `${phase}-interrupt` } : {}),
    });
    let modulePath = flowFile;
    if (phase === "steering") {
      modulePath = join(f.base, "interrupt-steering.flow.ts");
      await writeFile(
        modulePath,
        `import { createConnection } from "node:net";\nimport { createVerifyFlow } from ${JSON.stringify(join(repo, "flows/openspec-verify/flow.ts"))};\nimport { SteeringError } from ${JSON.stringify(join(repo, "flows/shared/steering.ts"))};\nlet calls = 0;\nexport default createVerifyFlow({ steering: async (issues, signal) => {\nif (++calls === 1) return Object.fromEntries(issues.map(issue => [issue.id, "ANSWER " + issue.id + ": permit only " + issue.issue.split("Requested authorization scope: ")[1]]));\nreturn new Promise((_, reject) => {\nsignal.addEventListener("abort", () => reject(new SteeringError("cancelled", "interrupted pending human steering")), { once: true });\nconst socket = createConnection({ host: "127.0.0.1", port: ${address.port} }, () => socket.end(JSON.stringify({ phase: "steering", cycle: 1 }) + "\\n"));\nsocket.on("error", reject);\n});\n} });\n`,
      );
    }
    const edits = phase === "repair" ? 2 : 1;
    const signalWhenReady = ready.then(async (message) => {
      assert.equal(message.phase, phase);
      assert.equal(message.cycle, 1);
      if (phase !== "steering")
        assert.match(message.sessionId ?? "", /^[0-9a-f-]{36}$/);
      await f.assertEdits(edits); // Readiness follows the partial repair write, never a timer guess.
    });
    const result = await runCli(f, modulePath, signalWhenReady);
    assert.equal(result.emitted.outcome, "cancelled", result.stderr);
    assert.equal(result.emitted.repairAttempts, phase === "repair" ? 2 : 1);
    assert.match(
      result.emitted.summary,
      new RegExp(`Interrupted during ${phase}`),
    );
    assert.notEqual(result.exitCode, 0);
    assert.equal(
      visits(result.state, "repair").length,
      1,
      "acpx interruption does not record the active attempt; emitted count includes it",
    );
    assert.equal(
      visits(result.state, "verify").length,
      phase === "verify" ? 1 : 2,
      "no post-interruption verification or retry",
    );
    assert.equal(
      visits(result.state, "assess").length,
      phase === "verify" ? 1 : 2,
    );
    assert.equal(visits(result.state, "success").length, 0);
    await assertPersisted(result);
    await f.assertEdits(edits);
  });
}
