import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Model-free documentation contracts for the deferred/report-only split.
// These tests assert the shipped text and examples; they do not establish
// live model adherence.
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const skillRoot = join(repoRoot, "skills/pr-review-repair");

function skillFile(path) {
  return readFileSync(join(skillRoot, path), "utf8");
}

const policy = skillFile("references/policy.md");
const reportContracts = skillFile("references/report-contracts.md");
const reviewScope = skillFile("references/review-scope.md");
const pseudocode = skillFile("references/pseudocode.md");
const skill = skillFile("SKILL.md");

const references = [
  ["references/policy.md", policy],
  ["references/report-contracts.md", reportContracts],
  ["references/review-scope.md", reviewScope],
  ["references/pseudocode.md", pseudocode],
];

function examples() {
  return [
    ...reportContracts.matchAll(
      /### Example: ([^\n]+)\n\n```markdown\n([\s\S]*?)\n```/g,
    ),
  ].map(([, name, record]) => ({ name, record }));
}

test("deferred is repair-worthy work outside the PR's intended scope", () => {
  const byFile = new Map(references);
  for (const [file, definition] of [
    [
      "references/policy.md",
      /Deferred\*\* means repair-worthy \*and\* outside this PR's intended scope/,
    ],
    [
      "references/report-contracts.md",
      /Deferred findings are repair-worthy \*and\* outside this PR's intended scope/,
    ],
    [
      "references/review-scope.md",
      /repair-worthy and outside the PR's intended scope → deferred under Report contracts/,
    ],
    [
      "references/pseudocode.md",
      /repair-worthy AND out of this PR's scope -> add to deferred/,
    ],
  ]) {
    assert.match(
      byFile.get(file),
      definition,
      `${file} must state the positive deferred definition`,
    );
    assert.doesNotMatch(
      byFile.get(file),
      /(?:deferred|deferral)[^\n]{0,80}(?:is|are) not (?:repair-worthy|out of scope)/i,
      `${file} must not define deferred by exclusion`,
    );
    assert.doesNotMatch(
      byFile.get(file),
      /deferred discoveries|deferred by timing|deferred because no review round remains/i,
      `${file} must not define deferred by timing alone`,
    );
  }
  assert.match(
    policy,
    /A finding qualifies only when both hold:/,
    "policy must require both the repair threshold and the scope test",
  );
  assert.match(
    policy,
    /A required decision is required input, not deferral\./,
    "required decisions are input, not deferral",
  );
});

test("report-only findings are recorded evidence, never deferred", () => {
  for (const [file, content] of references) {
    for (const forbidden of [
      /report-only findings are deferred/i,
      /report-only[^.\n]{0,80}deferred rather than fixed/i,
      /report-only[^.\n]{0,80}->\s*deferred/i,
      /defer report-only/i,
    ]) {
      assert.doesNotMatch(
        content,
        forbidden,
        `${file} must not route report-only findings to the deferred bucket`,
      );
    }
  }
  assert.match(
    policy,
    /Report-only findings are recorded evidence: never repaired and never deferred\./,
  );
  assert.match(
    reportContracts,
    /Never enumerate report-only findings in the visible summary or describe them as deferred\./,
  );
  assert.match(
    reviewScope,
    /below the repair threshold → report-only, recorded as evidence and never deferred\./,
  );
  assert.match(pseudocode, /below the repair threshold\s+-> report-only/);
});

test("unrelated check failures are limitations, not deferrals", () => {
  const byFile = new Map(references);
  for (const [file, rule] of [
    [
      "references/policy.md",
      /An unrelated or environmental check failure is a material limitation on the evidence, never deferred work\./,
    ],
    [
      "references/report-contracts.md",
      /An unrelated or environmental failure is a material limitation, never a deferral\./,
    ],
    [
      "references/review-scope.md",
      /An unrelated or environmental check failure is a material limitation on the evidence, never deferred work\./,
    ],
    [
      "references/pseudocode.md",
      /An unrelated or environmental check failure is a material limitation on the evidence, never deferred work\./,
    ],
  ]) {
    assert.match(
      byFile.get(file),
      rule,
      `${file} must state the limitation rule`,
    );
    assert.doesNotMatch(
      byFile.get(file),
      /record (?:them|it|these) as deferred|as deferred limitations/i,
      `${file} must not record unrelated failures as deferred`,
    );
  }
  assert.doesNotMatch(
    skill,
    /afterwards record them as deferred/i,
    "the skill must not route post-window unrelated failures to deferred",
  );
});

