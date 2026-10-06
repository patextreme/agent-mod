import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  archive,
  archiveTarget,
  assessPrompt,
  currentContents,
  fingerprint,
  parseAssessment,
  parseWorker,
  preflight,
  prepare,
  recheck,
  syncPrompt,
} from "./helpers.js";
import { accepted, delta, fixture, merged, original } from "./test-fixture.js";

test("explicit local target rejects malformed, inactive, archived, store and escaping scopes without writes", async (t) => {
  const f = await fixture(t);
  for (const input of [
    null,
    [],
    {},
    { changeId: "" },
    { changeId: "../fixture-change" },
    { changeId: f.id, store: "other" },
    { changeId: f.id, extra: true },
  ])
    await assert.rejects(preflight(input, f.cwd, f.command));
  assert.equal(f.calls.length, 0);
  f.listing.changes = [];
  await assert.rejects(
    preflight({ changeId: f.id }, f.cwd, f.command),
    /not active/,
  );
  f.listing.changes = [{ name: f.id }];
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  for (const status of [
    { ...f.status, planningHome: { ...f.status.planningHome, kind: "store" } },
    {
      ...f.status,
      planningHome: { ...f.status.planningHome, changesDir: f.cwd },
    },
    { ...f.status, changeRoot: f.cwd },
    { ...f.status, actionContext: { mode: "store-backed" } },
  ]) {
    await assert.rejects(
      preflight({ changeId: f.id }, f.cwd, async (args, cwd, signal) =>
        args[0] === "status"
          ? { stdout: JSON.stringify(status), stderr: "", exitCode: 0 }
          : f.command(args, cwd, signal),
      ),
    );
  }
  assert.equal(target.cwd, f.cwd);
  assert.equal(await readFile(f.mainPath, "utf8"), original);
  await f.unchanged();
});
for (const component of ["openspec", "changes", "change"] as const)
  test(`reject symlinked ${component} ancestors`, async (t) => {
    const f = await fixture(t);
    const path =
      component === "change"
        ? f.changeRoot
        : join(
            f.cwd,
            "openspec",
            ...(component === "changes" ? ["changes"] : []),
          );
    await rm(path, { recursive: true });
    await mkdir(join(f.base, "outside"));
    await symlink(join(f.base, "outside"), path);
    await assert.rejects(preflight({ changeId: f.id }, f.cwd, f.command));
  });
test("complete nested selection captures new absence and dirty baseline and operation identities", async (t) => {
  const f = await fixture(t);
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  const inputs = await prepare(target, f.command);
  assert.deepEqual(
    inputs.capabilities.map((c) => c.capability),
    [f.cap, "new-capability"],
  );
  assert.equal(inputs.capabilities[0].baseline, original);
  assert.equal(inputs.capabilities[1].baseline, null);
  assert.deepEqual(
    inputs.capabilities[0].operations.map((o) => o.id),
    [
      "ADDED:Fresh",
      "MODIFIED:Login",
      "REMOVED:Legacy",
      "RENAMED:Old name->New name",
    ],
  );
  assert.match(inputs.metadata ?? "", /retire_capabilities: true/);
  assert.equal(f.calls.filter((c) => c[0] === "instructions").length, 1);
  const prompt = syncPrompt(target, inputs);
  for (const term of [
    "partial MODIFIED",
    "unaffected scenarios",
    "existing Purpose",
    "TBD placeholder",
    "idempotent",
    "explicit capability-retirement",
    "Content rules",
    "No human prompts",
    "permission bypass",
    "not OS isolation",
    "Only selected mainPath",
  ])
    assert.ok(prompt.includes(term), term);
  assert.ok(!prompt.includes("/skill:"));
  await f.apply(inputs);
  const current = await currentContents(target, inputs);
  const assess = assessPrompt(target, inputs, current);
  assert.ok(!assess.includes(f.sync.summary));
  assert.match(assess, /READ-ONLY/);
  assert.ok(assess.includes(original.replaceAll("\n", "\\n")));
  assert.equal(current[f.cap], merged);
  parseAssessment(JSON.stringify(accepted(inputs)), inputs);
});
for (const kind of [
  "delta",
  "delta-ancestor",
  "main",
  "main-ancestor",
  "dangling-main",
  "escape",
  "duplicate",
] as const)
  test(`unsafe ${kind} selection blocks before instructions`, async (t) => {
    const f = await fixture(t);
    const target = await preflight({ changeId: f.id }, f.cwd, f.command);
    if (kind === "escape")
      f.status.artifactPaths.specs.existingOutputPaths = [
        join(f.cwd, "dirty.txt"),
      ];
    else if (kind === "duplicate")
      f.status.artifactPaths.specs.existingOutputPaths.push(f.deltaPath);
    else {
      const path = kind.startsWith("delta")
        ? kind === "delta"
          ? f.deltaPath
          : join(f.changeRoot, "specs/identity")
        : kind === "main-ancestor"
          ? join(f.cwd, "openspec/specs/identity")
          : f.mainPath;
      await rm(path, { recursive: true });
      await symlink(
        kind === "dangling-main" ? join(f.base, "missing") : f.cwd,
        path,
      );
    }
    target.status = f.status;
    await assert.rejects(prepare(target, f.command));
    assert.equal(f.calls.filter((c) => c[0] === "instructions").length, 0);
  });
