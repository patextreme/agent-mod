// Static procedure/distribution contracts, not proof of live agent adherence.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_BUDGETS } from "../../skills/pr-review-repair/references/lifecycle.mjs";

const read = (name) =>
  readFileSync(
    new URL(`../../skills/pr-review-repair/${name}`, import.meta.url),
    "utf8",
  );

test("the real procedure requires persisted guarded dispatches and cumulative recovery", () => {
  const skill = read("SKILL.md");
  const prepare = read("references/prepare.md");
  const flow = read("references/pseudocode.md");
  const lifecycle = read("references/lifecycle.md");
  assert.match(skill, /Persist and validate every dispatch\/result/);
  assert.match(skill, /lifecycle\.mjs/);
  assert.match(prepare, /before each bounded setup attempt/);
  assert.match(
    prepare,
    /Lost or inconsistent accounting requires human reconciliation/,
  );
  assert.match(flow, /APPLY start\(stage\).*BEFORE dispatch/);
  assert.match(flow, /APPLY result to journal/);
  for (const stage of [
    "prepare",
    "review",
    "judge",
    "investigate",
    "repair",
    "validate",
    "verify",
  ]) {
    assert.ok(flow.includes(`RUN ${stage}`), `procedure exercises ${stage}`);
  }
  for (const effect of ["commit", "push", "comment"])
    assert.ok(flow.includes(`RUN deliver(${effect})`));
  assert.match(flow, /APPLY finish/);
  for (const command of [
    "init RUN.json CONTRACT.json",
    "show RUN.json",
    "apply RUN.json EVENT.json",
  ])
    assert.ok(lifecycle.includes(command));
  for (const [stage, budget] of Object.entries(DEFAULT_BUDGETS))
    assert.ok(
      lifecycle.includes(`| ${stage} | ${budget}`),
      `${stage} budget agrees`,
    );
  assert.match(lifecycle, /never call `init` to resume/);
  assert.match(lifecycle, /They do not demonstrate live model adherence/);
});

test("recovery returns terminal outcomes and records interruption before receipt recovery and guarded resume", () => {
  const flow = read("references/pseudocode.md");
  const recovery = flow.slice(
    flow.indexOf("ELSE:\n  RECOVER publication"),
    flow.indexOf("contract = RUN prepare"),
  );
  assert.match(
    recovery,
    /SHOW\/replay[\s\S]*IF state\.outcome: RETURN reconciled existing outcome[\s\S]*IF not state\.paused: APPLY pause[^\n]*actual observed heads/,
  );
  assert.match(
    recovery,
    /APPLY pause[\s\S]*RECOVER any completed but unacknowledged delivery effect[\s\S]*notice-start[\s\S]*RECONCILE external heads[\s\S]*IF not state\.paused: APPLY pause[\s\S]*APPLY resume with original identity, current effective limit, exact current counts\/stage/,
  );
  assert.match(
    read("SKILL.md"),
    /Follow \[Lifecycle guard\].*terminal return, interruption\/pause/,
  );
  assert.match(
    read("references/audit-publication.md"),
    /Follow \[Lifecycle guard recovery\]/,
  );
});
