import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Evaluates declared evidence, not attention, comprehension, or finding validity.
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;

function requireValid(condition, message) {
  if (!condition) throw new TypeError(message);
}

function uniqueRows(rows, name) {
  requireValid(Array.isArray(rows), `${name} must be an array`);
  const ids = new Set();
  for (const row of rows) {
    requireValid(
      nonempty(row?.id) && !ids.has(row.id),
      `${name}: nonempty unique IDs required`,
    );
    ids.add(row.id);
  }
}

export function evaluateCoverage(record) {
  requireValid(
    ["review", "verify"].includes(record?.stage),
    "stage must be review or verify",
  );
  requireValid(nonempty(record.pin?.head), "pinned head required");
  if (record.stage === "review") {
    requireValid(nonempty(record.pin.mergeBase), "pinned merge-base required");
    requireValid(
      ["Standards", "Spec"].includes(record.axis),
      "review axis required",
    );
  }
  uniqueRows(record.coverage, "coverage");
  uniqueRows(record.handoff?.coverage ?? [], "handoff coverage");
  uniqueRows(record.reuse ?? [], "reuse");
  for (const item of record.coverage) {
    requireValid(
      [
        "diff",
        "spec",
        "standards",
        "impact",
        "history",
        "recorded-id",
      ].includes(item.kind),
      "unknown coverage kind",
    );
    requireValid(
      item.required === undefined || typeof item.required === "boolean",
      "required must be boolean",
    );
  }
  if (record.stage === "verify") {
    requireValid(
      record.coverage.some((item) => item.kind === "recorded-id"),
      "verification requires recorded IDs",
    );
    requireValid(
      !record.coverage.some((item) => item.kind === "diff"),
      "verification is per-ID, not discovery",
    );
  }
  for (const entry of record.reuse ?? []) {
    requireValid(
      ["preparation", "check"].includes(entry.kind),
      "reuse is only preparation or check evidence",
    );
    requireValid(nonempty(entry.head), "reuse original head required");
    if (entry.kind === "check") {
      requireValid(
        nonempty(entry.command) && nonempty(entry.result),
        "reuse command and actual result required",
      );
    }
  }
  const required = record.coverage.filter(
    (item) => item.kind !== "history" || item.required === true,
  );
  const exposed = required
    .filter(
      (item) =>
        item.evidence?.requested === true &&
        item.evidence.delivered === true &&
        item.evidence.original === "complete" &&
        nonempty(item.evidence.ref),
    )
    .map((item) => item.id);
  const gaps = required
    .filter(
      (item) =>
        item.kind !== "diff" &&
        (!["requirement", "instruction", "impact"].includes(item.basis?.kind) ||
          !item.basis?.detail?.trim()),
    )
    .map((item) => ({
      id: item.id,
      reason: "missing-basis",
      action: "justify-mandatory-scope",
    }));
  if (
    record.stage === "review" &&
    !required.some((item) => item.kind === "diff")
  ) {
    gaps.push({
      id: "full-diff",
      reason: "missing-full-diff",
      action: "review-full-pinned-diff",
    });
  }
  gaps.push(
    ...required
      .filter((item) => !exposed.includes(item.id))
      .map((item) =>
        item.evidence?.original === "truncated"
          ? {
              id: item.id,
              reason: "incomplete-original",
              action: "recover-missing-material",
            }
          : {
              id: item.id,
              reason: "unread-required",
              action: "read-original-or-source",
            },
      ),
  );
  for (const item of required) {
    const inspection = record.handoff?.coverage?.find(
      (entry) => entry.id === item.id,
    );
    if (inspection?.complete !== true || !nonempty(inspection.account)) {
      gaps.push({
        id: item.id,
        reason: "unfinished-inspection",
        action: "finish-semantic-inspection",
      });
    }
  }
  if (
    record.handoff?.head !== record.pin.head ||
    (record.stage === "review" &&
      record.handoff?.mergeBase !== record.pin.mergeBase)
  ) {
    gaps.push({
      id: "handoff",
      reason: "stale-handoff",
      action: "reconcile-current-scope",
    });
  }
  if (
    !Array.isArray(record.handoff?.investigations) ||
    record.handoff.investigations.length
  ) {
    gaps.push({
      id: "investigations",
      reason: "unresolved-investigation",
      action: "resolve-investigations",
    });
  }
  const reuse = (record.reuse ?? []).map((entry) => {
    const changed = [
      "source",
      "configuration",
      "dependencies",
      "environment",
    ].filter(
      (key) =>
        !nonempty(entry.inputs?.[key]) ||
        !nonempty(entry.currentInputs?.[key]) ||
        entry.inputs[key] !== entry.currentInputs[key],
    );
    if (
      record.stage === "verify" &&
      entry.kind === "check" &&
      entry.head !== record.pin.head
    ) {
      changed.push("head");
    }
    if (changed.length) {
      gaps.push({
        id: entry.id,
        reason: "stale-reuse",
        action:
          entry.kind === "preparation" ? "refresh-preparation" : "rerun-check",
      });
    }
    return { id: entry.id, reusable: changed.length === 0, changed };
  });
  return { coverageComplete: gaps.length === 0, exposed, gaps, reuse };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    requireValid(
      process.argv.length === 3,
      "Usage: node coverage-evidence.mjs <coverage.json>",
    );
    const result = evaluateCoverage(
      JSON.parse(readFileSync(process.argv[2], "utf8")),
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.coverageComplete ? 0 : 1;
  } catch (error) {
    console.log(
      JSON.stringify({ coverageComplete: false, error: error.message }),
    );
    process.exitCode = 2;
  }
}
