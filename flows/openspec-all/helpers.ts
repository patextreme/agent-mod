import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import type { FinalizeResult } from "../openspec-finalize/flow.js";
import {
  parseAssessment as parseSyncAssessment,
  parseWorker,
  type SyncInputs,
} from "../openspec-finalize/helpers.js";
import type { GroomResult } from "../openspec-groom/flow.js";
import type { ImplementResult } from "../openspec-implement/flow.js";
import type { VerifyResult } from "../openspec-verify/flow.js";
import {
  acceptanceSupported,
  type Report,
  type Snapshot,
} from "../openspec-verify/helpers.js";
import type { Command } from "../shared/command.js";
import { object, text } from "../shared/data.js";
import {
  type LocalTarget,
  preflightLocalTarget,
} from "../shared/local-target.js";

export interface AllInput {
  changeId: string;
}
export const stages = ["groom", "implement", "verify", "finalize"] as const;
export type Stage = (typeof stages)[number];
export type ChildResult =
  | GroomResult
  | ImplementResult
  | VerifyResult
  | FinalizeResult;
export type Outcome = ChildResult["outcome"];
export interface StageResult {
  stage: Stage;
  status: "not_started" | "running" | Outcome;
  result: ChildResult | null;
}
export interface AllResult {
  changeId: string;
  workspace: string | null;
  outcome: Outcome;
  summary: string;
  activeStage: Stage | null;
  failedStage: Stage | null;
  stages: StageResult[];
  finalization: FinalizeResult | null;
  archive: FinalizeResult["archive"] | null;
}
export async function preflight(
  input: unknown,
  cwd: string,
  run: Command,
  signal?: AbortSignal,
): Promise<LocalTarget> {
  const target = await preflightLocalTarget(input, cwd, run, signal);
  // In addition to shared canonical resolution, reject non-directory/symlinked
  // planning ancestors before dispatching any constituent write-capable node.
  for (const path of [
    target.cwd,
    resolve(target.cwd, "openspec"),
    resolve(target.cwd, "openspec/changes"),
    target.changeRoot,
  ]) {
    const stat = await lstat(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(path)) !== path
    )
      throw new Error("Unsafe pipeline workspace or change ancestor");
  }
  return target;
}
export function sameTarget(value: unknown, expected: LocalTarget): void {
  const actual = object(value);
  if (
    actual.changeId !== expected.changeId ||
    actual.cwd !== expected.cwd ||
    actual.changeRoot !== expected.changeRoot
  )
    throw new Error(
      "Constituent change/workspace differs from pipeline target",
    );
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new Error("Malformed constituent result array");
  return value;
}
function strings(value: unknown): string[] {
  return array(value).map(text);
}
function counter(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 10)
    throw new Error("Invalid constituent budget count");
  return Number(value);
}
function findings(value: unknown): void {
  for (const item of array(value)) {
    const finding = object(item);
    text(finding.id);
    text(finding.issue);
    text(finding.recommendation);
    if (
      !["CRITICAL", "WARNING", "SUGGESTION"].includes(
        String(finding.severity),
      ) ||
      !strings(finding.evidence).length
    )
      throw new Error("Malformed finding evidence");
  }
}
function report(value: unknown): Report {
  const data = object(value);
  text(data.report);
  if (typeof data.conclusive !== "boolean")
    throw new Error("Malformed verification report");
  for (const key of ["completeness", "correctness", "coherence"]) {
    const d = object(object(data.dimensions)[key]);
    text(d.reason);
    const evidence = strings(d.evidence);
    if (
      !["checked", "inapplicable", "missing"].includes(String(d.status)) ||
      (d.status === "checked" && !evidence.length)
    )
      throw new Error("Malformed verification dimension");
  }
  findings(data.findings);
  strings(data.missingEvidence);
  if (data.noApplicableGates !== null) text(data.noApplicableGates);
  for (const item of array(data.gates)) {
    const gate = object(item);
    text(gate.command);
    text(gate.result);
    if (gate.exitCode !== null && !Number.isInteger(gate.exitCode))
      throw new Error("Malformed verification gate");
  }
  return value as Report;
}
/** Validate captured data, never infer acceptance merely from an emitter call. */
export function validateResult(
  stage: Stage,
  value: unknown,
  changeId: string,
): ChildResult {
  const data = object(value);
  const expected = [
    "changeId",
    "outcome",
    "summary",
    "remaining",
    ...(stage === "groom"
      ? ["updateAttempts"]
      : stage === "implement"
        ? ["repairAttempts"]
        : stage === "verify"
          ? ["repairAttempts", "report"]
          : [
              "phase",
              "failedPhase",
              "phases",
              "sync",
              "assessment",
              "archive",
            ]),
  ];
  if (
    Object.keys(data).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(data, key))
  )
    throw new Error("Missing/unsupported constituent result fields");
  if (
    data.changeId !== changeId ||
    ![
      "success",
      "limit_reached",
      "needs_human",
      "cancelled",
      "failed",
    ].includes(String(data.outcome))
  )
    throw new Error("Invalid constituent target/outcome");
  text(data.summary);
  if (!Object.hasOwn(data, "remaining") || data.remaining === undefined)
    throw new Error("Missing constituent remaining issues");
  if (stage === "groom") {
    const count = counter(data.updateAttempts);
    if (data.outcome === "limit_reached" && count !== 10)
      throw new Error("Contradictory groom limit");
    if (
      data.outcome === "success" &&
      data.remaining &&
      typeof data.remaining === "object"
    ) {
      const remaining = object(data.remaining);
      if (remaining.route === "invalid" || remaining.conclusive === false)
        throw new Error("Contradictory groom success");
    }
  } else if (stage === "implement") {
    const count = counter(data.repairAttempts);
    const remaining = object(data.remaining);
    const tasks = array(remaining.tasks);
    for (const item of tasks) {
      const task = object(item);
      text(task.id);
      text(task.description);
      if (typeof task.done !== "boolean")
        throw new Error("Malformed remaining task");
    }
    const reported = strings(remaining.reportedTasks);
    const blockers = array(remaining.blockers);
    for (const item of blockers) {
      const blocker = object(item);
      text(blocker.id);
      text(blocker.issue);
      text(blocker.recommendation);
      text(blocker.scope);
      if (typeof blocker.escalation !== "boolean")
        throw new Error("Malformed blocker");
    }
    if (
      data.outcome === "success" &&
      (tasks.length || reported.length || blockers.length)
    )
      throw new Error("Contradictory implementation success");
    if (data.outcome === "limit_reached" && count !== 10)
      throw new Error("Contradictory implementation limit");
  } else if (stage === "verify") {
    const count = counter(data.repairAttempts);
    findings(data.remaining);
    if (data.report !== null) report(data.report);
    if (data.outcome === "success") {
      const checked = report(data.report);
      if (
        !checked.conclusive ||
        checked.findings.some((f) => f.severity !== "SUGGESTION") ||
        checked.missingEvidence.length ||
        array(data.remaining).some((f) => object(f).severity !== "SUGGESTION")
      )
        throw new Error("Contradictory verification success");
    }
    if (data.outcome === "limit_reached" && count !== 10)
      throw new Error("Contradictory verification limit");
  } else {
    if (!["success", "failed", "cancelled"].includes(String(data.outcome)))
      throw new Error("Invalid finalization outcome");
    const phases = object(data.phases);
    const keys = ["preflight", "prepare", "sync", "assessment", "archive"];
    if (
      !keys.includes(String(data.phase)) ||
      (data.failedPhase !== null && !keys.includes(String(data.failedPhase))) ||
      Object.keys(phases).length !== keys.length ||
      keys.some(
        (k) =>
          !["not_started", "completed", "failed", "not_applicable"].includes(
            String(phases[k]),
          ),
      )
    )
      throw new Error("Malformed finalization phases");
    strings(data.remaining);
    const archive = object(data.archive);
    if (archive.destination !== null) text(archive.destination);
    if (
      ![
        "not_started",
        "moving",
        "failed",
        "moved_unconfirmed",
        "archived",
      ].includes(String(archive.state))
    )
      throw new Error("Malformed archive state");
    if (data.sync !== null) parseWorker(JSON.stringify(data.sync));
    if (data.assessment !== null) {
      const assessed = object(data.assessment);
      text(assessed.summary);
      strings(assessed.issues);
      array(assessed.coverage);
      if (
        !["accepted", "mismatch", "inconclusive"].includes(
          String(assessed.verdict),
        )
      )
        throw new Error("Malformed sync assessment");
    }
    if (
      data.outcome === "success" &&
      (data.failedPhase !== null ||
        data.phase !== "archive" ||
        phases.preflight !== "completed" ||
        phases.prepare !== "completed" ||
        phases.archive !== "completed" ||
        archive.state !== "archived" ||
        !archive.destination ||
        array(data.remaining).length ||
        !(
          (phases.sync === "not_applicable" &&
            phases.assessment === "not_applicable" &&
            data.sync === null &&
            data.assessment === null) ||
          (phases.sync === "completed" &&
            phases.assessment === "completed" &&
            object(data.sync).outcome === "success" &&
            object(data.assessment).verdict === "accepted")
        ))
    )
      throw new Error("Contradictory finalization success");
  }
  return value as ChildResult;
}
/** Recheck captured evidence against native child outputs, not an emitter claim. */
export function validateBoundary(
  stage: Stage,
  child: ChildResult,
  outputs: Record<string, unknown>,
): void {
  if (stage === "verify" && child.outcome === "success") {
    const current = outputs[`${stage}:refresh`] as Snapshot;
    if (
      !current ||
      !acceptanceSupported((child as VerifyResult).report as Report, current)
    )
      throw new Error("Unsupported verification success evidence");
  }
  if (stage === "finalize" && (child as FinalizeResult).assessment) {
    const inputs = outputs[`${stage}:prepare`] as SyncInputs;
    if (!inputs) throw new Error("Missing finalization sync inputs");
    parseSyncAssessment(
      JSON.stringify((child as FinalizeResult).assessment),
      inputs,
    );
  }
}
