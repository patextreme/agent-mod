import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Procedure-contract checks only; no live model adherence or GitHub rendering.
const reference = (name) =>
  readFileSync(
    new URL(
      `../../skills/pr-review-repair/references/${name}`,
      import.meta.url,
    ),
    "utf8",
  );

test("policy, scope and publication use the accepted discovery limit, including shorter-window examples", () => {
  assert.match(
    reference("policy.md"),
    /Discovery closes at the effective accepted limit/,
  );
  assert.match(
    reference("review-scope.md"),
    /no review beyond the effective accepted limit/,
  );
  const reports = reference("report-contracts.md");
  assert.match(reports, /`Rounds: n\/L`/);
  assert.match(reports, /L is the effective accepted limit/);
  const capped = reports
    .split("### Example: capped round")[1]
    .split("### Example:")[0];
  assert.match(capped, /selected two-round window/);
  assert.match(capped, /\*\*Rounds:\*\* 2\/2/);
  assert.match(capped, /rounds 2\/2/);
});

test("review and verify lifecycle acceptance require evaluated coverage locators, not boolean-only declarations", () => {
  const lifecycle = reference("lifecycle.md");
  assert.match(
    lifecycle,
    /For review and verify, `record` locates the accepted stage manifest/,
  );
  assert.match(lifecycle, /coverage\.json.*coverage-evaluation\.json/);
  assert.match(lifecycle, /both independent axes/);
  const flow = reference("pseudocode.md");
  const evaluate = flow.indexOf(
    "EVALUATE coverage under Review scope BEFORE a complete review/verify result",
  );
  const accept = flow.indexOf("APPLY result to journal");
  assert.ok(evaluate !== -1 && evaluate < accept);
  assert.match(
    flow,
    /actual absolute report, coverage input\/output and stage-manifest paths/,
  );
  assert.match(
    flow,
    /lifecycle guard does not read or evaluate coverage artifacts/,
  );
});

test("publication and recovery preserve replayable lifecycle prefixes and effective accounting", () => {
  const audit = reference("audit-publication.md");
  assert.match(
    audit,
    /`content` is serialized JSON containing `journal` and `state`/,
  );
  assert.match(
    audit,
    /original contract and every ordered event through the active comment `start` or `notice-start`/,
  );
  assert.match(
    audit,
    /effective `limit`, `remaining`, frozen budgets, all attempt counts/,
  );
  assert.match(audit, /recover.*recoveredItems/s);
  assert.match(audit, /replay.*unpublished suffix/s);
  const reports = reference("report-contracts.md");
  assert.match(reports, /publication input\/plan\/receipt locators/);
  assert.match(
    reports,
    /before applying the comment `result` or `notice-result`/,
  );
  const flow = reference("pseudocode.md");
  assert.match(flow, /PLAN and RECOVER audit under Report contracts/);
});