test("specs snapshot command failure, invalid JSON/shape/rules stop; omitted rules valid", async (t) => {
  const f = await fixture(t);
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  for (const reply of [
    { stdout: "{}", stderr: "unavailable", exitCode: 2 },
    { stdout: "not JSON", stderr: "", exitCode: 0 },
    ...[
      {},
      [],
      { ...f.instructions, artifactId: "tasks" },
      { ...f.instructions, rules: "unsafe" },
      { ...f.instructions, instruction: " " },
    ].map((data) => ({
      stdout: JSON.stringify(data),
      stderr: "",
      exitCode: 0,
    })),
  ])
    await assert.rejects(prepare(target, async () => reply));
  delete f.instructions.rules;
  assert.deepEqual((await prepare(target, f.command)).rules, []);
  assert.equal(await readFile(f.mainPath, "utf8"), original);
});
test("no delta including absent specs entry never fetches instructions", async (t) => {
  const f = await fixture(t, { noDelta: true });
  for (const status of [
    f.status,
    { ...f.status, artifactPaths: {} },
    { ...f.status, artifactPaths: undefined },
  ]) {
    const target = await preflight(
      { changeId: f.id },
      f.cwd,
      async (args, cwd, signal) =>
        args[0] === "status"
          ? { stdout: JSON.stringify(status), stderr: "", exitCode: 0 }
          : f.command(args, cwd, signal),
    );
    assert.deepEqual(
      (await prepare(target, async () => assert.fail("No specs lookup")))
        .capabilities,
      [],
    );
  }
});
test("worker contracts reject malformed/contradictory claims; ambiguity is structured failure", () => {
  for (const value of [
    "not JSON",
    "[]",
    JSON.stringify({
      outcome: "success",
      summary: "ok",
      issues: ["ambiguous"],
      placeholders: [],
    }),
    JSON.stringify({
      outcome: "failed",
      summary: "bad",
      issues: [],
      placeholders: [],
    }),
  ])
    assert.throws(() => parseWorker(value));
  assert.equal(
    parseWorker(
      '```json\n{"outcome":"failed","summary":"Ambiguous","issues":["unclear intent"],"placeholders":[]}\n```',
    ).outcome,
    "failed",
  );
});
test("strict capability/operation coverage and evidence reject unsupported acceptance", async (t) => {
  const f = await fixture(t);
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  const inputs = await prepare(target, f.command);
  const mutations = [
    (r: ReturnType<typeof accepted>) => r.coverage.pop(),
    (r: ReturnType<typeof accepted>) => r.coverage.push(r.coverage[0]),
    (r: ReturnType<typeof accepted>) => {
      r.coverage[0].capability = "extra";
    },
    (r: ReturnType<typeof accepted>) => r.coverage[0].operations.pop(),
    (r: ReturnType<typeof accepted>) =>
      r.coverage[0].operations.push(r.coverage[0].operations[0]),
    (r: ReturnType<typeof accepted>) => {
      r.coverage[0].operations[0].evidence = [];
    },
    ...[
      "purposeEvidence",
      "structureEvidence",
      "preservationEvidence",
      "rulesEvidence",
      "retirementEvidence",
    ].map((key) => (r: ReturnType<typeof accepted>) => {
      (r.coverage[0] as unknown as Record<string, unknown>)[key] = [];
    }),
    (r: ReturnType<typeof accepted>) => {
      r.coverage[0].verdict = "mismatch";
    },
    (r: ReturnType<typeof accepted>) =>
      r.coverage[0].discrepancies.push("unrelated loss"),
    (r: ReturnType<typeof accepted>) => r.issues.push("missing input"),
    (r: ReturnType<typeof accepted>) => {
      r.coverage[0].operations[0].verdict = "inconclusive";
    },
  ];
  for (const mutation of mutations) {
    const report = accepted(inputs);
    mutation(report);
    assert.throws(() => parseAssessment(JSON.stringify(report), inputs));
  }
  for (const raw of ["not JSON", "[]", "{}", JSON.stringify(f.sync)])
    assert.throws(() => parseAssessment(raw, inputs));
  for (const verdict of ["mismatch", "inconclusive"] as const) {
    const report = accepted(inputs);
    report.verdict = verdict;
    report.coverage[0].verdict = verdict;
    report.issues = ["not conclusive"];
    assert.equal(
      parseAssessment(JSON.stringify(report), inputs).verdict,
      verdict,
    );
  }
});
for (const drift of [
  "delta",
  "main",
  "selection",
  "metadata",
  "scope",
  "no-delta-to-delta",
] as const)
  test(`fingerprint rejects ${drift} drift without another instruction snapshot`, async (t) => {
    const f = await fixture(t, { noDelta: drift === "no-delta-to-delta" });
    const target = await preflight({ changeId: f.id }, f.cwd, f.command);
    const inputs = await prepare(target, f.command);
    const current = await currentContents(target, inputs);
    const hash = fingerprint(target, inputs, current);
    await recheck(target, inputs, hash, f.command);
    if (drift === "delta" || drift === "main")
      await writeFile(
        drift === "delta" ? f.deltaPath : f.mainPath,
        (drift === "delta" ? inputs.capabilities[0].delta : original) +
          "\nDRIFT",
      );
    if (drift === "selection")
      f.status.artifactPaths.specs.existingOutputPaths.pop();
    if (drift === "metadata")
      await writeFile(
        join(f.changeRoot, ".openspec.yaml"),
        "retire_capabilities: false\n",
      );
    if (drift === "scope") f.status.planningHome.changesDir = f.cwd;
    if (drift === "no-delta-to-delta") {
      await mkdir(join(f.changeRoot, "specs/new-capability"), {
        recursive: true,
      });
      await writeFile(f.freshPath, f.freshDelta);
      f.status.artifactPaths.specs.existingOutputPaths = [f.freshPath];
    }
    await assert.rejects(recheck(target, inputs, hash, f.command));
    assert.equal(
      f.calls.filter((c) => c[0] === "instructions").length,
      inputs.capabilities.length ? 1 : 0,
    );
  });
