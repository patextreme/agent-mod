import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type TestContext, test } from "node:test";
import { type FlowNodeContext, FlowRunner } from "acpx/flows";
import {
  type Command,
  parseAssessment,
  preflight,
  type Target,
  updatePrompt,
  validate,
} from "./groom.js";
import { createGroomFlow, type GroomResult } from "./openspec-groom.flow.js";

async function fixture(t: TestContext) {
  const cwd = await mkdtemp(join(tmpdir(), "groom-unit-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const changeRoot = join(cwd, "openspec/changes/example");
  await mkdir(changeRoot, { recursive: true });
  const artifact = join(changeRoot, "custom.md");
  await writeFile(artifact, "dirty existing content\n");
  const target: Target = {
    cwd,
    changeId: "example",
    changeRoot,
    artifacts: [artifact],
  };
  const status = {
    changeRoot,
    planningHome: { kind: "repo", root: cwd },
    actionContext: { mode: "repo-local" },
    artifactPaths: { arbitrary: { existingOutputPaths: [artifact] } },
  };
  const calls: string[][] = [];
  const command: Command = async (args) => {
    calls.push(args);
    return {
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify(
        args[0] === "list"
          ? { root: { path: cwd }, changes: [{ name: "example" }] }
          : status,
      ),
    };
  };
  return { cwd, artifact, target, status, command, calls };
}
function assessed(target: Target, escalation = false, extra = {}) {
  return JSON.stringify({
    conclusive: true,
    missingArtifacts: [],
    resolutions: [
      {
        id: "issue-1",
        issue: "Existing contradiction",
        recommendation: "Preserve established intent",
        escalation,
        paths: target.artifacts,
      },
    ],
    ...extra,
  });
}
test("preflight resolves custom-schema artifacts and safe targeted arguments", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(
    await preflight({ changeId: "example" }, f.cwd, f.command),
    f.target,
  );
  assert.deepEqual(f.calls, [
    ["list", "--json"],
    ["status", "--change", "example", "--json"],
  ]);
});
test("preflight rejects malformed inputs without commands or edits", async (t) => {
  const f = await fixture(t);
  for (const input of [
    null,
    {},
    { changeId: "../example" },
    { changeId: "archive/example" },
    { changeId: "example;rm" },
    { changeId: "example", store: "other" },
  ])
    await assert.rejects(preflight(input, f.cwd, f.command));
  assert.equal(f.calls.length, 0);
  assert.equal(await readFile(f.artifact, "utf8"), "dirty existing content\n");
});
test("missing and archived membership are rejected before status", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const command: Command = async () => {
    calls++;
    return {
      stdout: JSON.stringify({ root: { path: f.cwd }, changes: [] }),
      stderr: "",
      exitCode: 0,
    };
  };
  for (const changeId of ["missing", "archived"])
    await assert.rejects(preflight({ changeId }, f.cwd, command), /not active/);
  assert.equal(calls, 2);
});
test("store-backed status, escaping paths, and symlinks are rejected without edits", async (t) => {
  const f = await fixture(t);
  const outside = join(f.cwd, "outside.md");
  await writeFile(outside, "untouched");
  const link = join(f.target.changeRoot, "link.md");
  await symlink(outside, link);
  for (const status of [
    { ...f.status, planningHome: { kind: "store", root: f.cwd } },
    { ...f.status, changeRoot: f.cwd },
    {
      ...f.status,
      artifactPaths: { custom: { existingOutputPaths: [outside] } },
    },
    { ...f.status, artifactPaths: { custom: { existingOutputPaths: [link] } } },
    { ...f.status, artifactPaths: { custom: { existingOutputPaths: [] } } },
  ]) {
    const command: Command = async (args, cwd, signal) =>
      args[0] === "list"
        ? f.command(args, cwd, signal)
        : { stdout: JSON.stringify(status), stderr: "", exitCode: 0 };
    await assert.rejects(preflight({ changeId: "example" }, f.cwd, command));
  }
  assert.equal(await readFile(outside, "utf8"), "untouched");
  assert.equal(await readFile(f.artifact, "utf8"), "dirty existing content\n");
});
test("strict validation separates repairable errors from operational and malformed failures", async (t) => {
  const f = await fixture(t);
  const issues = [
    { level: "ERROR", message: "Missing required scenario in existing file" },
  ];
  for (const valid of [true, false]) {
    const command: Command = async (args) => {
      assert.deepEqual(args, [
        "validate",
        "example",
        "--type",
        "change",
        "--strict",
        "--json",
        "--no-interactive",
      ]);
      return {
        stdout: JSON.stringify({
          items: [
            {
              id: "example",
              type: "change",
              valid,
              issues: valid ? [] : issues,
            },
          ],
        }),
        stderr: "",
        exitCode: valid ? 0 : 1,
      };
    };
    assert.equal(
      (await validate(f.target, command)).route,
      valid ? "valid" : "invalid",
    );
  }
  for (const stdout of [
    "not JSON",
    "{}",
    JSON.stringify({
      items: [{ id: "other", type: "change", valid: true, issues: [] }],
    }),
    JSON.stringify({
      items: [{ id: "example", type: "change", valid: false, issues: ["bad"] }],
    }),
  ])
    await assert.rejects(
      validate(f.target, async () => ({ stdout, stderr: "", exitCode: 1 })),
    );
  await assert.rejects(
    validate(f.target, async () => ({
      stdout: JSON.stringify({
        items: [{ id: "example", type: "change", valid: false, issues }],
      }),
      stderr: "failure",
      exitCode: 2,
    })),
    /Operational/,
  );
});
test("assessment validates scope, escalation identities, missing artifacts and inconclusive output", async (t) => {
  const f = await fixture(t);
  assert.equal(
    parseAssessment(assessed(f.target), f.target).route,
    "autonomous",
  );
  assert.equal(
    parseAssessment(assessed(f.target, true), f.target).route,
    "steering",
  );
  assert.equal(
    parseAssessment(assessed(f.target, false, { conclusive: false }), f.target)
      .route,
    "inconclusive",
  );
  assert.equal(
    parseAssessment(
      assessed(f.target, false, { missingArtifacts: ["design.md"] }),
      f.target,
    ).route,
    "missing",
  );
  const mixed = JSON.parse(assessed(f.target, true));
  mixed.resolutions.push({
    ...mixed.resolutions[0],
    id: "mechanical",
    escalation: false,
  });
  assert.equal(
    parseAssessment(JSON.stringify(mixed), f.target).resolutions.length,
    2,
  );
  for (const patch of [
    { id: "issue-1", paths: [f.cwd] },
    { id: "issue-1", escalation: "false" },
    { id: "../unsafe" },
    { id: "issue-1", recommendation: " " },
  ]) {
    const bad = JSON.parse(assessed(f.target));
    Object.assign(bad.resolutions[0], patch);
    await assert.rejects(async () =>
      parseAssessment(JSON.stringify(bad), f.target),
    );
  }
  mixed.resolutions[1].id = "issue-1";
  assert.throws(() => parseAssessment(JSON.stringify(mixed), f.target));
  assert.throws(() => parseAssessment("{}", f.target));
});
test("update authorization refuses incomplete steering and missing artifact creation", async (t) => {
  const f = await fixture(t);
  const assessment = parseAssessment(assessed(f.target, true), f.target);
  for (const answers of [{}, { "issue-1": " " }, { other: "yes" }] as Record<
    string,
    string
  >[])
    assert.throws(
      () => updatePrompt(f.target, assessment, answers),
      /Missing steering/,
    );
  const prompt = updatePrompt(f.target, assessment, {
    "issue-1": "keep existing product intent",
  });
  assert.ok(prompt.startsWith("/skill:openspec-update-change example"));
  assert.match(prompt, /current cycle only/);
  assert.match(prompt, /keep existing product intent/);
  assert.throws(() =>
    updatePrompt(
      f.target,
      { ...assessment, route: "missing" },
      { "issue-1": "yes" },
    ),
  );
});

