import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluatePublication } from "../../skills/pr-review-repair/references/audit-publication.mjs";

const pr = "https://github.com/example/project/pull/12";
const marker = "<!-- pr-review-repair run=aaa111 round=1 kind=summary -->";
const item = (id, kind, content) => ({ id, kind, head: "aaa111", content });
function firstPublication() {
  const items = [
    item(
      "standards:1",
      "standards",
      "Complete Standards report, including skipped live checks.",
    ),
    item(
      "spec:1",
      "spec",
      "Complete Spec report: no findings; source issue read.",
    ),
    item("ledger", "ledger", "No findings, no unresolved investigations."),
    item(
      "checks:1",
      "checks",
      "node --test: passed fresh at aaa111. Live checks unavailable, not passing.",
    ),
    item(
      "accounting",
      "accounting",
      "run aaa111; base 000111; merge-base 000111; round 1/3; repair cycles 0; failed-verification counts {}; local/remote aaa111.",
    ),
    item(
      "operation",
      "operation",
      "No edits or commits; push unnecessary; comment pending read-back; no incomplete repair.",
    ),
  ];
  const expected = { pr, marker, head: "aaa111", items, changedFindings: [] };
  return {
    phase: "plan",
    expected,
    record: structuredClone(expected),
    previousItems: [],
    sources: [],
  };
}

function laterPublication() {
  const first = firstPublication();
  const url = `${pr}#issuecomment-123`;
  const source = {
    url,
    body: `${marker}\n<details>\n${evaluatePublication(first).audit}\n</details>`,
  };
  const expected = structuredClone(first.expected);
  expected.marker = marker.replace("round=1", "round=2");
  expected.head = "bbb222";
  for (const entry of expected.items.filter((entry) =>
    ["accounting", "operation"].includes(entry.kind),
  )) {
    entry.head = "bbb222";
    entry.content =
      entry.kind === "accounting"
        ? "round 2/3; repair cycles 1; signed commit bbb222; local/remote bbb222; failed-verification counts {}"
        : "Signed commit bbb222; push confirmed bbb222; summary pending read-back.";
  }
  const record = structuredClone(expected);
  record.items = record.items.map((entry) =>
    ["accounting", "operation"].includes(entry.kind)
      ? entry
      : {
          id: entry.id,
          kind: entry.kind,
          head: entry.head,
          ref: { url, marker, item: entry.id },
        },
  );
  return {
    phase: "plan",
    expected,
    record,
    previousItems: first.expected.items,
    sources: [source],
  };
}

test("first publication preserves every complete new audit item, including clean axis reports", () => {
  const input = firstPublication();
  const result = evaluatePublication(input);
  assert.equal(result.ok, true);
  assert.equal(
    result.published,
    false,
    "a valid plan is not a delivery receipt",
  );
  for (const entry of input.expected.items)
    assert.ok(result.audit.includes(JSON.stringify(entry.content)));
  input.record.items.pop();
  assert.equal(
    evaluatePublication(input).ok,
    false,
    "incomplete operation state cannot disappear",
  );
});

test("a setup escalation preserves zero rounds and explicitly unavailable reports rather than fabricating reviews", () => {
  const input = firstPublication();
  input.expected.marker = input.record.marker = marker.replace(
    "round=1 kind=summary",
    "round=0 kind=escalation",
  );
  for (const record of [input.expected, input.record]) {
    record.items[0].content =
      "Standards report not produced: setup is blocked on authenticated access.";
    record.items[1].content =
      "Spec report not produced: setup is blocked on authenticated access.";
    record.items[4].content =
      "rounds 0/3; repair cycles 0; no review launched.";
    record.items[5].content =
      "No commit, push or review attempted; required input: restore authenticated access.";
  }
  assert.equal(evaluatePublication(input).ok, true);
});

test("later rounds reuse complete available same-PR audit items without copying reports", () => {
  const result = evaluatePublication(laterPublication());
  assert.equal(result.ok, true, JSON.stringify(result.gaps));
  assert.ok(result.audit.includes("#issuecomment-123"));
  assert.ok(!result.audit.includes("Complete Standards report"));
});

