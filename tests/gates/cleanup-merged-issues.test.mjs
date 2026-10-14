import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Model-free documentation-contract checks only. These read text and examples;
// they do not execute cleanup, enforce quiescence, or prove live agent adherence.
const root = new URL("../../", import.meta.url);
const skill = readFileSync(
  new URL("skills/cleanup-merged-issues/SKILL.md", root),
  "utf8",
);
const spec = readFileSync(
  new URL("openspec/specs/merged-issue-cleanup/spec.md", root),
  "utf8",
);

function section(document, heading, nextHeading) {
  const start = document.indexOf(heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const end = document.indexOf(nextHeading, start + heading.length);
  return document.slice(start, end === -1 ? undefined : end);
}

function scenario(name) {
  return section(spec, `#### Scenario: ${name}\n`, "\n#");
}

const preview = section(skill, "## Preview and confirm", "## Clean up");
const removal = section(skill, "## Clean up approved candidates", "## Finish");
const resume = section(
  skill,
  "## Finish and resume",
  "## Confirmation examples",
);
const examples = section(skill, "## Confirmation examples", "\n## ");

function example(name) {
  const row = examples
    .split("\n")
    .find((line) => line.startsWith(`| ${name} |`));
  assert.ok(row, `missing confirmation example: ${name}`);
  const cells = row
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  assert.equal(cells.length, 3, "example must include state and next action");
  return { state: cells[1], action: cells[2] };
}

function includesAll(document, phrases) {
  for (const phrase of phrases) {
    assert.ok(document.includes(phrase), `contract must retain: ${phrase}`);
  }
}

test("one continuing assertion covers uninterrupted removal of all named targets", () => {
  includesAll(preview, [
    "every selected target worktree covered by the assertion",
    "will remain stopped through completion",
    "One explicit approval of the previewed snapshot",
    "covers uninterrupted execution for all those targets",
    "Approval and the assertion may arrive together or separately",
  ]);
  includesAll(removal, [
    "assess whether the recorded continuing stopped-writers assertion remains applicable",
    "Routine automated checks, completed pruning, and transitions to another unchanged approved target do not alone require another human assertion",
    "A target not covered by the recorded assertion requires an explicit assertion for that target",
  ]);
  assert.doesNotMatch(removal, /reconfirm with the operator/);
  const contract = scenario(
    "Continuing assertion covers uninterrupted multi-target removal",
  );
  includesAll(contract, [
    "every selected target",
    "single approval and assertion",
    "SHALL NOT alone require another human assertion",
  ]);
  const sample = example("Uninterrupted multi-target");
  includesAll(sample.state, [
    "issue-71",
    "issue-72",
    "All writers to both",
    "remain stopped through removal",
    "Pruning succeeds",
  ]);
  includesAll(sample.action, [
    "each covered target after its immediate checks",
    "no second quiescence prompt",
    "transition to issue-72",
  ]);
});

test("generic approval asks only for the missing assertion, retaining unchanged approval", () => {
  includesAll(preview, [
    "Generic cleanup approval does not imply",
    "retain otherwise unchanged snapshot approval",
    "pause worktree removal and preserve its branch",
    "request only the missing assertion",
  ]);
  includesAll(scenario("Generic approval omits the assertion"), [
    "go ahead",
    "preserve the snapshot approval",
    "request only the missing stopped-writers assertion",
    "not repeat snapshot approval",
  ]);
  includesAll(scenario("Quiescence is not established"), [
    "before removal began",
    "request only the missing assertion",
  ]);
  const sample = example("Missing assertion");
  includesAll(sample.state, ["Go ahead", "No stopped-writers assertion"]);
  includesAll(sample.action, [
    "Retain unchanged snapshot approval",
    "pause worktree removal",
    "request only the missing assertion",
  ]);
});

test("immediate automated identity, eligibility, and configuration checks remain operative", () => {
  includesAll(removal, [
    "Immediately before each worktree or branch removal",
    "repository/remote identity, PR merge/head state, local and remote tips, worktree paths/associations, locks, and exclusions",
    "Immediately before each worktree removal, re-establish the applicable effective status configuration",
    "Inspect's context-equivalence prerequisite",
    "approval-bound evidence/configuration is unchanged",
    "quiescence remains established",
  ]);
  includesAll(
    scenario("Recheck identities and eligibility before each removal"),
    [
      "Each removal SHALL recheck",
      "repository/remote identity",
      "PR merge/head state",
      "worktree paths/associations",
      "lock state, and exclusions",
    ],
  );
  includesAll(
    scenario("Recheck configuration and quiescence immediately before removal"),
    [
      "Immediately before each worktree removal",
      "re-establish the applicable effective status configuration",
      "assertion remains applicable",
      "rather than automatically requesting another human assertion",
    ],
  );
});

test("changed bound evidence invalidates approval instead of broadening removal authority", () => {
  includesAll(removal, [
    "Changed approval-bound evidence invalidates approval",
    "skip it and report the reason",
    "Only reconciliation that re-establishes eligibility permits a fresh preview",
    "renewed consent does not bypass eligibility or configuration prerequisites",
  ]);
  includesAll(
    scenario("Recheck identities and eligibility before each removal"),
    [
      "invalidate that candidate's approval",
      "skip it",
      "reconciliation that establishes eligibility",
    ],
  );
  includesAll(scenario("Tip changes after approval"), [
    "skips it",
    "rather than deleting the newly changed ref",
  ]);
  const sample = example("Changed evidence");
  includesAll(sample.state, ["tip no longer matches", "merged PR head"]);
  includesAll(sample.action, [
    "Invalidate affected approval",
    "skip and preserve",
    "only if reconciliation re-establishes eligibility",
  ]);
});

test("configuration changes renew confirmation even if safe and cannot bypass blockers", () => {
  includesAll(removal, [
    "Changed configuration results or applicability evidence/context invalidate affected approval",
    "fresh preview",
    "even if still safe",
    "Unsafe/unknown configuration",
    "do not mutate configuration or inject overrides",
  ]);
  includesAll(
    scenario("Recheck configuration and quiescence immediately before removal"),
    [
      "invalidate affected approval",
      "fresh applicable confirmation",
      "renewed consent SHALL NOT bypass eligibility or configuration prerequisites",
    ],
  );
  includesAll(scenario("Safe configuration changes after approval"), [
    "`normal` to `all`",
    "applicability evidence/context changes",
    "pause the affected removal and preserve its branch",
    "fresh preview, snapshot approval, and explicit continuing stopped-writers assertion",
  ]);
  const sample = example("Changed configuration");
  includesAll(sample.state, [
    "`normal` to `all`",
    "applicability evidence/context",
  ]);
  includesAll(sample.action, [
    "despite a safe value",
    "fresh snapshot approval",
    "continuing stopped-writers assertion",
    "Unsafe/unknown configuration remains blocked",
  ]);
});

test("interruption or a pause renews the assertion without repeating completed effects", () => {
  includesAll(resume, [
    "On interruption or a pause in the removal sequence, re-inventory",
    "Do not repeat completed pruning or removals",
    "Preserve original approved identities",
    "obtain renewed explicit stopped-writers confirmation covering every remaining target",
    "even when unchanged snapshot approval still applies",
    "without retrying a refused worktree removal",
  ]);
  includesAll(
    scenario("Resume unchanged approval after interruption or pause"),
    [
      "even with unchanged remaining targets",
      "re-inventory and reconcile",
      "renewed explicit stopped-writers confirmation",
      "fresh snapshot approval SHALL be required for changed/new candidates only after eligibility and configuration prerequisites are satisfied",
    ],
  );
  includesAll(scenario("One candidate was removed before interruption"), [
    "without repeating completed pruning or removals",
  ]);
  const sample = example("Interrupted or paused");
  includesAll(sample.state, [
    "first removal completed",
    "interruption or a pause",
    "unchanged second target",
  ]);
  includesAll(sample.action, [
    "retain unchanged approved identities",
    "do not repeat completed effects",
    "renew the explicit stopped-writers assertion",
    "before immediate checks and removal",
  ]);
});

test("uncertain or lost quiescence pauses removal and requires renewed confirmation", () => {
  includesAll(removal, [
    "absent, uncertain, or lost quiescence pauses that removal and preserves its branch",
  ]);
  includesAll(preview, [
    "Uncertain or lost quiescence requires reconciliation and renewed explicit confirmation",
  ]);
  includesAll(scenario("Writer quiescence becomes uncertain or is lost"), [
    "may have resumed or is known to be writing",
    "pause that removal and preserve its branch",
    "reconciliation and renewed explicit continuing stopped-writers confirmation",
    "unchanged snapshot approval alone SHALL NOT authorize removal",
  ]);
  const sample = example("Uncertain or lost quiescence");
  includesAll(sample.state, ["may have restarted", "known to be writing"]);
  includesAll(sample.action, [
    "Pause removal and preserve the branch",
    "renewed explicit continuing stopped-writers confirmation",
    "Unchanged refs alone do not permit proceeding",
  ]);
});

test("existing safety guards remain documented independently of assertion lifetime", () => {
  includesAll(skill, [
    "disable-model-invocation: true",
    "Invocation itself is not confirmation",
    "ask separately before a prune-only operation",
    "exactly one matching PR is merged",
    "local tip equals that PR's recorded head SHA",
    "require its tip to equal the same SHA",
    "Skip those worktrees, missing/prunable records, inaccessible or locked worktrees",
    "Ignored files present: N reported paths — deleted by removal",
    "separate, non-atomic operations",
    "inherited `GIT_CONFIG` can redirect `git config` to a decoy file",
    "Accept only unset (Git's default `normal`), `normal`, or `all`",
    "git fetch --prune <verified-remote>` once per invocation",
    "prune only stale remote-tracking branch refs",
    "no `--force`, unlocking, direct filesystem deletion",
    "preserve the branch, report the blocker, and do not retry removal",
    "git branch -D <branch>` only for that approved, unchanged ref",
  ]);
  includesAll(spec, [
    "without treating invocation as authorization to delete or prune",
    "local tip equal to the authoritative PR head SHA",
    "skip the current session's worktree, the main worktree, missing/prunable records",
    "Ignored files SHALL NOT gate eligibility",
    "separate, non-atomic operations",
    "prune only stale remote-tracking branch refs",
    "without force, unlocking, or filesystem deletion performed by the skill",
    "git refusal SHALL be treated as fresh evidence and not retried",
    "for that approved unchanged branch, not blanket force retries",
  ]);
});

test("examples disclose model-free limits rather than claiming live adherence", () => {
  includesAll(examples, [
    "model-free text checks do not establish live agent adherence or enforce quiescence",
  ]);
});
