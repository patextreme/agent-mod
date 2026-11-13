// Dependency-free transition guard, not a dispatcher or an evidence evaluator.
import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const DEFAULT_BUDGETS = Object.freeze({
  prepare: 3,
  review: 6,
  judge: 6,
  investigate: 6,
  repair: 6,
  validate: 6,
  verify: 9,
  deliver: 24,
});
function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function initial(contract) {
  requireThat(
    contract &&
      Object.keys(contract).every((key) =>
        [
          "runId",
          "pr",
          "base",
          "head",
          "limit",
          "budgets",
          "maxTurns",
        ].includes(key),
      ),
    "contract cannot import/reset accounting; replay the saved journal",
  );
  for (const key of ["runId", "pr", "base", "head"])
    requireThat(text(contract[key]), `missing ${key}`);
  const limit = contract.limit ?? 3;
  requireThat(
    Number.isInteger(limit) && limit >= 1 && limit <= 3,
    "limit must be 1..3",
  );
  const budgets = { ...DEFAULT_BUDGETS, ...contract.budgets };
  for (const [key, value] of Object.entries(budgets)) {
    requireThat(
      Object.hasOwn(DEFAULT_BUDGETS, key) &&
        Number.isSafeInteger(value) &&
        value > 0,
      "finite positive stage budgets required",
    );
  }
  const maxTurns = contract.maxTurns ?? 20;
  requireThat(
    Number.isSafeInteger(maxTurns) && maxTurns > 0,
    "finite positive turn bound required",
  );
  return {
    runId: contract.runId,
    pr: contract.pr,
    base: contract.base,
    head: contract.head,
    limit,
    budgets,
    maxTurns,
    remoteHead: contract.head,
    stage: "prepare",
    active: null,
    rounds: 0,
    remaining: limit,
    counts: Object.fromEntries(Object.keys(budgets).map((key) => [key, 0])),
    findings: {},
    pending: null,
    evidence: null,
    outcome: null,
    paused: null,
    roundPending: false,
    judgmentPending: false,
    reviewAttempts: 0,
    progress: [],
    failures: {},
    stalled: 0,
    deliveries: [],
    repair: null,
    repairCycles: 0,
    repairable: [],
    notice: null,
  };
}
function openIds(s) {
  return Object.values(s.findings)
    .filter((f) => f.status === "open")
    .map((f) => f.id);
}
function checkEvidence(s, evidence) {
  requireThat(evidence?.head === s.head, "current-head evidence required");
  requireThat(
    ["pass", "unrelated"].includes(evidence.checks),
    "required checks incomplete or PR-caused failure",
  );
  requireThat(
    evidence.checks !== "unrelated" || s.rounds >= s.limit,
    "unrelated check failures escalate before window closes",
  );
}
function ledger(s, findings, verification) {
  requireThat(Array.isArray(findings), "complete finding ledger required");
  const ids = findings.map((f) => f.id);
  requireThat(
    new Set(ids).size === ids.length &&
      Object.keys(s.findings).every((id) => ids.includes(id)),
    "missing/duplicate recorded finding",
  );
  let newOpen = false;
  for (const f of findings) {
    requireThat(
      text(f.id) &&
        !["__proto__", "constructor", "prototype"].includes(f.id) &&
        text(f.evidence) &&
        ["open", "resolved", "deferred", "report-only"].includes(f.status),
      "invalid finding disposition",
    );
    if (verification && !s.repairable.includes(f.id) && f.status === "open")
      newOpen = true;
    if (
      !verification &&
      ["open", "resolved"].includes(f.status) &&
      !s.repairable.includes(f.id)
    )
      s.repairable.push(f.id);
    if (verification)
      s.failures[f.id] = f.status === "open" ? (s.failures[f.id] ?? 0) + 1 : 0;
    s.findings[f.id] = structuredClone(f);
  }
  return newOpen;
}
function summary(s, outcome) {
  s.pending = {
    id: `${s.runId}:summary:${s.rounds}:${s.counts.verify}`,
    kind: "summary",
    outcome,
    receipts: {},
  };
  s.stage = "deliver";
}
export function createRun(contract) {
  const accepted = initial(contract);
  const journal = {
    version: 1,
    contract: {
      ...structuredClone(contract),
      limit: accepted.limit,
      budgets: accepted.budgets,
      maxTurns: accepted.maxTurns,
    },
    events: [],
  };
  replay(journal);
  return journal;
}
function transition(s, e, revision) {
  requireThat(!s.outcome, "run is finished");
  requireThat(e.revision === revision, "stale revision/accounting");
  const deliveryResult =
    e.type === "result" && e.complete === true && s.active?.stage === "deliver";
  if (!["reconcile", "pause"].includes(e.type)) {
    const head =
      deliveryResult && s.active.effect === "commit" ? e.commitHead : s.head;
    const remoteHead =
      deliveryResult && s.active.effect === "push"
        ? e.remoteHead
        : s.remoteHead;
    requireThat(
      e.observed?.base === s.base &&
        e.observed?.head === head &&
        e.observed?.remoteHead === remoteHead,
      "unexpected head/base; pause and reconcile",
    );
  }
  requireThat(
    !s.paused ||
      deliveryResult ||
      [
        "resume",
        "pause",
        "reconcile",
        "notice-start",
        "notice-result",
      ].includes(e.type),
    "run is paused; reconcile before continuing",
  );
  if (e.type === "notice-start") {
    requireThat(
      s.paused && !s.notice?.active && !s.notice?.receipt,
      "duplicate/unauthorized escalation publication",
    );
    requireThat(
      s.counts.deliver < s.budgets.deliver,
      "delivery budget exhausted; report missing escalation receipt directly",
    );
    s.counts.deliver++;
    s.notice = {
      id: s.notice?.id ?? `${s.runId}:escalation:${revision}`,
      active: true,
    };
  } else if (e.type === "notice-result") {
    requireThat(
      s.paused &&
        s.notice?.active &&
        text(e.record) &&
        typeof e.complete === "boolean",
      "no authorized escalation publication",
    );
    requireThat(!e.complete || text(e.receipt), "missing escalation receipt");
    s.notice.active = false;
    if (e.complete) s.notice.receipt = e.receipt;
  } else if (e.type === "reconcile") {
    requireThat(
      s.paused && text(e.authorization) && !s.notice?.active,
      "head reconciliation requires paused state, authorization and notice recovery",
    );
    requireThat(
      e.observed?.base === s.base &&
        text(e.observed.head) &&
        e.observed.head === e.observed.remoteHead,
      "reconciliation requires pinned base and aligned heads",
    );
    if (s.repair || s.pending) {
      requireThat(
        s.repair &&
          e.operation === s.repair.id &&
          e.ownershipPreserved === true &&
          e.noEffect === true &&
          text(e.record),
        "explicit operation/ownership reconciliation required",
      );
      requireThat(
        !s.pending || Object.keys(s.pending.receipts).length === 0,
        "delivered effects require human recovery; preserve receipts and operation",
      );
      // No commit/push/comment was applied. Keep repair identity and all effort;
      // previously accepted validation is stale and cannot authorize delivery.
      s.pending = null;
      s.stage = s.repair.files.length ? "validate" : "repair";
    } else {
      if (s.judgmentPending) s.roundPending = true;
      if (s.stage !== "prepare")
        s.stage = s.roundPending || s.rounds < s.limit ? "review" : "verify";
    }
    s.head = e.observed.head;
    s.remoteHead = e.observed.remoteHead;
    s.evidence = null;
    s.active = null;
    s.paused = null;
    s.notice = null;
  } else if (e.type === "pause") {
    requireThat(
      text(e.reason) &&
        text(e.observed?.base) &&
        text(e.observed.head) &&
        text(e.observed.remoteHead),
      "pause requires exact recovery reason and actual observed state",
    );
    s.paused = e.reason;
  } else if (e.type === "resume") {
    requireThat(
      s.paused && text(e.authorization) && !s.notice?.active,
      "resume requires reconciliation/authorization and notice recovery",
    );
    requireThat(
      e.runId === s.runId &&
        e.limit === s.limit &&
        e.stage === s.stage &&
        e.counts &&
        Object.keys(e.counts).length === Object.keys(s.counts).length &&
        Object.entries(s.counts).every(
          ([key, value]) => e.counts[key] === value,
        ),
      "resume accounting mismatch",
    );
    s.paused = null;
    if (s.notice?.receipt) s.deliveries.push(structuredClone(s.notice));
    s.notice = null;
  } else if (e.type === "limit") {
    requireThat(
      text(e.authorization) &&
        Number.isInteger(e.limit) &&
        e.limit >= 1 &&
        e.limit <= s.limit,
      "only an authorized shorter total limit is allowed",
    );
    s.limit = e.limit;
    if (
      s.stage === "review" &&
      !s.active &&
      !s.roundPending &&
      s.rounds >= s.limit
    )
      s.stage = "verify";
  } else if (e.type === "start") {
    requireThat(!s.active && e.stage === s.stage, "invalid stage boundary");
    requireThat(
      s.counts[e.stage] < s.budgets[e.stage],
      "stage budget exhausted",
    );
    s.counts[e.stage]++;
    if (e.stage === "review") {
      if (!s.roundPending) {
        requireThat(s.rounds < s.limit, "discovery window exhausted");
        s.rounds++;
        s.roundPending = true;
        s.judgmentPending = true;
        s.reviewAttempts = 0;
      }
      requireThat(s.reviewAttempts < 2, "review continuation budget exhausted");
      s.reviewAttempts++;
    }
    if (["review", "verify"].includes(e.stage))
      requireThat(
        s.head === s.remoteHead,
        "review/verify require aligned heads",
      );
    if (e.stage === "repair") {
      requireThat(
        openIds(s).length > 0 &&
          openIds(s).every((id) => s.repairable.includes(id)) &&
          s.stalled < 2 &&
          openIds(s).every((id) => (s.failures[id] ?? 0) < 3),
        "repair stalled or unauthorized queue",
      );
      if (!s.repair) {
        s.repairCycles++;
        s.repair = {
          id: `${s.runId}:repair:${s.repairCycles}`,
          ids: openIds(s),
          files: [],
        };
      }
    }
    if (e.stage === "deliver") {
      const effects =
        s.pending?.kind === "repair"
          ? ["commit", "push", "comment"]
          : ["comment"];
      requireThat(
        s.pending &&
          e.effect === effects.find((effect) => !s.pending.receipts[effect]),
        "duplicate/unauthorized delivery effect",
      );
    }
    const maxTurns = e.maxTurns ?? s.maxTurns;
    requireThat(
      Number.isSafeInteger(maxTurns) && maxTurns > 0 && maxTurns <= s.maxTurns,
      "dispatch exceeds accepted turn bound",
    );
    s.active = { stage: e.stage, effect: e.effect, maxTurns };
  } else if (e.type === "result") {
    requireThat(
      s.active && typeof e.complete === "boolean" && text(e.record),
      "incomplete stage evidence",
    );
    const { stage, effect } = s.active;
    s.active = null;
    if (!e.complete) {
      requireThat(
        Array.isArray(e.progress) && e.progress.every(text),
        "incomplete result needs measurable progress units",
      );
      const gained = e.progress.filter((unit) => !s.progress.includes(unit));
      s.progress = [...new Set([...s.progress, ...e.progress])];
      if (!gained.length)
        s.paused = "no measurable progress; human recovery required";
      else if (
        s.counts[stage] >= s.budgets[stage] ||
        (stage === "review" && s.reviewAttempts >= 2)
      )
        s.paused = "stage budget exhausted; preserve incomplete work";
      s.remaining = Math.max(0, s.limit - s.rounds);
      return;
    }
    s.progress = [];
    if (stage === "prepare") s.stage = "review";
    else if (stage === "review") {
      requireThat(
        e.evidence?.head === s.head &&
          e.evidence.standards === true &&
          e.evidence.spec === true,
        "incomplete/current-head review evidence required",
      );
      s.evidence = e.evidence;
      s.roundPending = false;
      s.stage = "judge";
    } else if (stage === "judge") {
      if (e.uncertain === true) s.stage = "investigate";
      else {
        requireThat(
          s.evidence?.head === s.head,
          "current-head review judgment required",
        );
        ledger(s, e.findings, false);
        if (e.checks !== "failed" || !openIds(s).length)
          checkEvidence(s, { head: s.evidence.head, checks: e.checks });
        s.judgmentPending = false;
        s.evidence = { head: s.head, checks: e.checks };
        if (openIds(s).length) s.stage = "repair";
        else
          summary(
            s,
            e.findings.some((f) => f.status === "deferred")
              ? "limited coverage"
              : "verified",
          );
      }
    } else if (stage === "investigate") s.stage = "judge";
    else if (stage === "repair") {
      requireThat(
        s.repair &&
          Array.isArray(e.files) &&
          e.files.length &&
          e.files.every(text),
        "owned repair files required",
      );
      s.repair.files = e.files;
      s.stage = "validate";
    } else if (stage === "validate") {
      checkEvidence(s, e.evidence);
      requireThat(
        e.inspected === true && s.repair,
        "independent actual-change inspection required",
      );
      s.evidence = e.evidence;
      s.pending = { ...s.repair, kind: "repair", receipts: {} };
      s.stage = "deliver";
    } else if (stage === "verify") {
      requireThat(
        s.rounds >= s.limit && !s.roundPending && !s.judgmentPending,
        "verification cannot accept incomplete discovery",
      );
      requireThat(
        e.evidence?.head === s.head,
        "current-head evidence required",
      );
      const before = openIds(s);
      const newOpen = ledger(s, e.findings, true);
      const after = openIds(s);
      if (e.evidence.checks !== "failed" || !after.length)
        checkEvidence(s, e.evidence);
      const progress =
        before.some((id) => !after.includes(id)) &&
        after.every((id) => before.includes(id));
      s.stalled = progress ? 0 : s.stalled + 1;
      s.evidence = e.evidence;
      if (newOpen)
        s.paused = "new in-scope finding after window; human decision required";
      else if (!after.length) summary(s, "limited coverage");
      else if (s.stalled >= 2 || after.some((id) => s.failures[id] >= 3))
        s.paused = "verification stalled; human recovery required";
      else s.stage = "repair";
    } else if (stage === "deliver") {
      requireThat(text(e.receipt), "missing delivery receipt");
      if (effect === "commit") {
        requireThat(
          e.signed === true &&
            e.outgoingVerified === true &&
            text(e.commitHead) &&
            e.commitHead !== s.head,
          "signed, inspected outgoing commits required",
        );
        s.head = e.commitHead;
      } else if (effect === "push") {
        requireThat(
          e.remoteHead === s.head,
          "push needs exact PR-branch remote SHA receipt",
        );
        s.remoteHead = e.remoteHead;
      }
      s.pending.receipts[effect] = e.receipt;
      if (effect === "comment") {
        s.deliveries.push(structuredClone(s.pending));
        if (s.pending.kind === "summary") s.stage = "finish";
        else {
          s.pending = null;
          s.repair = null;
          s.stage = s.rounds < s.limit ? "review" : "verify";
        }
      }
    } else throw new Error("unsupported stage");
  } else if (e.type === "finish") {
    requireThat(
      s.stage === "finish" &&
        !s.active &&
        s.pending?.receipts.comment &&
        s.evidence?.head === s.head &&
        s.head === s.remoteHead &&
        !s.roundPending &&
        !s.judgmentPending &&
        !openIds(s).length,
      "incomplete finish evidence",
    );
    s.outcome = s.pending.outcome;
  } else throw new Error("invalid transition");
  s.remaining = Math.max(0, s.limit - s.rounds);
}
export function replay(journal) {
  requireThat(
    journal?.version === 1 && Array.isArray(journal.events),
    "invalid journal",
  );
  const state = initial(journal.contract);
  journal.events.forEach((event, revision) => {
    transition(state, event, revision);
  });
  return state;
}
export function append(journal, event) {
  const next = structuredClone(journal);
  next.events.push(structuredClone(event));
  replay(next);
  return next;
}