test("reuse at a different head requires an accepted applicability receipt with substantive evidence", () => {
  const input = laterPublication();
  input.expected.items[3].head = "bbb222";
  input.record.items[3].head = "bbb222";
  const receipt = {
    item: "checks:1",
    from: "aaa111",
    to: "bbb222",
    reason: "Cached checks cover unchanged sources",
    evidence:
      "Verifier compared source, config, dependencies and environment; only README changed.",
  };
  input.record.items[3].ref.applicability = receipt;
  assert.equal(
    evaluatePublication(input).ok,
    false,
    "a proposed receipt is not accepted evidence",
  );
  input.acceptedApplicability = [receipt];
  assert.equal(evaluatePublication(input).ok, true);
  input.acceptedApplicability = [{ ...receipt, to: "ccc333" }];
  assert.equal(evaluatePublication(input).ok, false);
});

test("inline republication cannot silently relabel historical reports or checks at a new head", () => {
  for (const id of ["standards:1", "spec:1", "checks:1"]) {
    const input = laterPublication();
    const entry = input.expected.items.find((entry) => entry.id === id);
    entry.head = "bbb222";
    input.record.items = input.record.items.map((candidate) =>
      candidate.id === id ? structuredClone(entry) : candidate,
    );
    assert.equal(
      evaluatePublication(input).ok,
      false,
      `Historical head rewritten: ${id}`,
    );
  }
});

test("new findings and changed dispositions are explicit, and prior findings cannot vanish", () => {
  const input = laterPublication();
  input.previousItems.push(
    item(
      "F-001",
      "finding",
      "Report-only: optional hardening, no demonstrated consequence.",
    ),
  );
  const finding = {
    ...item(
      "F-001",
      "finding",
      "Repaired: demonstrated empty-input crash; commit bbb222; regression test passed.",
    ),
    head: "bbb222",
  };
  input.expected.items.push(finding);
  input.record.items.push(finding);
  assert.equal(
    evaluatePublication(input).ok,
    false,
    "changed findings need explicit change notes",
  );
  const changes = [
    {
      id: "F-001",
      description:
        "F-001 changed from report-only to repaired after crash reproduction; see new resolution evidence.",
    },
  ];
  input.expected.changedFindings = changes;
  input.record.changedFindings = changes;
  assert.equal(evaluatePublication(input).ok, true);
  input.record.changedFindings = [];
  assert.equal(
    evaluatePublication(input).ok,
    false,
    "changes cannot be hidden in an unchanged ledger reference",
  );
  input.expected.items.pop();
  input.record.items.pop();
  assert.equal(
    evaluatePublication(input).ok,
    false,
    "full ledger retains historical finding dispositions",
  );
});

test("every record publishes current accounting and operation state inline even when reports are reused", () => {
  const input = laterPublication();
  const original = firstPublication().expected.items.find(
    (entry) => entry.kind === "operation",
  );
  input.expected.items[5] = original;
  input.record.items[5] = {
    id: original.id,
    kind: original.kind,
    head: original.head,
    ref: { url: input.sources[0].url, marker, item: original.id },
  };
  assert.equal(evaluatePublication(input).ok, false);
});

test("read-back recovery returns a durable receipt for partial delivery, never claims that delivery is complete", () => {
  const input = laterPublication();
  input.expected.items[5].content =
    "Signed local commit bbb222; push failed; remote aaa111; summary pending read-back. Resume push only after reconciliation, no new repair cycle.";
  input.record.items[5].content = input.expected.items[5].content;
  const plan = evaluatePublication(input);
  input.phase = "recover";
  input.publication = {
    url: `${pr}#issuecomment-456`,
    body: `${input.expected.marker}\n<details>\n${plan.audit}\n</details>`,
  };
  const result = evaluatePublication(input);
  assert.equal(result.published, true);
  assert.deepEqual(result.receipt, {
    url: `${pr}#issuecomment-456`,
    marker: input.expected.marker,
    head: "bbb222",
  });
  assert.equal(
    result.recoveredItems.find((entry) => entry.kind === "operation").content,
    input.expected.items[5].content,
  );
  input.publication.body = null;
  assert.equal(evaluatePublication(input).published, false);
  assert.equal(evaluatePublication(input).receipt, null);
});

test("failed publication, incomplete read-back and disappearing reuse targets are recovery gaps", () => {
  const input = laterPublication();
  const plan = evaluatePublication(input);
  input.phase = "recover";
  input.publication = {
    url: `${pr}#issuecomment-456`,
    body: `${input.expected.marker}\n${plan.audit}`,
  };
  assert.equal(evaluatePublication(input).ok, true);
  input.sources = [];
  assert.equal(
    evaluatePublication(input).published,
    false,
    "publication still needs reachable complete audit sources",
  );
  input.publication.body = input.expected.marker;
  assert.equal(evaluatePublication(input).ok, false);
  delete input.publication;
  assert.equal(evaluatePublication(input).ok, false);
});

