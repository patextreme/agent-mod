import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  append,
  createRun,
  replay,
} from "../../skills/pr-review-repair/references/lifecycle.mjs";

test("CLI persists guarded boundaries and refuses overwrite, stale revisions and skipped preparation", () => {
  const dir = mkdtempSync(join(tmpdir(), "lifecycle-"));
  const cli = fileURLToPath(
    new URL(
      "../../skills/pr-review-repair/references/lifecycle.mjs",
      import.meta.url,
    ),
  );
  const statePath = join(dir, "state.json");
  const inputPath = join(dir, "input.json");
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  try {
    writeFileSync(inputPath, JSON.stringify(contract));
    assert.equal(run("init", statePath, inputPath).status, 0);
    const before = readFileSync(statePath, "utf8");
    assert.notEqual(run("init", statePath, inputPath).status, 0);
    writeFileSync(
      inputPath,
      JSON.stringify({
        type: "start",
        revision: 0,
        stage: "review",
        observed: { base: "base", head: "h1", remoteHead: "h1" },
      }),
    );
    assert.notEqual(run("apply", statePath, inputPath).status, 0);
    assert.equal(readFileSync(statePath, "utf8"), before);
    writeFileSync(
      inputPath,
      JSON.stringify({
        type: "start",
        revision: 0,
        stage: "prepare",
        observed: { base: "base", head: "h1", remoteHead: "h1" },
      }),
    );
    assert.equal(run("apply", statePath, inputPath).status, 0);
    assert.notEqual(run("apply", statePath, inputPath).status, 0);
    const shown = JSON.parse(run("show", statePath).stdout);
    assert.equal(shown.counts.prepare, 1);
    assert.equal(shown.revision, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const contract = {
  runId: "run-100",
  pr: "repo/pull/100",
  base: "base",
  head: "h1",
};
function event(journal, type, fields = {}) {
  const state = replay(journal);
  return append(journal, {
    type,
    revision: journal.events.length,
    observed: {
      base: state.base,
      head:
        type === "result" &&
        state.active?.effect === "commit" &&
        fields.complete
          ? fields.commitHead
          : state.head,
      remoteHead:
        type === "result" && state.active?.effect === "push" && fields.complete
          ? fields.remoteHead
          : state.remoteHead,
    },
    ...fields,
  });
}
function stage(journal, name, result = {}) {
  return event(event(journal, "start", { stage: name }), "result", {
    complete: true,
    record: `${name}-evidence`,
    ...result,
  });
}
function prepared(options = {}) {
  return stage(createRun({ ...contract, ...options }), "prepare");
}
const reviewEvidence = {
  evidence: { head: "h1", standards: true, spec: true, checks: "pass" },
};

test("a clean first round converges without spending a second round", () => {
  let journal = prepared();
  journal = stage(journal, "review", reviewEvidence);
  journal = stage(journal, "judge", { findings: [], checks: "pass" });
  journal = event(journal, "start", { stage: "deliver", effect: "comment" });
  journal = event(journal, "result", {
    complete: true,
    record: "read-back",
    receipt: "https://example/comment/1",
  });
  journal = event(journal, "finish");
  const state = replay(journal);
  assert.equal(state.outcome, "verified");
  assert.equal(state.rounds, 1);
  assert.equal(state.remaining, 2);
  assert.throws(() => event(journal, "start", { stage: "review" }), /finished/);
});

test("a deferred-only converged round reports limited coverage, never verified", () => {
  let journal = stage(stage(prepared(), "review", reviewEvidence), "judge", {
    findings: [
      {
        id: "F1",
        status: "deferred",
        evidence: "pre-existing bug outside this PR's scope",
      },
    ],
    checks: "pass",
  });
  const judged = replay(journal);
  assert.equal(judged.stage, "deliver");
  assert.equal(judged.pending.outcome, "limited coverage");
  assert.equal(judged.repairCycles, 0);
  assert.equal(judged.remaining, 2);
  journal = event(journal, "start", { stage: "deliver", effect: "comment" });
  journal = event(journal, "result", {
    complete: true,
    record: "read-back",
    receipt: "https://example/comment/deferred",
  });
  journal = event(journal, "finish");
  assert.equal(replay(journal).outcome, "limited coverage");
});

test("an unrelated required check keeps a converged round at limited coverage", () => {
  let journal = stage(prepared(), "review", reviewEvidence);
  journal = event(journal, "limit", {
    limit: 1,
    authorization: "maintainer: one total round",
  });
  journal = stage(journal, "judge", { findings: [], checks: "unrelated" });
  const judged = replay(journal);
  assert.equal(judged.stage, "deliver");
  assert.equal(judged.pending.outcome, "limited coverage");
  assert.equal(judged.evidence.checks, "unrelated");
  journal = event(journal, "start", { stage: "deliver", effect: "comment" });
  journal = event(journal, "result", {
    complete: true,
    record: "read-back",
    receipt: "https://example/comment/limitation",
  });
  journal = event(journal, "finish");
  const finished = replay(journal);
  assert.equal(finished.outcome, "limited coverage");
  assert.equal(finished.evidence.checks, "unrelated");
});

const openFinding = {
  id: "F1",
  status: "open",
  evidence: "required behavior fails",
};
function found(options = {}) {
  return stage(stage(prepared(options), "review", reviewEvidence), "judge", {
    findings: [openFinding],
    checks: "pass",
  });
}
function repaired(journal) {
  journal = stage(journal, "repair", { files: ["owned.ts"] });
  return stage(journal, "validate", {
    evidence: { head: replay(journal).head, checks: "pass" },
    inspected: true,
  });
}
function deliverRepair(journal, head = "h2") {
  journal = event(journal, "start", { stage: "deliver", effect: "commit" });
  journal = event(journal, "result", {
    complete: true,
    record: "signed outgoing range",
    receipt: "commit-receipt",
    commitHead: head,
    signed: true,
    outgoingVerified: true,
  });
  journal = event(journal, "start", { stage: "deliver", effect: "push" });
  journal = event(journal, "result", {
    complete: true,
    record: "remote read-back",
    receipt: "push-receipt",
    remoteHead: head,
  });
  journal = event(journal, "start", { stage: "deliver", effect: "comment" });
  return event(journal, "result", {
    complete: true,
    record: "comment read-back",
    receipt: "https://example/comment/repair",
  });
}

test("three actual discovery/repair rounds exhaust the default window, never permitting a fourth", () => {
  let journal = prepared();
  for (let round = 1; round <= 3; round++) {
    journal = stage(journal, "review", {
      evidence: { ...reviewEvidence.evidence, head: `h${round}` },
    });
    journal = stage(journal, "judge", {
      findings: [openFinding],
      checks: "pass",
    });
    journal = deliverRepair(repaired(journal), `h${round + 1}`);
  }
  assert.equal(replay(journal).rounds, 3);
  assert.equal(replay(journal).counts.review, 3);
  assert.equal(replay(journal).remaining, 0);
  assert.equal(replay(journal).stage, "verify");
  assert.throws(() => event(journal, "start", { stage: "review" }), /boundary/);
});

test("a shorter total window preserves consumed rounds and requires bounded verification", () => {
  let journal = found();
  journal = event(journal, "limit", {
    limit: 1,
    authorization: "maintainer: one total round",
  });
  assert.equal(replay(journal).rounds, 1);
  assert.equal(replay(journal).remaining, 0);
  journal = deliverRepair(repaired(journal));
  assert.equal(replay(journal).stage, "verify");
  assert.throws(() => event(journal, "start", { stage: "review" }), /boundary/);
  journal = stage(journal, "verify", {
    findings: [
      { id: "F1", status: "resolved", evidence: "targeted regression passes" },
    ],
    evidence: { head: "h2", checks: "pass" },
  });
  journal = event(journal, "start", { stage: "deliver", effect: "comment" });
  journal = event(journal, "result", {
    complete: true,
    record: "final read-back",
    receipt: "https://example/comment/final",
  });
  journal = event(journal, "finish");
  assert.equal(replay(journal).outcome, "limited coverage");
  assert.equal(replay(journal).counts.repair, 1);
});

test("a crash-reloaded round resumes its original attempt and cumulative counts", () => {
  const persisted = event(prepared({ limit: 1 }), "start", { stage: "review" });
  let journal = JSON.parse(JSON.stringify(persisted));
  const interrupted = replay(journal);
  assert.equal(interrupted.paused, null);
  journal = event(journal, "pause", {
    reason: "worker interrupted before result",
  });
  const snapshot = replay(journal);
  assert.throws(
    () =>
      event(journal, "resume", {
        runId: contract.runId,
        counts: { ...snapshot.counts, review: 0 },
        limit: 1,
        stage: "review",
        authorization: "maintainer",
      }),
    /accounting/,
  );
  journal = event(journal, "resume", {
    runId: contract.runId,
    counts: snapshot.counts,
    limit: 1,
    stage: "review",
    authorization: "maintainer",
  });
  assert.deepEqual(replay(journal).active, interrupted.active);
  assert.deepEqual(replay(journal).counts, interrupted.counts);
  assert.equal(replay(journal).rounds, 1);
  journal = event(journal, "result", {
    complete: false,
    record: "Standards done, Spec missing",
    progress: ["standards"],
  });
  journal = stage(journal, "review", reviewEvidence);
  assert.equal(replay(journal).rounds, 1);
  assert.equal(replay(journal).counts.review, 2);
  assert.equal(replay(journal).limit, 1);
});

test("crash reload resumes the persisted repair attempt without allocating another cycle", () => {
  const persisted = event(found({ limit: 1 }), "start", { stage: "repair" });
  let journal = JSON.parse(JSON.stringify(persisted));
  const saved = replay(journal);
  assert.equal(saved.paused, null);
  assert.equal(saved.repair.id, "run-100:repair:1");
  assert.equal(saved.rounds, 1);
  assert.equal(saved.counts.repair, 1);
  assert.equal(saved.repairCycles, 1);
  assert.throws(
    () =>
      event(journal, "resume", {
        runId: saved.runId,
        counts: saved.counts,
        limit: saved.limit,
        stage: saved.stage,
        authorization: "history inspected but interruption not recorded",
      }),
    /resume requires/,
  );
  journal = event(journal, "pause", {
    reason:
      "process crashed after persisted repair start; recover owned artifacts",
  });
  assert.deepEqual(replay(journal).active, saved.active);
  assert.deepEqual(replay(journal).counts, saved.counts);

  journal = event(journal, "resume", {
    runId: saved.runId,
    counts: saved.counts,
    limit: saved.limit,
    stage: saved.stage,
    authorization: "reloaded journal and repair-owned diff inspected",
  });
  const resumed = replay(journal);
  assert.deepEqual(resumed.active, saved.active);
  assert.deepEqual(resumed.repair, saved.repair);
  assert.deepEqual(resumed.counts, saved.counts);
  assert.equal(resumed.rounds, 1);
  assert.equal(resumed.repairCycles, 1);
  assert.equal(resumed.remaining, 0);
  assert.deepEqual(resumed.budgets, saved.budgets);
  journal = event(journal, "result", {
    complete: true,
    record: "recovered repair artifacts independently inspected",
    files: ["owned.ts"],
  });
  journal = stage(journal, "validate", {
    evidence: { head: "h1", checks: "pass" },
    inspected: true,
  });
  assert.equal(replay(journal).stage, "deliver");
  assert.equal(replay(journal).counts.repair, 1);
  assert.equal(replay(journal).repairCycles, 1);
});

test("crash reload recovers an outstanding comment receipt without duplicate delivery or charging", () => {
  let journal = stage(stage(prepared(), "review", reviewEvidence), "judge", {
    findings: [],
    checks: "pass",
  });
  journal = event(journal, "start", { stage: "deliver", effect: "comment" });
  journal = JSON.parse(JSON.stringify(journal));
  const saved = replay(journal);
  assert.equal(saved.paused, null);
  assert.equal(saved.counts.deliver, 1);
  const receipt = "https://example/comment/recovered";

  journal = event(journal, "pause", {
    reason: "crash after publication; verified comment read-back available",
  });
  assert.deepEqual(replay(journal).active, saved.active);
  journal = event(journal, "result", {
    complete: true,
    record: "verified publication recovery manifest",
    receipt,
  });
  const recovered = replay(journal);
  assert.equal(recovered.stage, "finish");
  assert.equal(recovered.pending.id, saved.pending.id);
  assert.equal(recovered.pending.receipts.comment, receipt);
  assert.equal(recovered.deliveries.length, 1);
  assert.deepEqual(recovered.counts, saved.counts);
  assert.throws(
    () =>
      event(journal, "resume", {
        runId: saved.runId,
        counts: saved.counts,
        limit: saved.limit,
        stage: saved.stage,
        authorization: "stale stage before receipt recovery",
      }),
    /accounting/,
  );
  journal = event(journal, "resume", {
    runId: recovered.runId,
    counts: recovered.counts,
    limit: recovered.limit,
    stage: recovered.stage,
    authorization: "verified recovered publication and journal suffix",
  });
  assert.throws(
    () => event(journal, "start", { stage: "deliver", effect: "comment" }),
    /boundary/,
  );
  journal = event(journal, "finish");
  const terminal = replay(JSON.parse(JSON.stringify(journal)));
  assert.equal(terminal.outcome, "verified");
  assert.equal(terminal.rounds, 1);
  assert.equal(terminal.repairCycles, 0);
  assert.deepEqual(terminal.counts, saved.counts);
  assert.equal(terminal.deliveries.length, 1);
  assert.throws(
    () => event(journal, "pause", { reason: "reload" }),
    /finished/,
  );
});

test("non-advancing continuations and exhausted preparation cannot loop on resume", () => {
  let journal = event(
    createRun({ ...contract, budgets: { prepare: 1 } }),
    "start",
    { stage: "prepare" },
  );
  journal = event(journal, "result", {
    complete: false,
    record: "access blocked",
    progress: [],
  });
  assert.match(replay(journal).paused, /progress|budget/);
  const s = replay(journal);
  journal = event(journal, "resume", {
    runId: s.runId,
    counts: s.counts,
    limit: s.limit,
    stage: s.stage,
    authorization: "access restored",
  });
  assert.throws(() => event(journal, "start", { stage: "prepare" }), /budget/);

  journal = event(prepared(), "start", { stage: "review" });
  journal = event(journal, "result", {
    complete: false,
    record: "partial",
    progress: ["file-a"],
  });
  journal = event(journal, "start", { stage: "review" });
  journal = event(journal, "result", {
    complete: false,
    record: "same output",
    progress: ["file-a"],
  });
  assert.match(replay(journal).paused, /progress/);
  assert.equal(replay(journal).rounds, 1);
  assert.throws(() => event(journal, "finish"), /paused/);
});

test("PR-caused check failures authorize repair, never a clean completion", () => {
  let journal = stage(prepared(), "review", reviewEvidence);
  journal = stage(journal, "judge", {
    findings: [openFinding],
    checks: "failed",
  });
  assert.equal(replay(journal).stage, "repair");
  assert.throws(() => event(journal, "finish"), /finish evidence/);
  journal = stage(journal, "repair", { files: ["owned.ts"] });
  journal = event(journal, "start", { stage: "validate" });
  assert.throws(
    () =>
      event(journal, "result", {
        complete: true,
        record: "checks still failing",
        inspected: true,
        evidence: { head: "h1", checks: "failed" },
      }),
    /required checks/,
  );
});

test("an unrelated required check is accepted mid-window without closing discovery", () => {
  let journal = found();
  assert.equal(replay(journal).stage, "repair");
  journal = stage(journal, "repair", { files: ["owned.ts"] });
  journal = stage(journal, "validate", {
    evidence: { head: "h1", checks: "unrelated" },
    inspected: true,
  });
  const delivered = replay(journal);
  assert.equal(delivered.stage, "deliver");
  assert.equal(delivered.limit, 3);
  assert.equal(delivered.rounds, 1);
  assert.equal(delivered.remaining, 2);
  assert.equal(delivered.evidence.checks, "unrelated");
});

test("an answered environmental escalation re-enters the same window honestly", () => {
  const answer = "human: environmental, proceed and report the limitation";
  let journal = stage(prepared(), "review", reviewEvidence);
  journal = event(journal, "pause", {
    reason: "unrelated required check: CI runner image unavailable",
  });
  journal = event(journal, "notice-start");
  journal = event(journal, "notice-result", {
    complete: true,
    record: "escalation read-back",
    receipt: "https://example/comment/escalation-1",
  });
  journal = event(journal, "reconcile", {
    authorization: answer,
    observed: { base: "base", head: "h1", remoteHead: "h1" },
  });
  const reconciled = replay(journal);
  assert.equal(reconciled.stage, "review");
  assert.equal(reconciled.limit, 3);
  journal = event(journal, "pause", {
    reason: "post-reconcile recovery boundary",
  });
  journal = event(journal, "resume", {
    runId: reconciled.runId,
    counts: reconciled.counts,
    limit: reconciled.limit,
    stage: reconciled.stage,
    authorization: answer,
  });
  journal = stage(journal, "review", reviewEvidence);
  journal = stage(journal, "judge", { findings: [], checks: "unrelated" });
  const judged = replay(journal);
  assert.equal(judged.stage, "deliver");
  assert.equal(judged.limit, 3);
  assert.equal(judged.rounds, 1);
  assert.equal(judged.remaining, 2);
  assert.equal(judged.pending.outcome, "limited coverage");
  assert.ok(
    journal.events.some((e) => e.authorization === answer),
    "the human answer is recorded in the journal",
  );
  assert.ok(
    journal.events.every((e) => e.type !== "limit"),
    "recovery never shortens the window",
  );
  journal = event(journal, "start", { stage: "deliver", effect: "comment" });
  journal = event(journal, "result", {
    complete: true,
    record: "final read-back",
    receipt: "https://example/comment/final-limitation",
  });
  journal = event(journal, "finish");
  const finished = replay(journal);
  assert.equal(finished.outcome, "limited coverage");
  assert.equal(finished.evidence.checks, "unrelated");
});

test("a repair-caused check regression stays repairable after discovery closes", () => {
  let journal = deliverRepair(repaired(found({ limit: 1 })));
  journal = stage(journal, "verify", {
    findings: [openFinding],
    evidence: { head: "h2", checks: "failed" },
  });
  assert.equal(replay(journal).stage, "repair");
  assert.equal(replay(journal).failures.F1, 1);
});

test("finite dispatch bounds and complete default budgets are persisted, not reallocated on retry", () => {
  const journal = createRun({ ...contract, maxTurns: 8 });
  assert.equal(journal.contract.budgets.deliver, 24);
  assert.equal(journal.contract.limit, 3);
  assert.equal(journal.contract.maxTurns, 8);
  assert.throws(
    () => event(journal, "start", { stage: "prepare", maxTurns: 9 }),
    /turn/,
  );
  assert.throws(
    () => createRun({ ...contract, budgets: { prepare: Infinity } }),
    /finite/,
  );
  assert.throws(() => createRun({ ...contract, maxTurns: 0 }), /turn/);
  assert.throws(
    () => createRun({ ...contract, rounds: 2, counts: { review: 2 } }),
    /contract|accounting/,
  );
});

test("the accepted window is cumulative, including shortening below already consumed rounds", () => {
  let journal = deliverRepair(repaired(found()));
  journal = stage(journal, "review", {
    evidence: { ...reviewEvidence.evidence, head: "h2" },
  });
  journal = stage(journal, "judge", {
    findings: [openFinding],
    checks: "pass",
  });
  journal = event(journal, "limit", {
    limit: 1,
    authorization: "maintainer stops discovery now",
  });
  assert.equal(replay(journal).rounds, 2);
  assert.equal(replay(journal).limit, 1);
  assert.equal(replay(journal).remaining, 0);
  assert.throws(
    () => event(journal, "limit", { limit: 3, authorization: "retry" }),
    /shorter/,
  );
  assert.throws(() => event(journal, "start", { stage: "review" }), /boundary/);
  assert.throws(() => createRun({ ...contract, limit: 4 }), /1..3/);
});

test("an incomplete final round cannot be converted to a clean verification", () => {
  let journal = event(prepared({ limit: 1 }), "start", { stage: "review" });
  assert.throws(
    () =>
      event(journal, "result", {
        complete: true,
        record: "Spec missing",
        evidence: { head: "h1", standards: true, spec: false },
      }),
    /incomplete/,
  );
  journal = event(journal, "result", {
    complete: false,
    record: "missing Spec",
    progress: ["standards"],
  });
  assert.throws(() => event(journal, "start", { stage: "verify" }), /boundary/);
  journal = event(journal, "start", { stage: "review" });
  journal = event(journal, "result", {
    complete: false,
    record: "partial Spec",
    progress: ["spec-file-a"],
  });
  assert.match(replay(journal).paused, /budget/);
});

test("repair retries retain cycle identity and every investigation dispatch spends the original budget", () => {
  let journal = event(found({ limit: 1 }), "start", { stage: "repair" });
  const operation = replay(journal).repair.id;
  journal = event(journal, "result", {
    complete: false,
    record: "partial safe fix",
    progress: ["regression test"],
  });
  journal = event(journal, "start", { stage: "repair" });
  assert.equal(replay(journal).repair.id, operation);
  assert.equal(replay(journal).repairCycles, 1);
  assert.equal(replay(journal).counts.repair, 2);

  journal = stage(
    prepared({ budgets: { investigate: 1 } }),
    "review",
    reviewEvidence,
  );
  journal = stage(journal, "judge", { uncertain: true });
  journal = stage(journal, "investigate");
  journal = stage(journal, "judge", { uncertain: true });
  assert.throws(
    () => event(journal, "start", { stage: "investigate" }),
    /budget/,
  );
});

test("unexpected heads invalidate evidence without resetting history or accepting stale results", () => {
  let journal = stage(prepared({ limit: 1 }), "review", reviewEvidence);
  assert.throws(
    () =>
      event(journal, "start", {
        stage: "judge",
        observed: { base: "base", head: "external", remoteHead: "external" },
      }),
    /unexpected head/,
  );
  journal = event(journal, "pause", { reason: "external push" });
  journal = event(journal, "reconcile", {
    authorization: "maintainer confirmed external push",
    observed: { base: "base", head: "external", remoteHead: "external" },
  });
  assert.equal(replay(journal).rounds, 1);
  assert.equal(replay(journal).stage, "review");
  journal = event(journal, "start", { stage: "review" });
  assert.throws(
    () =>
      event(journal, "result", {
        complete: true,
        record: "stale",
        evidence: { head: "h1", standards: true, spec: true },
      }),
    /current-head/,
  );
  assert.throws(() => event(journal, "finish"), /finish evidence/);
});

test("new closed-window work cannot become authorized repair scope through resume", () => {
  let journal = deliverRepair(repaired(found({ limit: 1 })));
  journal = stage(journal, "verify", {
    findings: [
      openFinding,
      { id: "NEW", status: "open", evidence: "new in-scope bug" },
    ],
    evidence: { head: "h2", checks: "pass" },
  });
  const s = replay(journal);
  journal = event(journal, "resume", {
    runId: s.runId,
    counts: s.counts,
    limit: s.limit,
    stage: s.stage,
    authorization: "reconciled",
  });
  journal = stage(journal, "verify", {
    findings: [
      { ...openFinding, status: "resolved" },
      { id: "NEW", status: "open", evidence: "still open" },
    ],
    evidence: { head: "h2", checks: "pass" },
  });
  assert.match(replay(journal).paused, /new in-scope/);
});

test("escalation publication is bounded and cannot discard authorized incomplete delivery", () => {
  let journal = event(
    repaired(found({ limit: 1, budgets: { deliver: 1 } })),
    "pause",
    { reason: "human input required" },
  );
  const repairId = replay(journal).pending.id;
  journal = event(journal, "notice-start");
  journal = event(journal, "notice-result", {
    complete: true,
    record: "read-back",
    receipt: "https://example/comment/escalation",
  });
  assert.equal(replay(journal).pending.id, repairId);
  assert.equal(replay(journal).counts.deliver, 1);
  assert.throws(() => event(journal, "notice-start"), /duplicate|budget/);
});

test("head reconciliation cannot skip preparation or an unjudged round", () => {
  let journal = event(createRun(contract), "pause", {
    reason: "external head before setup",
  });
  journal = event(journal, "reconcile", {
    authorization: "confirmed",
    observed: { base: "base", head: "h2", remoteHead: "h2" },
  });
  assert.equal(replay(journal).stage, "prepare");
  assert.throws(() => event(journal, "start", { stage: "review" }), /boundary/);
});

test("explicit head reconciliation preserves an unfinished repair operation and forces fresh validation", () => {
  let journal = event(found({ limit: 1 }), "start", { stage: "repair" });
  const operation = replay(journal).repair.id;
  journal = event(journal, "pause", {
    reason: "external push during repair",
    observed: { base: "base", head: "external", remoteHead: "external" },
  });
  assert.throws(
    () =>
      event(journal, "reconcile", {
        authorization: "confirmed",
        observed: { base: "base", head: "external", remoteHead: "external" },
      }),
    /operation|ownership/,
  );
  journal = event(journal, "reconcile", {
    authorization: "maintainer reconciled owned hunks without a merge",
    operation,
    ownershipPreserved: true,
    noEffect: true,
    record: "owned diff inspected against external head",
    observed: { base: "base", head: "external", remoteHead: "external" },
  });
  assert.equal(replay(journal).repair.id, operation);
  assert.equal(replay(journal).repairCycles, 1);
  assert.equal(replay(journal).counts.repair, 1);
  journal = stage(journal, "repair", { files: ["owned.ts"] });
  assert.equal(replay(journal).stage, "validate");
  assert.equal(replay(journal).counts.repair, 2);
  assert.throws(
    () => event(journal, "start", { stage: "deliver", effect: "commit" }),
    /boundary/,
  );
});

test("delivery recovery retains authorized operation and rejects duplicate or unsigned effects", () => {
  let journal = repaired(found({ limit: 1 }));
  journal = event(journal, "start", { stage: "deliver", effect: "commit" });
  assert.throws(
    () =>
      event(journal, "result", {
        complete: true,
        record: "unsigned",
        receipt: "bad",
        commitHead: "h2",
        outgoingVerified: true,
      }),
    /signed/,
  );
  journal = event(journal, "result", {
    complete: true,
    record: "signed",
    receipt: "commit",
    commitHead: "h2",
    outgoingVerified: true,
    signed: true,
  });
  const authorized = replay(journal).pending.id;
  journal = event(journal, "start", { stage: "deliver", effect: "push" });
  journal = event(journal, "pause", {
    reason: "lost response after push; inspect remote before retry",
  });
  journal = event(journal, "result", {
    complete: true,
    record: "remote read-back",
    receipt: "push",
    remoteHead: "h2",
  });
  const s = replay(journal);
  journal = event(journal, "resume", {
    runId: s.runId,
    counts: s.counts,
    limit: s.limit,
    stage: s.stage,
    authorization: "remote read-back confirms h2",
  });
  assert.equal(replay(journal).pending.id, authorized);
  assert.equal(replay(journal).counts.deliver, 2);
  assert.throws(
    () => event(journal, "start", { stage: "deliver", effect: "commit" }),
    /duplicate/,
  );
  assert.throws(() => event(journal, "start", { stage: "review" }), /boundary/);
  assert.throws(() => event(journal, "finish"), /finish evidence/);
});

test("regressed IDs are reopened and alternating regressions cannot extend the repair loop", () => {
  let journal = stage(
    stage(prepared({ limit: 1 }), "review", reviewEvidence),
    "judge",
    {
      findings: [
        openFinding,
        { id: "F2", status: "resolved", evidence: "previous fix verified" },
      ],
      checks: "pass",
    },
  );
  journal = deliverRepair(repaired(journal));
  journal = stage(journal, "verify", {
    findings: [
      { ...openFinding, status: "resolved" },
      { id: "F2", status: "open", evidence: "repair regressed previous fix" },
    ],
    evidence: { head: "h2", checks: "pass" },
  });
  assert.equal(replay(journal).failures.F2, 1);
  assert.equal(replay(journal).stalled, 1);
  journal = repaired(journal);
  journal = deliverRepair(journal, "h3");
  journal = stage(journal, "verify", {
    findings: [
      openFinding,
      {
        id: "F2",
        status: "resolved",
        evidence: "second fix resolves it but regresses F1",
      },
    ],
    evidence: { head: "h3", checks: "pass" },
  });
  assert.match(replay(journal).paused, /stalled/);
  assert.equal(replay(journal).failures.F1, 1);
});