// Execute the real graph with model nodes replaced by deterministic compute nodes.
async function graph(
  t: TestContext,
  kinds: ("structural" | "critical")[],
  finalClear: boolean,
  failure?: string,
) {
  const f = await fixture(t);
  const emitted: GroomResult[] = [];
  let validationVisit = 0;
  const flow = createGroomFlow({
    cwd: f.cwd,
    command: async (args, cwd, signal) => {
      if (args[0] !== "validate") return f.command(args, cwd, signal);
      const invalid = kinds[validationVisit++] === "structural";
      return {
        stdout: JSON.stringify({
          items: [
            {
              id: "example",
              type: "change",
              valid: !invalid,
              issues: invalid
                ? [{ level: "ERROR", message: "mechanical" }]
                : [],
            },
          ],
        }),
        stderr: "",
        exitCode: invalid ? 1 : 0,
      };
    },
    emit: (result) => emitted.push(result),
  });
  let dispatches = 0;
  flow.nodes.review = {
    nodeType: "compute",
    run: () =>
      finalClear && dispatches >= kinds.length
        ? "Major only; no Critical findings"
        : "Critical finding",
  };
  flow.nodes.classify = {
    nodeType: "compute",
    run: () => ({
      route: finalClear && dispatches >= kinds.length ? "clear" : "critical",
    }),
  };
  flow.nodes.assess = {
    nodeType: "compute",
    run: (c: FlowNodeContext) =>
      parseAssessment(
        assessed(c.outputs.preflight as Target),
        c.outputs.preflight as Target,
      ),
  };
  flow.nodes.update = {
    nodeType: "compute",
    run: () => {
      dispatches++;
      if (failure) throw new Error(failure);
      return "updated";
    },
  };
  const runner = new FlowRunner({
    resolveAgent: () => ({
      agentName: "unused",
      agentCommand: "false",
      cwd: f.cwd,
    }),
    permissionMode: "approve-reads",
    outputRoot: join(f.cwd, "runs"),
  });
  const execution = runner.run(flow, { changeId: "example" });
  if (finalClear && !failure) await execution;
  else await assert.rejects(execution, /Grooming unsuccessful/);
  return { result: emitted[0], dispatches };
}
test("shared mixed budget verifies and succeeds after updater ten", async (t) => {
  const value = await graph(
    t,
    ["structural", "structural", ...Array<"critical">(8).fill("critical")],
    true,
  );
  assert.equal(value.dispatches, 10);
  assert.equal(value.result.outcome, "success");
  assert.equal(value.result.updateAttempts, 10);
  assert.equal(value.result.remaining, "Major only; no Critical findings");
});
test("repeated Critical findings and mixed exhaustion never dispatch update eleven", async (t) => {
  for (const kinds of [
    Array<"critical">(11).fill("critical"),
    ["structural", "structural", ...Array<"critical">(9).fill("critical")] as (
      | "structural"
      | "critical"
    )[],
  ]) {
    const value = await graph(t, kinds, false);
    assert.equal(value.dispatches, 10);
    assert.equal(value.result.outcome, "limit_reached");
    assert.equal(value.result.updateAttempts, 10);
  }
});
test("failed updater counts dispatch and terminates without retry", async (t) => {
  const value = await graph(t, ["critical"], false, "fixture updater failure");
  assert.equal(value.dispatches, 1);
  assert.equal(value.result.updateAttempts, 1);
  assert.equal(value.result.outcome, "failed");
  assert.match(value.result.summary, /fixture updater failure/);
});
test("project update skill is discoverable and preserves ordinary confirmations", async () => {
  const cwd = process.cwd();
  const { loadSkills } = await import("@earendil-works/pi-coding-agent");
  const skills = loadSkills({
    cwd,
    agentDir: join(homedir(), ".pi/agent"),
    skillPaths: [],
    includeDefaults: true,
  });
  const expected = resolve(cwd, ".pi/skills/openspec-update-change/SKILL.md");
  assert.equal(
    skills.skills.find((skill) => skill.name === "openspec-update-change")
      ?.filePath,
    expected,
  );
  const pinned = loadSkills({
    cwd,
    agentDir: join(homedir(), ".pi/agent"),
    skillPaths: [resolve(cwd, "skills/openspec-review/SKILL.md"), expected],
    includeDefaults: false,
  });
  assert.equal(
    pinned.skills.find((skill) => skill.name === "openspec-update-change")
      ?.filePath,
    expected,
  );
  assert.equal(pinned.skills.length, 2);
  const skill = await readFile(expected, "utf8");
  assert.match(
    skill,
    /Without valid explicit authorization, retain every ordinary confirmation/,
  );
  assert.match(skill, /does not override tool permissions/);
  assert.match(skill, /structural or Critical repairs/);
});
