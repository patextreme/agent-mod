import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Ownerless document/fixture structure only: no model or workflow execution.
// Regex assertions guard distribution contracts, not operational safety.
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(join(root, path), "utf8");
const skill = read("skills/orc-openspec-implement/SKILL.md");
const pseudocode = read(
  "skills/orc-openspec-implement/references/pseudocode.md",
);
const suiteRoot = "tests/semantic/openspec-implement/";
const records = read("skills/orc-openspec-implement/references/records.md");

test("implementation preparation declares explicit risk/dependency review-plan fields", () => {
  for (const pattern of [
    /selected repository\/worktree/,
    /change\/store/,
    /exact task IDs/i,
    /requirements\/contracts|requirement\/contract mapping/,
    /dependency edges/i,
    /risk classifications with rationale/,
    /ordered groups.*task-ID chunks/,
    /review boundary membership/,
    /prerequisite release conditions/,
    /focused.*final check commands/,
  ]) {
    assert.match(skill, pattern);
    assert.match(pseudocode, pattern);
  }
});

test("review scheduling separates workers from justified batching and prerequisite gates", () => {
  for (const document of [skill, pseudocode]) {
    assert.match(document, /one(?: .*|) at a time/);
    assert.match(document, /lower-risk/);
    assert.match(document, /affirmative rationale/);
    assert.match(document, /unverified prerequisite contract/);
    assert.match(document, /unknown risk/i);
    assert.match(document, /separate boundary/);
    assert.match(
      document,
      /acceptance AND bookkeeping|acceptance and serialized bookkeeping/,
    );
    assert.match(document, /before dependent work/);
    assert.match(document, /reconcile.*dependenc|reconcile.*plan/is);
    assert.match(document, /freeze affected dependents/i);
  }
  assert.doesNotMatch(
    skill + pseudocode,
    /preceding group's completion|verifying each before the next/,
  );
  assert.match(
    pseudocode,
    /ACCEPT_BOUNDARY\(prerequisite boundary\) before releasing dependent work/,
  );
  assert.ok(
    pseudocode.indexOf("ACCEPT_BOUNDARY(prerequisite boundary)") <
      pseudocode.indexOf("implementation = DELEGATE"),
  );
});

test("mechanical evidence stays separate from fresh actual-source semantic acceptance", () => {
  for (const document of [skill, pseudocode]) {
    assert.match(
      document,
      /repository instructions and executable configuration/,
    );
    assert.match(document, /working director/);
    assert.match(document, /scope/);
    assert.match(document, /environment assumptions/);
    assert.match(document, /results\/exit status/);
    assert.match(document, /source binding/);
    assert.match(document, /blocked required checks.*not passes/is);
    assert.match(document, /fresh independent read-only/i);
    assert.match(document, /actual.source|actual source/i);
    assert.match(document, /cross-component contracts/);
    assert.match(document, /failure\/cancellation\/restart\/concurrency/);
    assert.match(document, /checks reach production paths/);
    assert.match(
      document,
      /passing checks.*semantic acceptance|passing checks cannot substitute for semantic review/is,
    );
  }
});

test("task checkboxes stay pending until independent boundary acceptance and serialized bookkeeping", () => {
  for (const document of [skill, pseudocode]) {
    assert.match(document, /task-checkbox updates pending/);
    assert.match(
      document,
      /fully implemented.*independently verified task IDs/,
    );
    assert.match(document, /unaccepted tasks stay pending/i);
    assert.match(document, /fresh apply progress/);
  }
  const functionStart = pseudocode.indexOf("ACCEPT_BOUNDARY(boundary):");
  const review = pseudocode.indexOf("verification = DELEGATE", functionStart);
  const bookkeeping = pseudocode.indexOf("DELEGATE(Bookkeeping", functionStart);
  assert.ok(
    functionStart >= 0 && review > functionStart && bookkeeping > review,
  );
  assert.match(
    pseudocode.slice(review, bookkeeping),
    /WHILE verification is not independently verified/,
  );
  assert.match(
    pseudocode.slice(bookkeeping),
    /SERIALIZE bookkeeping after acceptance/,
  );
});