function cli() {
  const [command, path, input, ...extra] = process.argv.slice(2);
  requireThat(
    path &&
      !extra.length &&
      ["init", "apply", "show"].includes(command) &&
      (command === "show" ? !input : input),
    "usage: node lifecycle.mjs <init|apply> JOURNAL INPUT.json | show JOURNAL",
  );
  const readJSON = (p) => JSON.parse(readFileSync(p, "utf8"));
  if (command === "show") {
    const journal = readJSON(path);
    console.log(
      JSON.stringify(
        { ...replay(journal), revision: journal.events.length },
        null,
        2,
      ),
    );
    return;
  }
  // One writer; a crashed writer's lock requires explicit operator reconciliation.
  const lockPath = `${path}.lock`;
  const lock = openSync(lockPath, "wx");
  const temporary = `${path}.next`;
  try {
    const journal =
      command === "init"
        ? createRun(readJSON(input))
        : append(readJSON(path), readJSON(input));
    const serialized = `${JSON.stringify(journal, null, 2)}\n`;
    if (command === "init") writeFileSync(path, serialized, { flag: "wx" });
    else {
      writeFileSync(temporary, serialized, { flag: "wx" });
      renameSync(temporary, path);
    }
    console.log(
      JSON.stringify(
        { ...replay(journal), revision: journal.events.length },
        null,
        2,
      ),
    );
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    cli();
  } catch (error) {
    console.error(`lifecycle: ${error.message}`);
    process.exitCode = 1;
  }
}
