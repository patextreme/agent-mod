import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateCoverage } from "../../skills/pr-review-repair/references/coverage-evidence.mjs";

// Offline declared-evidence contracts only. These tests do not establish
// historical provider delivery, attention, or live reviewer comprehension.
const fixtures = JSON.parse(
  readFileSync(
    new URL(
      "../../skills/pr-review-repair/references/coverage-fixtures.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("complete original exposure survives clipped summaries; optional history is not a gap", () => {
  assert.deepEqual(evaluateCoverage(fixtures.completeClipped), {
    coverageComplete: true,
    exposed: ["full-diff", "issue-spec"],
    gaps: [],
    reuse: [],
  });
});

test("genuinely truncated original output targets the missing material", () => {
  const record = structuredClone(fixtures.completeClipped);
  record.coverage[0].evidence.original = "truncated";
  assert.deepEqual(evaluateCoverage(record), {
    coverageComplete: false,
    exposed: ["issue-spec"],
    gaps: [
      {
        id: "full-diff",
        reason: "incomplete-original",
        action: "recover-missing-material",
      },
    ],
    reuse: [],
  });
});

test("requested reads and complete saved files alone do not establish exposure", () => {
  for (const change of [
    { requested: false },
    { delivered: false },
    { original: "missing" },
    { original: "unknown" },
    { ref: "" },
  ]) {
    const record = structuredClone(fixtures.completeClipped);
    Object.assign(record.coverage[1].evidence, change);
    const result = evaluateCoverage(record);
    assert.equal(result.coverageComplete, false);
    assert.deepEqual(result.exposed, ["full-diff"]);
    assert.deepEqual(result.gaps, [
      {
        id: "issue-spec",
        reason: "unread-required",
        action: "read-original-or-source",
      },
    ]);
  }
});

test("complete exposure without substantive completion remains an explicit gap", () => {
  for (const completion of [
    undefined,
    { complete: false, account: "Stopped mid-file" },
    { complete: true, account: "" },
  ]) {
    const record = structuredClone(fixtures.completeClipped);
    record.handoff.coverage = completion
      ? [{ id: "full-diff", ...completion }, record.handoff.coverage[1]]
      : record.handoff.coverage.slice(1);
    const result = evaluateCoverage(record);
    assert.equal(result.coverageComplete, false);
    assert.deepEqual(result.exposed, ["full-diff", "issue-spec"]);
    assert.deepEqual(result.gaps, [
      {
        id: "full-diff",
        reason: "unfinished-inspection",
        action: "finish-semantic-inspection",
      },
    ]);
  }
});

test("recovery requires a matching handoff and closed investigations, not a clean exposure list", () => {
  const record = structuredClone(fixtures.completeClipped);
  record.handoff.head = "older-head";
  record.handoff.investigations = ["Check caller failure behavior"];
  assert.deepEqual(evaluateCoverage(record).gaps, [
    {
      id: "handoff",
      reason: "stale-handoff",
      action: "reconcile-current-scope",
    },
    {
      id: "investigations",
      reason: "unresolved-investigation",
      action: "resolve-investigations",
    },
  ]);
  record.handoff.head = record.pin.head;
  record.handoff.mergeBase = "different-base";
  record.handoff.investigations = [];
  assert.equal(evaluateCoverage(record).coverageComplete, false);
});

test("additional mandatory history needs a requirement, instruction, or concrete impact basis", () => {
  const record = structuredClone(fixtures.completeClipped);
  record.coverage[2].required = true;
  assert.deepEqual(evaluateCoverage(record).gaps, [
    {
      id: "old-version",
      reason: "missing-basis",
      action: "justify-mandatory-scope",
    },
    {
      id: "old-version",
      reason: "unread-required",
      action: "read-original-or-source",
    },
    {
      id: "old-version",
      reason: "unfinished-inspection",
      action: "finish-semantic-inspection",
    },
  ]);
  record.coverage[2].basis = {
    kind: "impact",
    detail:
      "Compatibility requirement R2: compare the prior wire format to the updated consumer",
  };
  record.coverage[2].evidence = structuredClone(record.coverage[1].evidence);
  record.handoff.coverage.push({
    id: "old-version",
    complete: true,
    account:
      "Compared old wire encoding with the current decoder compatibility path.",
  });
  assert.equal(evaluateCoverage(record).coverageComplete, true);
});

test("every discovery axis requires a full diff and current sources/impact cannot be marked optional", () => {
  const record = structuredClone(fixtures.completeClipped);
  record.coverage.shift();
  assert.deepEqual(evaluateCoverage(record).gaps, [
    {
      id: "full-diff",
      reason: "missing-full-diff",
      action: "review-full-pinned-diff",
    },
  ]);
  for (const kind of ["spec", "standards", "impact"]) {
    record.coverage = [{ id: "current-source", kind, required: false }];
    assert.equal(evaluateCoverage(record).coverageComplete, false);
    assert.ok(
      evaluateCoverage(record).gaps.some(
        (gap) =>
          gap.id === "current-source" && gap.reason === "unread-required",
      ),
    );
  }
});

test("preparation and check reuse require matching source, configuration, dependencies, and environment", () => {
  const record = structuredClone(fixtures.completeClipped);
  record.reuse = structuredClone(fixtures.matchingReuse);
  assert.deepEqual(evaluateCoverage(record).reuse, [
    { id: "source-discovery", reusable: true, changed: [] },
    { id: "node-tests", reusable: true, changed: [] },
  ]);
  for (const field of [
    "source",
    "configuration",
    "dependencies",
    "environment",
  ]) {
    for (const index of [0, 1]) {
      const stale = structuredClone(record);
      stale.reuse[index].currentInputs[field] = "changed";
      const result = evaluateCoverage(stale);
      assert.equal(result.coverageComplete, false);
      assert.deepEqual(result.reuse[index], {
        id: stale.reuse[index].id,
        reusable: false,
        changed: [field],
      });
      assert.deepEqual(result.gaps, [
        {
          id: stale.reuse[index].id,
          reason: "stale-reuse",
          action: index === 0 ? "refresh-preparation" : "rerun-check",
        },
      ]);
    }
  }
});

test("verifier stays per-ID and check reuse additionally requires the same unchanged head", () => {
  const record = structuredClone(fixtures.completeClipped);
  record.reuse = structuredClone(fixtures.matchingReuse);
  record.reuse[1].head = "older-head";
  // Discovery may accept checks from an older head only with matching inputs.
  assert.equal(evaluateCoverage(record).coverageComplete, true);
  record.stage = "verify";
  delete record.axis;
  record.coverage[0].kind = "recorded-id";
  record.coverage[0].basis = {
    kind: "instruction",
    detail: "Verify recorded ID F-001 and its fixing commit",
  };
  assert.deepEqual(evaluateCoverage(record).reuse[1], {
    id: "node-tests",
    reusable: false,
    changed: ["head"],
  });
  record.reuse[1].head = record.pin.head;
  assert.equal(evaluateCoverage(record).coverageComplete, true);
  record.handoff.coverage[0].complete = false;
  assert.equal(evaluateCoverage(record).coverageComplete, false);
});

test("malformed scope or reuse records fail closed instead of silently dropping obligations", () => {
  for (const mutate of [
    (record) => {
      record.stage = "reivew";
    },
    (record) => {
      record.axis = "spec-ish";
    },
    (record) => {
      delete record.pin.head;
    },
    (record) => {
      record.coverage.push(structuredClone(record.coverage[0]));
    },
    (record) => {
      record.coverage[1].kind = "optional-spec";
    },
    (record) => {
      record.handoff.coverage.push(structuredClone(record.handoff.coverage[0]));
    },
    (record) => {
      record.reuse = [{ id: "x", kind: "historical-review" }];
    },
    (record) => {
      record.stage = "verify";
      record.coverage = [];
    },
    (record) => {
      record.coverage[2].required = "true";
    },
    (record) => {
      record.reuse = structuredClone(fixtures.matchingReuse);
      delete record.reuse[0].head;
    },
    (record) => {
      record.reuse = structuredClone(fixtures.matchingReuse);
      delete record.reuse[1].command;
    },
    (record) => {
      record.reuse = structuredClone(fixtures.matchingReuse);
      delete record.reuse[1].result;
    },
  ]) {
    const record = structuredClone(fixtures.completeClipped);
    mutate(record);
    assert.throws(() => evaluateCoverage(record), TypeError);
  }
});

test("CLI persists evaluable JSON with distinct complete, gap, and invalid-input exits", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-coverage-"));
  const path = join(dir, "coverage.json");
  const cli = fileURLToPath(
    new URL(
      "../../skills/pr-review-repair/references/coverage-evidence.mjs",
      import.meta.url,
    ),
  );
  try {
    const record = structuredClone(fixtures.completeClipped);
    writeFileSync(path, JSON.stringify(record));
    let result = spawnSync(process.execPath, [cli, path], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).coverageComplete, true);
    record.coverage[0].evidence.original = "truncated";
    writeFileSync(path, JSON.stringify(record));
    result = spawnSync(process.execPath, [cli, path], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      JSON.parse(result.stdout).gaps[0].action,
      "recover-missing-material",
    );
    writeFileSync(path, "{malformed");
    result = spawnSync(process.execPath, [cli, path], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).coverageComplete, false);
    assert.ok(JSON.parse(result.stdout).error);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reviewer and verifier procedures consume the evaluator, examples, and persisted handoff", () => {
  const scope = readFileSync(
    new URL(
      "../../skills/pr-review-repair/references/review-scope.md",
      import.meta.url,
    ),
    "utf8",
  );
  const contract = readFileSync(
    new URL(
      "../../skills/pr-review-repair/references/coverage-evidence.md",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(scope, /\[Coverage evidence\]\(\.\/coverage-evidence\.md\)/);
  assert.match(
    scope,
    /Before accepting either axis report or a verifier report/,
  );
  assert.match(scope, /required coverage manifest/);
  assert.match(scope, /original evidence and the concise reviewer handoff/);
  assert.match(contract, /coverage-fixtures\.json/);
  assert.match(
    contract,
    /node "\$COVERAGE_EVALUATOR" "\$STAGE_DIR\/coverage\.json" > "\$STAGE_DIR\/coverage-evaluation\.json"/,
  );
  assert.match(contract, /Exit 1/);
  assert.match(contract, /exposure is not semantic completion/);
});