for (const collision of ["file", "directory", "dangling"] as const)
  test(`archive collision ${collision} is never overwritten`, async (t) => {
    const f = await fixture(t);
    const target = await preflight({ changeId: f.id }, f.cwd, f.command);
    const destination = join(f.changesDir, "archive/2026-10-05-fixture-change");
    await mkdir(join(f.changesDir, "archive"));
    if (collision === "file") await writeFile(destination, "keep");
    else if (collision === "directory") await mkdir(destination);
    else await symlink(join(f.base, "missing"), destination);
    await assert.rejects(
      archiveTarget(target, () => new Date("2026-10-05Z")),
      /collision/,
    );
    assert.ok(await lstat(f.changeRoot));
  });
test("archive date prefix and safe root; whole directory and hidden metadata preserved", async (t) => {
  const f = await fixture(t, { name: "2026-09-01-fixture-change" });
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  const destination = await archiveTarget(
    target,
    () => new Date("2026-10-05Z"),
  );
  assert.equal(destination, join(f.changesDir, "archive", f.id));
  const states: string[] = [];
  await archive(
    target,
    destination,
    async (s, d) => rename(s, d),
    undefined,
    (state) => states.push(state),
  );
  assert.deepEqual(states, ["moving", "moved_unconfirmed", "archived"]);
  await assert.rejects(lstat(f.changeRoot), { code: "ENOENT" });
  assert.match(
    await readFile(join(destination, ".openspec.yaml"), "utf8"),
    /retire_capabilities/,
  );
  assert.equal(
    await readFile(join(destination, "specs/identity/login/spec.md"), "utf8"),
    delta,
  );
});
test("symlinked archive root and failed/unconfirmed moves accurately preserve observations", async (t) => {
  const f = await fixture(t);
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  const root = join(f.changesDir, "archive");
  await symlink(f.base, root);
  await assert.rejects(archiveTarget(target, () => new Date()));
  await rm(root);
  const destination = await archiveTarget(
    target,
    () => new Date("2026-10-05Z"),
  );
  const states: string[] = [];
  await assert.rejects(
    archive(
      target,
      destination,
      async () => {
        throw new Error("before move");
      },
      undefined,
      (state) => states.push(state),
    ),
    /before move/,
  );
  assert.equal(states.at(-1), "failed");
  assert.ok(await lstat(f.changeRoot));
  await assert.rejects(
    archive(
      target,
      destination,
      async (s, d) => {
        await rename(s, d);
        throw new Error("after move");
      },
      undefined,
      (state) => states.push(state),
    ),
    /after move/,
  );
  assert.equal(states.at(-1), "moved_unconfirmed");
  assert.ok(await lstat(destination));
  await assert.rejects(lstat(f.changeRoot));
});