test("shipped examples defer only out-of-scope repair-worthy findings", () => {
  const records = examples();
  assert.equal(records.length, 4, "all four report examples must be parsed");

  for (const { name, record } of records) {
    const visible = record.split("<details>")[0];
    const deferredAt = visible.search(/^\*\*Deferred[^:]*:\*\*/m);
    if (deferredAt === -1) {
      assert.doesNotMatch(
        visible,
        /^- F-\d{3}/m,
        `${name}: findings need a visible deferred section`,
      );
      continue;
    }
    const deferred = visible.slice(deferredAt).split(/\n\n/)[0];
    const entries = deferred
      .split("\n")
      .filter((line) => line.startsWith("- F-"));
    assert.ok(entries.length > 0, `${name}: deferred section needs entries`);
    for (const entry of entries) {
      assert.match(
        entry,
        /^\s*-\s*F-\d{3}\b/,
        `${name}: every deferred entry needs a stable ID`,
      );
      assert.match(
        entry,
        /follow-up tracked|unblocked by|blocked on/i,
        `${name}: every deferred entry needs an unblocker`,
      );
      assert.doesNotMatch(
        entry,
        /hardening|cosmetic|naming preference|smell|no demonstrated consequence/i,
        `${name}: report-only work must not be deferred`,
      );
    }
    const reportOnly = visible.match(/report-only/gi) ?? [];
    assert.ok(
      reportOnly.length <= 1,
      `${name}: report-only findings may contribute at most one visible count`,
    );
    if (reportOnly.length === 1) {
      assert.match(
        visible,
        /Report-only:\*\* \d+/,
        `${name}: the one report-only mention must be a count`,
      );
    }
    const ledger = record.split("Complete ledger:")[1] ?? "";
    for (const clause of ledger.split(/[;\n]/)) {
      assert.ok(
        !(/report-only/i.test(clause) && /\bdeferred\b/i.test(clause)),
        `${name}: a ledger clause must not defer a report-only finding: ${clause.trim()}`,
      );
    }
  }

  const capped = records.find(({ name }) => name === "capped round");
  assert.ok(capped, "the capped-round example must exist");
  const cappedVisible = capped.record.split("<details>")[0];
  assert.ok(
    cappedVisible.includes(
      "Deferred (repair-worthy, outside this PR's scope):",
    ),
    "the capped example must name the new deferred definition",
  );
  assert.match(cappedVisible, /Report-only:\*\* 1/);
  assert.doesNotMatch(
    cappedVisible,
    /F-006|hardening nit/i,
    "the capped example must not enumerate or defer a hardening nit",
  );
  assert.match(
    capped.record,
    /F-006 report-only/,
    "the hardening nit stays in the collapsed audit ledger",
  );
});

test("post-window routing classifies findings instead of deferring everything", () => {
  for (const [file, content] of [...references, ["SKILL.md", skill]]) {
    for (const retired of [
      /anything else it notices is deferred/i,
      /defer anything else/i,
      /NEW ISSUE\s+->\s+add to deferred/i,
    ]) {
      assert.doesNotMatch(
        content,
        retired,
        `${file} must not route every new finding to deferred`,
      );
    }
  }
  assert.match(
    reviewScope,
    /repair-worthy and inside the PR's intent → keep the ID open and escalate/,
    "review scope must keep in-scope repair-worthy findings open",
  );
  assert.match(
    pseudocode,
    /repair-worthy AND in this PR's scope\s+-> add to open; ESCALATE/,
    "the control flow must add an in-scope finding to open and escalate",
  );
  assert.match(
    skill,
    /Anything else it notices is never repaired: classify it under Review scope and Repair policy\./,
    "the verify stage must classify rather than blanket-defer",
  );
  assert.match(
    skill,
    /any deferred findings are repair-worthy and outside the PR's scope/,
    "the limited-coverage outcome must match the deferred definition",
  );
  assert.match(
    skill,
    /the deferred list published/,
    "finishing must still publish the deferred list",
  );
  assert.match(
    skill,
    /Deferred findings never block a finish and never justify another review round\./,
    "deferral must not buy another round",
  );
  assert.match(
    reportContracts,
    /never blocks a `limited coverage` finish/,
    "deferral must not block a limited-coverage finish",
  );
  assert.match(
    skill,
    /that round repaired and deferred nothing/,
    "the verified outcome must match a converged round that changed nothing",
  );
  assert.match(
    reportContracts,
    /that round repaired and deferred nothing/,
    "both outcome definitions must agree",
  );
});

test("outcome definitions match every reachable finish state", () => {
  for (const [file, content] of [
    ["SKILL.md", skill],
    ["references/report-contracts.md", reportContracts],
  ]) {
    assert.match(
      content,
      /required checks (?:pass|passed)/,
      `${file}: verified must require passing required checks`,
    );
    assert.match(
      content,
      /(?:discovery ended|window closed) with (?:repair work|repairs), deferred findings/,
      `${file}: limited coverage must cover the deferred-only round`,
    );
    assert.match(
      content,
      /a required check that did not pass/,
      `${file}: limited coverage must cover a non-passing required check`,
    );
  }
});