test("manual implementation fixtures have separate rubric and remain outside gate discovery", () => {
  const cases = JSON.parse(read(`${suiteRoot}cases.json`));
  const expectations = JSON.parse(read(`${suiteRoot}expectations.json`));
  assert.equal(cases.version, 1);
  assert.equal(expectations.version, 1);
  const ids = cases.cases.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    expectations.cases.map(({ id }) => id),
    ids,
  );
  for (const id of ["case-01", "case-02", "case-03", "case-04"])
    assert.ok(ids.includes(id));
  assert.match(cases.prompt, /read-only scheduling\/review probe/);
  assert.match(cases.prompt, /commands actually run from supplied claims/);
  const procedure = read(`${suiteRoot}README.md`);
  assert.match(procedure, /never runs as a quality gate/);
  assert.match(procedure, /ADR 0001/);
  assert.match(procedure, /outside version control/);
  assert.match(procedure, /not operational proof/);
  const materializer = read(`${suiteRoot}materialize.mjs`);
  assert.match(materializer, /check-ignore/);
  assert.match(materializer, /realpath/);
  const runner = read("tests/run.mjs");
  assert.match(runner, /\["tests\/gates", "\.test\.mjs"\]/);
  assert.doesNotMatch(runner, /\["tests\/semantic/);
});

test("bounded context policy uses reliable occupancy or finite fallback, never billing", () => {
  for (const document of [skill, pseudocode]) {
    for (const pattern of [
      /fresh worker per group/i,
      /explicit task-ID chunks/,
      /finite checkpoints/,
      /same ID.*partial|partial.*same ID/is,
      /established host limits/,
      /units.*interpretation.*cadence/is,
      /safe-boundary handoff threshold/,
      /no universal token threshold/,
      /billed input tokens are not context occupancy/,
      /not automatic token detection|do not promise automatic threshold detection/,
      /cooperative.*handoff|handoff.*cooperative/is,
    ])
      assert.match(document, pattern);
  }
});

test("local records have safe storage admission and complete separate source-bound templates", () => {
  for (const document of [skill, pseudocode]) {
    assert.match(document, /repository-local per-change/);
    assert.match(document, /git check-ignore/);
    assert.match(document, /git ls-files/);
    assert.match(document, /physical path/);
    assert.match(document, /pause before writes/i);
    assert.match(document, /revalidate.*storage|revalidate on resume/i);
    assert.match(document, /planning artifacts.*commits/is);
    assert.match(document, /records\.md/);
  }
  for (const heading of [
    "Common envelope and source binding",
    "Plan record",
    "Handoff record",
    "Finding record",
    "Acceptance ledger entry",
  ])
    assert.match(records, new RegExp(`## ${heading}`));
  for (const pattern of [
    /repository\/worktree\/change\/store\/schema/,
    /human task IDs.*CLI-ID mapping/,
    /requirements\/contracts/,
    /before\/after/,
    /exact command, cwd/,
    /exit\/result, covered scope/,
    /remaining work\/blockers/,
    /implementation \| checks \| semantic acceptance \| bookkeeping/,
    /base revision\/HEAD \(or unborn\)/,
    /SHA-256/,
    /index\/staged/,
    /working-tree hash/,
    /dirty\/staged state/,
    /untracked source/,
    /deletions.*absent/s,
    /shared\/prerequisite contracts/,
    /dependencies\/check configuration/,
    /environment\/prerequisite assumptions/,
    /assigned\/implemented\/completed\/remaining IDs/,
    /actual changed files/,
    /reproduction\/failing regression or explicit limitation/,
    /independent reviewer/,
    /fresh apply progress/,
    /affected.*dependents/,
  ])
    assert.match(records, pattern);
  assert.ok(
    pseudocode.indexOf("git check-ignore") <
      pseudocode.indexOf("SAVE and PAUSE"),
  );
});

test("every writer path waits for termination and subprocess quiescence", () => {
  for (const document of [skill, pseudocode]) {
    assert.match(document, /writer termination/);
    assert.match(document, /no surviving subprocess can mutate source/);
    assert.match(
      document,
      /returned summary alone is not subprocess quiescence/i,
    );
    assert.match(document, /established host capabilities/);
    assert.match(document, /invent no stop API/);
    assert.match(document, /interrupted writer.*uncertain/is);
    assert.match(document, /correction/);
  }
  for (const dispatch of [
    "repair = DELEGATE",
    "DELEGATE(Correction",
    "DELEGATE(Bookkeeping",
    "implementation = DELEGATE",
  ]) {
    const offset = pseudocode.indexOf(dispatch);
    assert.ok(offset > 0);
    assert.match(
      pseudocode.slice(Math.max(0, offset - 200), offset),
      /REQUIRE_QUIESCENCE\(\)/,
    );
  }
  assert.match(
    pseudocode,
    /PERSIST.*handoff[\s\S]*LEAVE partial\/unfinished\/unverified tasks pending/,
  );
});

test("reconciliation selectively invalidates evidence and corrects stale bookkeeping", () => {
  for (const document of [skill, pseudocode, records]) {
    assert.match(document, /untracked source/);
    assert.match(document, /deletions|deleted state/);
    assert.match(document, /shared contracts|shared\/prerequisite contracts/);
    assert.match(document, /check configuration/);
    assert.match(document, /assumptions/);
    assert.match(
      document,
      /uncertain impact invalidates the affected boundary|affected boundary when impact is uncertain/,
    );
    assert.match(document, /unrelated completed tasks/);
    assert.match(document, /checkbox-only/);
    assert.match(
      document,
      /task meaning\/requirement edits|task meaning or requirement edits|task meaning or requirement mapping/,
    );
    assert.match(
      document,
      /fresh independent review\/reacceptance|refresh checks\/independent review|re-review/,
    );
  }
  assert.match(skill, /HEAD-only equality are not current acceptance/);
  assert.match(pseudocode, /FREEZE affected dependents immediately/);
  assert.match(pseudocode, /REDISCOVER\/rerun affected commands/);
  assert.match(pseudocode, /CAPTURE source binding before review/);
  assert.match(pseudocode, /CAPTURE source binding after review/);
  assert.match(pseudocode, /before\/after checks/);
  assert.match(pseudocode, /invocation\/resume, even all-done/);
});

test("continuity probes cover telemetry, storage, writers and selective source invalidation", () => {
  const cases = JSON.parse(read(`${suiteRoot}cases.json`));
  const expectations = JSON.parse(read(`${suiteRoot}expectations.json`));
  const pair = (id) => ({
    input: JSON.stringify(cases.cases.find((entry) => entry.id === id)),
    rubric: JSON.stringify(expectations.cases.find((entry) => entry.id === id)),
  });
  for (let n = 5; n <= 14; n++)
    assert.ok(
      cases.cases.some(({ id }) => id === `case-${String(n).padStart(2, "0")}`),
    );
  assert.match(pair("case-05").input, /cumulative billing/);
  assert.match(pair("case-06").input, /78 percent.*80 percent/);
  assert.match(pair("case-07").rubric, /pause before writes/);
  assert.match(pair("case-08").input, /no surviving subprocess/);
  assert.match(
    pair("case-09").rubric,
    /replacement, repair, checkbox correction and bookkeeping/,
  );
  assert.match(pair("case-10").rubric, /retain unchanged scoped acceptance/);
  assert.match(pair("case-11").rubric, /despite equal HEAD/);
  assert.match(pair("case-12").rubric, /command\/configuration change/);
  assert.match(pair("case-13").rubric, /untracked shared source content/);
  assert.match(pair("case-14").rubric, /deletion\/absent marker/);
  const materializer = read(`${suiteRoot}materialize.mjs`);
  assert.match(materializer, /safeFiles\(indexFiles\)/);
  assert.match(materializer, /update-index/);
  assert.match(materializer, /indexedFiles\[path\].*sha256/);
});

test("source-bound repairs use fresh reviewer-controlled targeted scope or justified expansion", () => {
  for (const document of [skill, pseudocode]) {
    for (const pattern of [
      /stable ID/,
      /violated requirement\/task/,
      /file\/line/,
      /reproduction\/failing regression or explicit limitation/,
      /expected behavior/,
      /affected contracts\/dependents/,
      /regression scope/,
      /independent source-bound investigation/,
      /fresh independent read-only.*repair reviewer/is,
      /actual repair.*reproduction\/regression/is,
      /reviewer controls.*scope|reviewer-controlled/i,
      /why targeted coverage is sufficient/,
      /architecture changes.*widened scope.*changed shared assumptions.*invalidated evidence.*uncertain impact/is,
      /affected boundary and dependent contracts or wider scope/,
      /whole group's review/,
      /unaffected evidence/,
      /same findings recur with no edits and no new evidence/,
      /genuine design\/product\/architecture.*authorization/is,
    ])
      assert.match(document, pattern);
  }
  assert.match(pseudocode, /verification = REPAIR_VERIFY/);
  assert.match(pseudocode, /repaired = REPAIR_VERIFY/);
  assert.match(
    pseudocode,
    /invalidated\/incomplete or has no actionable technical findings/,
  );
  assert.match(
    pseudocode,
    /missing acceptance is not an empty, already-resolved repair/,
  );
  assert.match(
    skill,
    /invalidated acceptance without an actionable technical finding requires fresh inspection/,
  );
  assert.match(records, /reviewer-controlled scope.*targeted sufficiency/);
});

test("Finish always requires fresh final commands, independent integrated review and current apply", () => {
  const finish = pseudocode.slice(pseudocode.indexOf("Finish:\n"));
  for (const document of [skill, finish]) {
    assert.match(
      document,
      /required.*repository-wide.*checks|checks.*repository-wide/is,
    );
    assert.match(
      document,
      /fresh independent read-only.*integrated|integrated.*fresh independent read-only/is,
    );
    assert.match(document, /integrated semantic review/);
    assert.match(document, /current apply status confirms completion/);
    assert.match(document, /intermediate acceptance.*cannot substitute/is);
    assert.match(
      document,
      /blocking findings.*blocked required checks.*stale prerequisite acceptance/is,
    );
    assert.match(
      document,
      /pre-repair integrated result cannot authorize a changed contract/,
    );
    assert.match(document, /affected.*final checks.*review/is);
    assert.match(document, /scope justification/);
  }
  assert.match(
    pseudocode,
    /resumed all-done.*fresh final checks AND integrated semantic review/is,
  );
  assert.match(finish, /refresh_scope = whole change/);
  assert.match(finish, /CAPTURE source binding before final checks\/review/);
  assert.match(finish, /CAPTURE source binding after final checks\/review/);
  const checksEnd = finish.indexOf("integrated = DELEGATE");
  assert.match(
    finish.slice(finish.indexOf("final_checks = DELEGATE"), checksEnd),
    /REQUIRE_QUIESCENCE\(\)/,
  );
  const completion = finish.indexOf("REPORT verified completion");
  assert.ok(completion > finish.indexOf("final_checks = DELEGATE"));
  assert.ok(completion > finish.indexOf("integrated = DELEGATE"));
  assert.ok(completion > finish.indexOf("current_apply = READ fresh apply"));
  assert.match(
    finish.slice(0, completion),
    /independently accepted AND bookkept/,
  );
});

test("reports distinguish evidence stages and preserve separate delivery authorization", () => {
  const reporting = skill.slice(
    skill.indexOf("## Reporting and authorization"),
  );
  for (const pattern of [
    /remaining implementation task IDs/,
    /actual changed files/,
    /boundary coverage/,
    /evidence freshness/,
    /retained\/invalidated evidence/,
    /required refresh/,
    /commands\/results\/covered scope/,
    /host limitations/,
    /proposed steps.*observed actions/is,
    /structural checks.*semantic\/runtime evidence/is,
    /partial progress.*completion/is,
  ])
    assert.match(reporting, pattern);
  for (const document of [skill, pseudocode]) {
    for (const pattern of [
      /implementation acceptance grants no delivery authorization/i,
      /committing, pushing, spec syncing and archiving remain separate authorized requests/i,
      /explicit prior authorization and its conditions/,
      /separately authorized procedure after required verification/,
    ])
      assert.match(document, pattern);
  }
});

test("current-task-status report requires filled per-ID states and truthful provenance at every exit", () => {
  const reporting = skill.slice(
    skill.indexOf("## Reporting and authorization"),
  );
  for (const pattern of [
    /On completion, pause, or handoff, fill/,
    /report is complete only when every relevant exact task ID/,
    /CLI\/human mapping/,
    /current implementation, checks, independent semantic acceptance, and bookkeeping states/,
    /reasons and evidence\/provenance references/,
    /observed source\/checks, supplied historical claims, and independently produced acceptance/,
    /explicit `none` for empty ID sets and `unknown`.*unestablished states or provenance/s,
    /never invent historical acceptance/,
    /observed checkbox state from verified bookkeeping/,
    /Separate remaining implementation task IDs from pending independent acceptance, bookkeeping, and final-assurance work/,
    /Checked counts or proposed future record fields are not substitutes for filled current states/,
  ])
    assert.match(reporting, pattern);
  for (const document of [pseudocode, records])
    assert.match(
      document,
      /\[current-task-status report contract\]\(\.\.\/SKILL\.md#reporting-and-authorization\)/,
    );
  assert.match(
    pseudocode,
    /REPORT \(on completion, pause or handoff\):\s+FILL the current-task-status report[\s\S]*?satisfy its completion criterion/,
  );
  assert.match(records, /report reference: filled current-task-status report/);
  assert.match(records, /unfilled record template is not a current report/);
});

test("manual probe procedure guards implicit Git writes and retains raw metadata evidence", () => {
  const procedure = read(`${suiteRoot}README.md`);
  for (const pattern of [
    /NEW run.*wrapper must enforce generic compatible no-write/s,
    /without changing the neutral `prompt\.txt`/,
    /Every shell containing Git or OpenSpec must inherit\s+`GIT_OPTIONAL_LOCKS=0` before its first command/,
    /chained commands and\s+indirect Git subprocesses/,
    /every direct `git diff` invocation/,
    /git -c diff\.autoRefreshIndex=false diff --no-ext-diff --no-textconv/,
    /command-scoped controls leave existing repository\/global configuration intact/,
    /not a universal no-write guarantee/,
    /earlier wrappers, requests, captures and grades immutable/,
    /Before any candidate inspection command and after candidate\/subprocess\s+termination/,
    /raw pre\/post Git metadata inventories/,
    /presence\/absence,\s+path, type, mode and content hashes/,
    /preserve original metadata\/index bytes/,
    /do not normalize stat-cache fields/,
    /Metadata writes have no exception to the no-write contract/,
  ])
    assert.match(procedure, pattern);
});

test("implementation disclosed reference links resolve within distributed skill", () => {
  const paths = [
    "skills/orc-openspec-implement/SKILL.md",
    "skills/orc-openspec-implement/references/pseudocode.md",
    "skills/orc-openspec-implement/references/records.md",
  ];
  for (const path of paths) {
    for (const [, target] of read(path).matchAll(
      /\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)/g,
    )) {
      assert.ok(target.startsWith("."), `${path}: reference must be portable`);
      assert.ok(
        existsSync(join(root, dirname(path), target)),
        `${path}: ${target}`,
      );
    }
  }
  assert.match(skill, /\(\.\/references\/records\.md\)/);
  assert.match(skill, /\(\.\/references\/pseudocode\.md\)/);
});

test("manual repair, final and delivery probes cover distinct failure and resume decisions", () => {
  const cases = JSON.parse(read(`${suiteRoot}cases.json`));
  const expectations = JSON.parse(read(`${suiteRoot}expectations.json`));
  const pair = (id) => ({
    input: JSON.stringify(cases.cases.find((entry) => entry.id === id)),
    rubric: JSON.stringify(expectations.cases.find((entry) => entry.id === id)),
  });
  for (let n = 15; n <= 21; n++) {
    const id = `case-${n}`;
    assert.ok(cases.cases.some((entry) => entry.id === id));
    assert.ok(expectations.cases.some((entry) => entry.id === id));
  }
  assert.match(pair("case-15").rubric, /justifies targeted sufficiency/);
  assert.match(pair("case-16").input, /key\.trim/);
  assert.match(
    pair("case-16").rubric,
    /affected boundary and dependent contracts/,
  );
  assert.match(
    pair("case-17").rubric,
    /missing reproduction or regression limitation/,
  );
  assert.match(pair("case-18").input, /tests\/busy\.test\.mjs/);
  assert.match(
    pair("case-18").rubric,
    /refresh affected independent integrated review/,
  );
  assert.match(
    pair("case-19").rubric,
    /resumed all-done to Finish without ordinary implementation workers/,
  );
  assert.match(pair("case-20").rubric, /conditional sync\/archive approval/);
  assert.match(pair("case-21").rubric, /no edits and no new evidence/);
  assert.match(
    read(`${suiteRoot}README.md`),
    /cases 15–21 as repair\/final\/authorization/,
  );
});
