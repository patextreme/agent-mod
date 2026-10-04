import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import type { Command } from "../shared/command.js";
import {
  applyPrompt,
  authorize,
  completionSupported,
  judgePrompt,
  parseReport,
  preflight,
  type Report,
  type Snapshot,
  snapshot,
  type Target,
} from "./helpers.js";

async function fixture(t: TestContext) {
  const cwd = await mkdtemp(join(tmpdir(), "implement-context-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const changeRoot = join(cwd, "openspec/changes/example");
  await mkdir(changeRoot, { recursive: true });
  const file = join(changeRoot, "tasks.md");
  await writeFile(file, "# Tasks");
  const status = {
    changeRoot,
    planningHome: { kind: "repo", root: cwd },
    actionContext: {
      mode: "repo-local",
      allowedEditRoots: [cwd],
      constraints: ["Only approved scope"],
    },
    artifactPaths: {},
  };
  const data = {
    changeName: "example",
    changeDir: changeRoot,
    state: "ready",
    contextFiles: { tasks: [file] },
    tasks: [{ id: "1", description: "Implement", done: false }],
    context: "Required project context",
    operationGuidance: ["Advisory"],
    instruction: "Read all files",
  };
  const command: Command = async (args) => ({
    stdout: JSON.stringify(
      args[0] === "list"
        ? { root: { path: cwd }, changes: [{ name: "example" }] }
        : args[0] === "status"
          ? status
          : data,
    ),
    stderr: "",
    exitCode: 0,
  });
  const target = await preflight({ changeId: "example" }, cwd, command);
  return { cwd, changeRoot, file, status, data, command, target };
}
const current: Snapshot = {
  state: "all_done",
  tasks: [{ id: "1", description: "Implement", done: true }],
  instructions: {},
};
const report: Report = {
  summary: "Implemented all tasks",
  completedTasks: ["1"],
  remainingTasks: [],
  blockers: [],
  gates: [{ command: "npm test", exitCode: 0, afterEdits: true, attempt: 0 }],
  noApplicableGates: null,
  delegatedGroups: [],
};
const parse = (value: unknown, attempt = 0) =>
  parseReport(JSON.stringify(value), attempt);

test("implement context preserves blocked, ready, all_done and required guidance", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(f.target.status, f.status);
  for (const state of ["blocked", "ready", "all_done"]) {
    f.data.state = state;
    f.data.tasks[0].done = state === "all_done";
    const result = await snapshot(f.target, f.command);
    assert.equal(result.state, state);
    assert.deepEqual(result.instructions, f.data);
  }
});

test("implement preflight rejects invalid archived store-backed and escaping targets", async (t) => {
  const f = await fixture(t);
  for (const input of [
    {},
    { changeId: "../example" },
    { changeId: "archive/example" },
    { changeId: "archived" },
    { changeId: "example", store: "x" },
  ])
    await assert.rejects(preflight(input, f.cwd, f.command));
  f.status.planningHome.kind = "store";
  await assert.rejects(preflight({ changeId: "example" }, f.cwd, f.command));
  f.status.planningHome.kind = "repo";
  f.status.changeRoot = f.cwd;
  await assert.rejects(preflight({ changeId: "example" }, f.cwd, f.command));
  f.status.changeRoot = f.changeRoot;
  await rm(f.changeRoot, { recursive: true });
  const other = join(f.cwd, "outside");
  await mkdir(other);
  await symlink(other, f.changeRoot);
  await assert.rejects(preflight({ changeId: "example" }, f.cwd, f.command));
});

test("snapshot rejects escaping/symlinked paths and malformed task or CLI state", async (t) => {
  const f = await fixture(t);
  for (const patch of [
    { changeName: "other" },
    { changeDir: f.cwd },
    { state: "unknown" },
    ...["blocked", "ready", "all_done"].map((state) => ({ state: [state] })),
    { contextFiles: { tasks: [join(f.cwd, "outside")] } },
    { tasks: [{ id: "1", done: "yes", description: "Implement" }] },
    { tasks: [f.data.tasks[0], f.data.tasks[0]] },
    { state: "all_done" },
  ]) {
    const command: Command = async () => ({
      stdout: JSON.stringify({ ...f.data, ...patch }),
      stderr: "",
      exitCode: 0,
    });
    await assert.rejects(snapshot(f.target, command));
  }
  await rm(f.file);
  const other = join(f.cwd, "outside");
  await writeFile(other, "outside");
  await symlink(other, f.file);
  await assert.rejects(snapshot(f.target, f.command));
});

test("snapshot propagates command failure and forwards exact target and signal", async (t) => {
  const f = await fixture(t);
  const signal = new AbortController().signal;
  await snapshot(
    f.target,
    async (args, cwd, forwarded) => {
      assert.deepEqual(args, [
        "instructions",
        "apply",
        "--change",
        "example",
        "--json",
      ]);
      assert.equal(cwd, f.cwd);
      assert.equal(forwarded, signal);
      return f.command(args, cwd, forwarded);
    },
    signal,
  );
  await assert.rejects(
    snapshot(f.target, async () => ({
      stdout: "{}",
      stderr: "failure",
      exitCode: 2,
    })),
    /failure/,
  );
});

test("report parser accepts usable evidence and scope-based no-gate justification", () => {
  assert.deepEqual(parse(report), report);
  const noGates = parse({
    ...report,
    gates: [],
    noApplicableGates:
      "Documentation-only scope; project defines no documentation gates",
  });
  assert.equal(completionSupported(current, noGates, 0), true);
});

test("report parser accepts startup prose and fenced JSON without weakening validation", () => {
  const banner =
    "pi v1.0.0\n---\n## Context\n- AGENTS.md\n---\nNew version available: v1.0.2\n";
  for (const wrap of [
    (json: string) => `${banner}${json}`,
    (json: string) => `\`\`\`json\n${json}\n\`\`\``,
  ]) {
    assert.deepEqual(parseReport(wrap(JSON.stringify(report)), 0), report);
    assert.throws(() =>
      parseReport(wrap(JSON.stringify({ ...report, summary: " " })), 0),
    );
    assert.throws(() =>
      parseReport(wrap(JSON.stringify(report).slice(0, -10)), 0),
    );
  }
});

test("malformed reports cannot produce steering or evidence", () => {
  for (const value of [
    null,
    {},
    { ...report, summary: " " },
    { ...report, gates: [{}] },
    { ...report, noApplicableGates: "" },
    { ...report, completedTasks: "1" },
    { ...report, blockers: [{ id: "x", escalation: true }] },
    { ...report, gates: [{ ...report.gates[0], attempt: 1 }] },
    { ...report, gates: [{ ...report.gates[0], exitCode: "0" }] },
  ])
    assert.throws(() => parse(value));
  assert.throws(() => parseReport("not json", 0));
  const blocker = {
    id: "x",
    issue: "Decision",
    recommendation: "Choose",
    escalation: true,
    scope: "Edit design section 2",
  };
  assert.throws(() => parse({ ...report, blockers: [blocker, blocker] }));
});

test("missing stale failing and pre-edit evidence cannot support completion", () => {
  for (const value of [
    { ...report, gates: [] },
    { ...report, gates: [{ ...report.gates[0], exitCode: 1 }] },
    { ...report, gates: [{ ...report.gates[0], afterEdits: false }] },
    { ...report, remainingTasks: ["1"] },
  ])
    assert.equal(completionSupported(current, parse(value), 0), false);
  assert.equal(completionSupported(current, report, 1), false);
  assert.equal(
    completionSupported({ ...current, state: "blocked" }, report, 0),
    false,
  );
  assert.equal(
    completionSupported(
      { ...current, tasks: [{ ...current.tasks[0], done: false }] },
      report,
      0,
    ),
    false,
  );
});

test("steering packets require exact complete answers and preserve authorization scope", () => {
  const blocker = {
    id: "cycle-1",
    issue: "Ambiguity",
    recommendation: "Adjust plan",
    escalation: true,
    scope: "Design section 2 only",
  };
  const mixed = parse({
    ...report,
    blockers: [blocker, { ...blocker, id: "repair", escalation: false }],
  });
  assert.deepEqual(
    authorize(mixed, { "cycle-1": "Permit the scoped plan edit" }),
    [{ blocker, answer: "Permit the scoped plan edit" }],
  );
  for (const answers of [
    {},
    { "cycle-1": " " },
    { "cycle-1": "yes", extra: "yes" },
    { repair: "yes" },
  ] as Record<string, string>[])
    assert.throws(() => authorize(mixed, answers));
});

test("initial and repair prompts select change, honor context, delegation ownership and initially completed tasks", async (t) => {
  const f = await fixture(t);
  const snap = await snapshot(f.target, f.command);
  for (const attempt of [0, 1]) {
    const prompt = applyPrompt(
      f.target,
      snap,
      attempt,
      attempt ? report : null,
      [],
    );
    for (const text of [
      "/skill:openspec-apply-change example",
      "EVERY contextFiles",
      "do not bypass blocked",
      "Required project context",
      "Advisory",
      "multiple substantive task groups",
      "single substantive group need not delegate",
      "explicit ownership boundaries",
      "sequence dependent groups",
      "Parent owns task checklist",
      "waits for all dispatched",
      "initially all_done",
      "instead of waiting for inner interaction",
      "ALL applicable current project gates",
      `"attempt":${attempt}`,
      "No commit",
      "independent implementation verification",
    ])
      assert.ok(prompt.includes(text), text);
  }
});

test("repair prompt carries accumulated issue-scoped answers without broadening consent", async (t) => {
  const f = await fixture(t);
  const steering = [1, 2].map((n) => ({
    blocker: {
      id: `cycle-${n}`,
      issue: `Issue ${n}`,
      recommendation: "Update",
      escalation: true,
      scope: `section ${n}`,
    },
    answer: `Authorize section ${n} only`,
  }));
  const prompt = applyPrompt(f.target, current, 2, report, steering);
  for (const item of steering) assert.ok(prompt.includes(JSON.stringify(item)));
  assert.ok(
    prompt.includes(
      "A plan edit is authorized only if the answer explicitly permits",
    ),
  );
  assert.ok(prompt.includes("does not authorize destructive actions"));
  const question = judgePrompt(current, report, 2);
  assert.ok(question.includes("escalation_required"));
  assert.ok(
    question.includes("not merely the presence of any passing command"),
  );
  assert.ok(question.includes("no verify skill"));
  assert.throws(() =>
    applyPrompt(
      { ...f.target, changeRoot: f.cwd } as Target,
      current,
      0,
      null,
      [],
    ),
  );
});

test("README documents tested invocation, report fields and authority boundaries", async () => {
  const docs = await readFile("README.md", "utf8");
  assert.ok(
    docs.includes(
      'acpx flow run ./flows/openspec-implement/index.ts --input-json \'{"changeId":"example-change"}\'',
    ),
  );
  assert.ok(docs.includes("acpx flow run ./flows/openspec-groom/index.ts"));
  assert.ok(!docs.includes("openspec-groom.flow.ts"));
  for (const field of Object.keys(report))
    assert.ok(docs.includes(`\`${field}\``), field);
  for (const phrase of [
    "ten repair dispatches",
    "including failed dispatches",
    "Initially complete checkboxes still require gates",
    "parent owns checklist consolidation",
    "explicitly authorizing those plan edits",
    "not an independent implementation verification review",
    "no additional report files",
    "stdin and stderr must be TTYs",
    "fresh zero-repair budget",
  ])
    assert.ok(docs.includes(phrase), phrase);
});
