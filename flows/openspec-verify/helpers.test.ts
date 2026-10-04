import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import type { Command } from "../shared/command.js";
import {
  acceptanceSupported,
  assessPrompt,
  authorize,
  currentReport,
  judgePrompt,
  parseAssessment,
  parseRepairReport,
  parseReport,
  preflight,
  type Report,
  repairPrompt,
  type Snapshot,
  snapshot,
  type Target,
  verifyPrompt,
} from "./helpers.js";

export function clearReport(): Report {
  const checked = {
    status: "checked" as const,
    reason: "Inspected current scope",
    evidence: ["implementation.ts:1"],
  };
  return {
    report: "## Verification Report\nAll checks passed. Ready for archive.",
    conclusive: true,
    dimensions: {
      completeness: checked,
      correctness: checked,
      coherence: {
        status: "inapplicable",
        reason: "Schema has no design artifact",
        evidence: [],
      },
    },
    findings: [],
    gates: [
      {
        command: "npm test",
        exitCode: 0,
        result: "All tests passed on current implementation",
      },
    ],
    noApplicableGates: null,
    missingEvidence: [],
  };
}
export async function fixture(t: TestContext) {
  const cwd = await mkdtemp(join(tmpdir(), "verify-helpers-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const changeRoot = join(cwd, "openspec/changes/example");
  await mkdir(changeRoot, { recursive: true });
  const tasks = join(changeRoot, "tasks.md");
  await writeFile(tasks, "- [x] Implement\n");
  const target: Target = {
    cwd,
    changeId: "example",
    changeRoot,
    status: {
      changeRoot,
      planningHome: { kind: "repo", root: cwd },
      actionContext: { mode: "repo-local" },
    },
  };
  const data = {
    changeName: "example",
    changeDir: changeRoot,
    state: "all_done",
    contextFiles: { tasks: [tasks] } as Record<string, string[]>,
    tasks: [{ id: "1", description: "Implement approved change", done: true }],
  };
  const calls: string[][] = [];
  const run: Command = async (args, root) => {
    assert.equal(root, cwd);
    calls.push(args);
    return {
      stdout: JSON.stringify(
        args[0] === "list"
          ? { root: { path: cwd }, changes: [{ name: "example" }] }
          : args[0] === "status"
            ? target.status
            : data,
      ),
      stderr: "",
      exitCode: 0,
    };
  };
  return { cwd, changeRoot, target, data, tasks, calls, run };
}
export const current = (target: Target): Snapshot => ({
  status: target.status,
  instructions: { changeDir: target.changeRoot },
  state: "all_done",
  tasks: [{ id: "1", description: "Approved change", done: true }],
});

test("preflight requires explicit completed local task context; refresh rereads status", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await preflight({ changeId: "example" }, f.cwd, f.run)).changeRoot,
    f.changeRoot,
  );
  const count = f.calls.filter((a) => a[0] === "status").length;
  await snapshot(f.target, f.run);
  assert.equal(f.calls.filter((a) => a[0] === "status").length, count + 1);
  f.data.state = "ready";
  f.data.tasks[0].done = false;
  await assert.rejects(
    preflight({ changeId: "example" }, f.cwd, f.run),
    /Incomplete implementation.*openspec-implement/,
  );
  assert.equal((await snapshot(f.target, f.run)).tasks[0].done, false);
});
test("preflight rejects omitted escaping archived store-backed missing and unusable targets", async (t) => {
  const f = await fixture(t);
  for (const input of [
    undefined,
    {},
    { changeId: "../example" },
    { changeId: "archive/example" },
    { changeId: "example", store: "remote" },
    { changeId: "missing" },
  ])
    await assert.rejects(preflight(input, f.cwd, f.run));
  f.target.status.planningHome = { kind: "store", root: f.cwd };
  await assert.rejects(
    preflight({ changeId: "example" }, f.cwd, f.run),
    /Non-local/,
  );
  f.target.status.planningHome = { kind: "repo", root: f.cwd };
  f.data.contextFiles.tasks = [];
  await assert.rejects(
    preflight({ changeId: "example" }, f.cwd, f.run),
    /tasks artifact/,
  );
  f.data.contextFiles.tasks = [f.tasks];
  f.data.tasks = [];
  await assert.rejects(
    preflight({ changeId: "example" }, f.cwd, f.run),
    /task snapshot/,
  );
  f.data.contextFiles.tasks = [join(f.changeRoot, "missing.md")];
  await assert.rejects(preflight({ changeId: "example" }, f.cwd, f.run));
});
test("verification snapshot rejects array-valued CLI states", async (t) => {
  const f = await fixture(t);
  for (const state of ["blocked", "ready", "all_done"]) {
    const run: Command = async (args, cwd, signal) => {
      const reply = await f.run(args, cwd, signal);
      if (args[0] === "instructions")
        reply.stdout = JSON.stringify({ ...f.data, state: [state] });
      return reply;
    };
    await assert.rejects(
      snapshot(f.target, run),
      /Invalid current verification context/,
    );
  }
});
test("preflight rejects symlinked roots, changes and artifact paths", async (t) => {
  const f = await fixture(t);
  const outside = join(f.cwd, "elsewhere");
  await mkdir(outside);
  await writeFile(join(outside, "tasks.md"), "- [x] done");
  const linked = join(f.changeRoot, "linked.md");
  await symlink(join(outside, "tasks.md"), linked);
  f.data.contextFiles.tasks = [linked];
  await assert.rejects(
    preflight({ changeId: "example" }, f.cwd, f.run),
    /symlinked/,
  );
  await rm(f.changeRoot, { recursive: true });
  await symlink(outside, f.changeRoot);
  await assert.rejects(
    preflight({ changeId: "example" }, f.cwd, f.run),
    /Non-local/,
  );
  await rm(join(f.cwd, "openspec"), { recursive: true });
  await symlink(outside, join(f.cwd, "openspec"));
  await assert.rejects(
    preflight({ changeId: "example" }, f.cwd, f.run),
    /Store-backed/,
  );
});
test("report parser accepts startup prose and fenced JSON without weakening validation", () => {
  const report = clearReport();
  const banner =
    "pi v1.0.0\n---\n## Context\n- AGENTS.md\n---\nNew version available: v1.0.2\n";
  for (const wrap of [
    (json: string) => `${banner}${json}`,
    (json: string) => `\`\`\`json\n${json}\n\`\`\``,
  ]) {
    assert.deepEqual(parseReport(wrap(JSON.stringify(report))), report);
    assert.throws(() =>
      parseReport(wrap(JSON.stringify({ ...report, conclusive: "yes" }))),
    );
    assert.throws(() =>
      parseReport(wrap(JSON.stringify(report).slice(0, -10))),
    );
  }
});
test("report preserves prose and validates all severities, references and dimensions", () => {
  const report = clearReport();
  report.findings = (["CRITICAL", "WARNING", "SUGGESTION"] as const).map(
    (severity, i) => ({
      id: `issue-${i}`,
      severity,
      issue: "Mismatch",
      recommendation: "Fix at specified line",
      evidence: ["implementation.ts:3"],
    }),
  );
  assert.deepEqual(parseReport(JSON.stringify(report)), report);
  for (const mutate of [
    (r: Report) => {
      r.findings.push(r.findings[0]);
    },
    (r: Report) => {
      r.findings[0].evidence = [];
    },
    (r: Report) => {
      r.findings[0].recommendation = "";
    },
    (r: Report) => {
      r.dimensions.completeness.evidence = [];
    },
    (r: Report) => {
      r.dimensions.coherence.reason = "";
    },
    (r: Report) => {
      r.report = "";
    },
  ]) {
    const invalid = structuredClone(report);
    mutate(invalid);
    assert.throws(() => parseReport(JSON.stringify(invalid)));
  }
  for (const raw of [
    "",
    "{}",
    "not JSON",
    JSON.stringify(report).slice(0, -10),
    JSON.stringify({ ...report, conclusive: "yes" }),
    JSON.stringify({ ...report, dimensions: {} }),
  ])
    assert.throws(() => parseReport(raw));
});
test("report rejects non-string dimension and severity enums", () => {
  for (const status of ["missing", "checked", "inapplicable"]) {
    const report = clearReport();
    const dimensions = {
      ...report.dimensions,
      correctness: {
        status: [status],
        reason: "Required check unavailable",
        evidence: [],
      },
    };
    assert.throws(
      () => parseReport(JSON.stringify({ ...report, dimensions })),
      /Invalid verification dimension/,
    );
  }
  for (const severity of ["CRITICAL", "WARNING", "SUGGESTION"]) {
    assert.throws(
      () =>
        parseReport(
          JSON.stringify({
            ...clearReport(),
            findings: [
              {
                id: "issue",
                severity: [severity],
                issue: "Mismatch",
                recommendation: "Fix it",
                evidence: ["code.ts:1"],
              },
            ],
          }),
        ),
      /Invalid finding/,
    );
  }
});
test("acceptance blocks warning prose missing evidence gates dimensions and reopened tasks", async (t) => {
  const f = await fixture(t);
  const context = current(f.target);
  assert.ok(acceptanceSupported(clearReport(), context));
  const suggestion = {
    id: "nice",
    severity: "SUGGESTION" as const,
    issue: "Refactor",
    recommendation: "Optional cleanup",
    evidence: ["code.ts:1"],
  };
  const report: Report = { ...clearReport(), findings: [suggestion] };
  assert.ok(acceptanceSupported(report, context));
  report.findings = [{ ...suggestion, severity: "WARNING" }];
  assert.equal(acceptanceSupported(report, context), false);
  for (const fault of [
    "evidence",
    "dimension",
    "gate",
    "unavailable",
    "no-gates",
    "inconclusive",
    "tasks",
    "blocked",
  ]) {
    const r = clearReport();
    const c = structuredClone(context);
    if (fault === "evidence")
      r.missingEvidence = ["No credentials to run required live check"];
    if (fault === "dimension")
      r.dimensions.correctness = {
        status: "missing",
        reason: "Required check unavailable",
        evidence: [],
      };
    if (fault === "gate") r.gates[0].exitCode = 1;
    if (fault === "unavailable") r.gates[0].exitCode = null;
    if (fault === "no-gates") r.gates = [];
    if (fault === "inconclusive") r.conclusive = false;
    if (fault === "tasks") c.tasks[0].done = false;
    if (fault === "blocked") c.state = "blocked";
    assert.equal(acceptanceSupported(r, c), false, fault);
    if (fault !== "inconclusive")
      assert.ok(
        currentReport(r, c).findings.some((f) => f.severity === "WARNING"),
      );
  }
  assert.ok(
    acceptanceSupported(
      {
        ...clearReport(),
        gates: [],
        noApplicableGates:
          "Documentation-only scope; no executable project gates",
      },
      context,
    ),
  );
});
test("assessment covers only all current blockers and permits scoped new code paths", async (t) => {
  const f = await fixture(t);
  const report = clearReport();
  report.findings = [
    {
      id: "fix",
      severity: "WARNING",
      issue: "Bug",
      recommendation: "Correct it",
      evidence: ["code.ts:1"],
    },
    {
      id: "nice",
      severity: "SUGGESTION",
      issue: "Cleanup",
      recommendation: "Optional",
      evidence: ["code.ts:2"],
    },
  ];
  const resolution = {
    id: "repair",
    findingIds: ["fix"],
    issue: "Bug",
    recommendation: "Add regression test",
    scope: "Fix code and add test",
    paths: ["src/new.test.ts"],
    escalation: false,
    reason: "Approved intent",
  };
  const parse = (resolutions: unknown[]) =>
    parseAssessment(JSON.stringify({ resolutions }), f.target, report);
  assert.equal(
    (await parse([resolution])).resolutions[0].paths[0],
    join(f.cwd, "src/new.test.ts"),
  );
  for (const resolutions of [
    [],
    [resolution, resolution],
    [{ ...resolution, findingIds: [] }],
    [{ ...resolution, findingIds: ["nice"] }],
    [{ ...resolution, findingIds: ["unknown"] }],
    [{ ...resolution, paths: ["../outside.ts"] }],
    [{ ...resolution, issue: "" }],
    [{ ...resolution, reason: "" }],
    [{ ...resolution, paths: [f.tasks] }],
    [{ ...resolution, paths: ["openspec"] }],
    [{ ...resolution, paths: [join(f.cwd, "openspec")] }],
  ])
    await assert.rejects(parse(resolutions));
  const escalated = await parse([
    { ...resolution, paths: ["openspec"], escalation: true },
  ]);
  assert.equal(escalated.resolutions[0].escalation, true);
  assert.equal(escalated.resolutions[0].paths[0], join(f.cwd, "openspec"));
  await symlink(tmpdir(), join(f.cwd, "linked"));
  await assert.rejects(
    parse([{ ...resolution, paths: ["linked/escape.ts"] }]),
    /Symlinked/,
  );
  await assert.rejects(parseAssessment("{", f.target, report));
  await assert.rejects(parseAssessment("{}", f.target, report));
  report.findings.push({ ...report.findings[0], id: "second" });
  await assert.rejects(parse([resolution]), /Incomplete/);
});
test("assessment parser accepts startup prose and fenced JSON while retaining scope validation", async (t) => {
  const f = await fixture(t);
  const report = clearReport();
  report.findings = [
    {
      id: "fix",
      severity: "WARNING",
      issue: "Bug",
      recommendation: "Fix it",
      evidence: ["code.ts:1"],
    },
  ];
  const resolution = {
    id: "repair",
    findingIds: ["fix"],
    issue: "Bug",
    recommendation: "Add regression coverage",
    scope: "Fix approved code",
    paths: ["code.ts"],
    escalation: false,
    reason: "Approved intent",
  };
  for (const wrap of [
    (json: string) => `pi v1.0.0\n---\n## Context\n- AGENTS.md\n---\n${json}`,
    (json: string) => `\`\`\`json\n${json}\n\`\`\``,
  ]) {
    const payload = JSON.stringify({ resolutions: [resolution] });
    assert.deepEqual(await parseAssessment(wrap(payload), f.target, report), {
      resolutions: [{ ...resolution, paths: [join(f.cwd, "code.ts")] }],
    });
    for (const invalid of [
      { resolutions: [] },
      { resolutions: [{ ...resolution, findingIds: ["unknown"] }] },
      { resolutions: [{ ...resolution, paths: ["../outside.ts"] }] },
      { resolutions: [{ ...resolution, paths: [f.tasks] }] },
    ])
      await assert.rejects(
        parseAssessment(wrap(JSON.stringify(invalid)), f.target, report),
      );
    await assert.rejects(
      parseAssessment(wrap(payload.slice(0, -10)), f.target, report),
    );
  }
});
test("repair parser accepts startup prose and fenced JSON while retaining report validation", () => {
  const report = {
    summary: "Fixed approved bug",
    changes: ["code.ts: fix"],
    unresolved: [],
    gates: [{ command: "npm test", exitCode: 0, result: "Passed" }],
  };
  for (const wrap of [
    (json: string) => `pi v1.0.0\n---\n## Context\n- AGENTS.md\n---\n${json}`,
    (json: string) => `\`\`\`json\n${json}\n\`\`\``,
  ]) {
    const payload = JSON.stringify(report);
    assert.deepEqual(parseRepairReport(wrap(payload)), report);
    for (const invalid of [
      { ...report, summary: "" },
      { ...report, changes: "code.ts" },
      { ...report, unresolved: [42] },
      { ...report, gates: [{ ...report.gates[0], exitCode: "0" }] },
    ])
      assert.throws(() => parseRepairReport(wrap(JSON.stringify(invalid))));
    assert.throws(() => parseRepairReport(wrap(payload.slice(0, -10))));
  }
});
test("scoped steering is complete, nonblank and cannot grant unrelated authorization", async (t) => {
  const f = await fixture(t);
  const resolution = {
    id: "choice",
    findingIds: ["fix"],
    issue: "Ambiguity",
    recommendation: "Choose approved behavior",
    scope: "design section 2",
    paths: [f.tasks],
    escalation: true,
    reason: "Design choice",
  };
  const assessment = { resolutions: [resolution] };
  for (const answers of [
    {},
    { choice: " " },
    { choice: "ok", extra: "ok" },
  ] as Record<string, string>[])
    assert.throws(() => authorize(assessment, answers));
  const steering = authorize(assessment, {
    choice: "Authorize only design section 2",
  });
  assert.deepEqual(steering[0], {
    resolution,
    answer: "Authorize only design section 2",
  });
  const classifier = judgePrompt(current(f.target), clearReport(), steering);
  assert.deepEqual(JSON.parse(classifier.split("\n")[1]).steering, steering);
  assert.match(classifier, /ONLY its original issue-associated scope/);
  assert.match(classifier, /does not grant tool permissions/);
  assert.match(classifier, /cannot waive required evidence/);
  assert.throws(
    () =>
      repairPrompt(
        f.target,
        current(f.target),
        clearReport(),
        assessment,
        [],
        1,
      ),
    /Missing scoped/,
  );
  assert.throws(
    () =>
      repairPrompt(
        f.target,
        current(f.target),
        clearReport(),
        assessment,
        [{ resolution, answer: " " }],
        1,
      ),
    /Missing scoped/,
  );
  assert.match(
    repairPrompt(
      f.target,
      current(f.target),
      clearReport(),
      assessment,
      steering,
      1,
    ),
    /Human guidance does not waive evidence/,
  );
});
test("prompts separate read-only checks, assessment and blocking-only repair authority", async (t) => {
  const f = await fixture(t);
  const c = current(f.target);
  const report = clearReport();
  const verify = verifyPrompt(f.target, c, []);
  assert.ok(verify.startsWith("/skill:openspec-verify-change example\n"));
  assert.match(verify, /READ-ONLY/);
  assert.match(verify, /EVERY current contextFiles/);
  assert.match(verify, /never an allowed skip or human waiver/);
  assert.match(
    assessPrompt(f.target, c, report, []),
    /Any mixed batch waits for ALL/,
  );
  for (const consequential of [
    "Ambiguous requirements",
    "design changes",
    "destructive actions",
    "missing external access",
  ])
    assert.ok(assessPrompt(f.target, c, report, []).includes(consequential));
  const repair = repairPrompt(f.target, c, report, { resolutions: [] }, [], 1);
  for (const term of [
    "No independent SUGGESTION cleanup",
    "no nested implement flow",
    "Run ALL applicable project gates",
    "every normal return",
    "Preserve unrelated dirty edits",
    "No sync, archive, commit, stash, reset, rollback",
    "Do not autonomously rewrite requirements/design",
  ])
    assert.ok(repair.includes(term), term);
  assert.deepEqual(
    parseRepairReport(
      '{"summary":"Nothing changed; blockers remain","changes":[],"unresolved":["Needs check"],"gates":[]}',
    ).unresolved,
    ["Needs check"],
  );
  assert.throws(() => parseRepairReport("{}"));
});