test("CLI persists plan/recovery decisions and exits unsuccessfully for a publication gap", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-publication-"));
  try {
    const file = join(dir, "input.json");
    writeFileSync(file, JSON.stringify(firstPublication()));
    const cli = fileURLToPath(
      new URL(
        "../../skills/pr-review-repair/references/audit-publication.mjs",
        import.meta.url,
      ),
    );
    const plan = spawnSync(process.execPath, [cli, "plan", file], {
      encoding: "utf8",
    });
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).ok, true);
    const failed = spawnSync(process.execPath, [cli, "recover", file], {
      encoding: "utf8",
    });
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(failed.stdout).published, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("publication procedure executes the evaluator before posting and before accepting recovery receipts", () => {
  const report = readFileSync(
    new URL(
      "../../skills/pr-review-repair/references/report-contracts.md",
      import.meta.url,
    ),
    "utf8",
  );
  for (const required of [
    "./audit-publication.md",
    'node "$publicationEvaluator" plan "$publicationInput" > "$publicationPlan"',
    'node "$publicationEvaluator" recover "$publicationInput" > "$publicationReceipt"',
    "Before every post",
    "On resume or a delivery retry",
    "published=true",
    "publication/recovery gap",
    "same counts",
    "one logical audit",
  ])
    assert.ok(
      report.includes(required),
      `Missing executable procedure contract: ${required}`,
    );
});

test("durable audit chains remain recoverable and damaged originals fail closed", () => {
  const input = laterPublication();
  const secondMarker = input.expected.marker;
  const secondUrl = `${pr}#issuecomment-456`;
  input.sources.push({
    url: secondUrl,
    body: `${secondMarker}\n${evaluatePublication(input).audit}`,
  });
  input.expected.marker = marker.replace("round=1", "round=3");
  for (const entry of input.record.items.filter((entry) => entry.ref))
    entry.ref = { url: secondUrl, marker: secondMarker, item: entry.id };
  input.record.marker = input.expected.marker;
  assert.equal(evaluatePublication(input).ok, true);
  input.sources[0].body = null;
  assert.equal(evaluatePublication(input).ok, false);
});

test("malformed identities, duplicate inventory and rewritten original reports cannot establish publication", () => {
  const mutations = [
    (input) => {
      input.expected.marker = input.record.marker = "no identity marker";
    },
    (input) => {
      delete input.expected.changedFindings;
      delete input.record.changedFindings;
    },
    (input) => {
      delete input.previousItems;
    },
    (input) => {
      input.previousItems = [item("F-001", "finding", "Report-only finding")];
      const erased = item(
        "F-001",
        "ledger",
        "Changed category hides a finding",
      );
      input.expected.items.push(erased);
      input.record.items.push(erased);
    },
    (input) => {
      input.expected.pr = input.record.pr = "/tmp/pr";
    },
    (input) => {
      input.expected.items[0].head = input.record.items[0].head = "";
    },
    (input) => {
      input.expected.items.push(input.expected.items[0]);
      input.record.items.push(input.record.items[0]);
    },
    (input) => {
      input.expected.items[0].content = input.record.items[0].content =
        "Digest instead of original report";
      input.previousItems = firstPublication().expected.items;
    },
  ];
  for (const mutate of mutations) {
    const input = firstPublication();
    mutate(input);
    assert.equal(evaluatePublication(input).ok, false, String(mutate));
  }
  assert.equal(evaluatePublication(null).ok, false);
});

test("reuse refuses missing, inaccessible, foreign, stale or misidentified records", () => {
  const mutations = [
    (input) => {
      input.sources = [];
    },
    (input) => {
      input.sources[0].body = null;
    },
    (input) => {
      input.sources[0].body = input.sources[0].body.replace(
        "run=aaa111",
        "run=ccc333",
      );
    },
    (input) => {
      input.sources[0].body = input.sources[0].body.replaceAll(
        "project/pull/12",
        "project/pull/13",
      );
    },
    (input) => {
      input.record.items[0].ref.url = "/tmp/report.md";
    },
    (input) => {
      input.record.items[0].ref.url = "sha256:1234";
    },
    (input) => {
      input.expected.items[0].head = "bbb222";
      input.record.items[0].head = "bbb222";
    },
  ];
  for (const mutate of mutations) {
    const input = laterPublication();
    mutate(input);
    assert.equal(evaluatePublication(input).ok, false, String(mutate));
  }
});
