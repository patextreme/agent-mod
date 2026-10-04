import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { parseJsonObject } from "acpx/flows";
import { type Command, command } from "../shared/command.js";
import { object, text } from "../shared/data.js";
import {
  contains,
  type LocalTarget,
  preflightLocalTarget,
} from "../shared/local-target.js";

export type Target = LocalTarget;
export interface Task {
  id: string;
  description: string;
  done: boolean;
}
export interface Snapshot {
  state: "blocked" | "ready" | "all_done";
  tasks: Task[];
  instructions: Record<string, unknown>;
}
export async function snapshot(
  target: Target,
  run: Command = command,
  signal?: AbortSignal,
): Promise<Snapshot> {
  const result = await run(
    ["instructions", "apply", "--change", target.changeId, "--json"],
    target.cwd,
    signal,
  );
  if (result.exitCode !== 0)
    throw new Error(`OpenSpec apply instructions failed: ${result.stderr}`);
  const data = object(JSON.parse(result.stdout));
  if (
    data.changeName !== target.changeId ||
    data.changeDir !== target.changeRoot ||
    typeof data.state !== "string" ||
    !["blocked", "ready", "all_done"].includes(data.state)
  )
    throw new Error("Invalid apply target or state");
  const files = object(data.contextFiles);
  for (const paths of Object.values(files)) {
    if (!Array.isArray(paths)) throw new Error("Invalid context paths");
    for (const value of paths) {
      const path = text(value);
      if (
        !isAbsolute(path) ||
        !contains(target.changeRoot, path) ||
        (await realpath(path)) !== path ||
        !(await lstat(path)).isFile()
      )
        throw new Error("Escaping or symlinked apply context");
    }
  }
  if (!Array.isArray(data.tasks)) throw new Error("Missing current tasks");
  const ids = new Set<string>();
  const tasks = data.tasks.map((value) => {
    const task = object(value);
    const id = text(task.id);
    if (ids.has(id) || typeof task.done !== "boolean")
      throw new Error("Invalid task identity/status");
    ids.add(id);
    return { id, description: text(task.description), done: task.done };
  });
  if (data.state === "all_done" && tasks.some((task) => !task.done))
    throw new Error("Inconsistent all_done state");
  return { state: data.state as Snapshot["state"], tasks, instructions: data };
}
export async function preflight(
  input: unknown,
  cwd: string,
  run: Command = command,
  signal?: AbortSignal,
): Promise<Target> {
  return preflightLocalTarget(input, cwd, run, signal);
}

export interface Blocker {
  id: string;
  issue: string;
  recommendation: string;
  escalation: boolean;
  scope: string;
}
export interface Gate {
  command: string;
  exitCode: number;
  afterEdits: boolean;
  attempt: number;
}
export interface Report {
  summary: string;
  completedTasks: string[];
  remainingTasks: string[];
  blockers: Blocker[];
  gates: Gate[];
  noApplicableGates: string | null;
  delegatedGroups: string[];
}
export interface Authorization {
  blocker: Blocker;
  answer: string;
}
const strings = (value: unknown): string[] => {
  if (!Array.isArray(value)) throw new Error("Expected string array");
  return value.map(text);
};
export function parseReport(raw: string, attempt: number): Report {
  const data = object(parseJsonObject(raw, { mode: "compat" }));
  if (!Array.isArray(data.blockers) || !Array.isArray(data.gates))
    throw new Error("Invalid report arrays");
  const ids = new Set<string>();
  const blockers = data.blockers.map((value) => {
    const b = object(value);
    const id = text(b.id);
    if (
      !/^[a-zA-Z0-9-]+$/.test(id) ||
      ids.has(id) ||
      typeof b.escalation !== "boolean"
    )
      throw new Error("Invalid blocker identity or escalation");
    ids.add(id);
    return {
      id,
      issue: text(b.issue),
      recommendation: text(b.recommendation),
      escalation: b.escalation,
      scope: text(b.scope),
    };
  });
  const gates = data.gates.map((value) => {
    const gate = object(value);
    if (
      !Number.isInteger(gate.exitCode) ||
      typeof gate.afterEdits !== "boolean" ||
      !Number.isInteger(gate.attempt) ||
      Number(gate.attempt) < 0 ||
      Number(gate.attempt) > attempt
    )
      throw new Error("Malformed gate evidence");
    return {
      command: text(gate.command),
      exitCode: Number(gate.exitCode),
      afterEdits: gate.afterEdits,
      attempt: Number(gate.attempt),
    };
  });
  return {
    summary: text(data.summary),
    completedTasks: strings(data.completedTasks),
    remainingTasks: strings(data.remainingTasks),
    blockers,
    gates,
    noApplicableGates:
      data.noApplicableGates === null ? null : text(data.noApplicableGates),
    delegatedGroups: strings(data.delegatedGroups),
  };
}
export function completionSupported(
  current: Snapshot,
  report: Report,
  attempt: number,
): boolean {
  return (
    current.state !== "blocked" &&
    current.tasks.every((task) => task.done) &&
    !report.remainingTasks.length &&
    !report.blockers.length &&
    (report.gates.length
      ? report.gates.every(
          (gate) =>
            gate.exitCode === 0 && gate.afterEdits && gate.attempt === attempt,
        )
      : Boolean(report.noApplicableGates?.trim()))
  );
}
export function authorize(
  report: Report,
  answers: Record<string, string>,
): Authorization[] {
  const issues = report.blockers.filter((b) => b.escalation);
  if (
    !issues.length ||
    Object.keys(answers).some((id) => !issues.some((b) => b.id === id))
  )
    throw new Error("Steering outside current issues");
  return issues.map((blocker) => ({
    blocker,
    answer: text(answers[blocker.id]),
  }));
}
export function applyPrompt(
  target: Target,
  current: Snapshot,
  attempt: number,
  prior: Report | null,
  steering: Authorization[],
): string {
  if (
    target.changeRoot !==
    resolve(target.cwd, "openspec/changes", target.changeId)
  )
    throw new Error("Invalid prompt target");
  return `/skill:openspec-apply-change ${target.changeId}
OpenSpec implementation flow. Explicitly select changeId ${target.changeId}; attempt ${attempt} (0 is initial apply).
Read current openspec status and instructions apply --change ${target.changeId} --json, and EVERY contextFiles path. Follow CLI state, built-in instruction, context and compatible operationGuidance; do not bypass blocked state. Report conflicts. Attempt all remaining work, not a fixed task batch. Even if tasks are initially all_done, establish fresh applicable gate evidence; repairs may correct code and rerun gates with checkboxes already done.
The outer flow owns human interaction: on ambiguity, missing artifacts, design changes, destructive actions, or external access requirements return a blocker report instead of waiting for inner interaction. Ordinary implementation errors and failing tests within approved design are repairable. Mixed blockers require steering before ANY further repair. Do not invent authorization.
Delegate multiple substantive task groups to subagents, with task IDs, approved context, explicit ownership boundaries, dependencies and reporting expectations. A trivial single substantive group need not delegate. Run only independent groups concurrently; sequence dependent groups. Parent owns task checklist consolidation, marks checkboxes promptly as group results return, waits for all dispatched delegates, and runs final gates after consolidation. Do not allow concurrent checklist writes.
Run ALL applicable current project gates after the last relevant edit (including format before other gates); identify concrete commands and exit codes. Edits invalidate prior gate evidence. Report evidence only for this attempt, ${attempt}. If no gates apply, provide an explicit scope-based justification, never an empty unsupported claim.
Steering below applies ONLY to each associated issue and requested scope. A plan edit is authorized only if the answer explicitly permits that scoped plan edit; it does not authorize destructive actions, external access, unrelated changes or tool permission overrides. Preserve existing edits. No commit, stash, reset, rollback, archive, automatic resume, verify skill or independent implementation verification review.
CURRENT SNAPSHOT: ${JSON.stringify(current)}
PRIOR REPORT: ${JSON.stringify(prior)}
ACCUMULATED SCOPED STEERING: ${JSON.stringify(steering)}
Return ONLY a JSON report (summary preserves useful prose): {"summary":"...","completedTasks":["task-id"],"remainingTasks":["task-id"],"blockers":[{"id":"cycle-unique-id","issue":"...","recommendation":"...","escalation":true,"scope":"explicit requested authorization scope"}],"gates":[{"command":"...","exitCode":0,"afterEdits":true,"attempt":${attempt}}],"noApplicableGates":null,"delegatedGroups":["task IDs, ownership and result"]}. Use [] for absent arrays. Normal test failures or blockers belong in this report, not an invocation failure.`;
}
export function judgePrompt(
  current: Snapshot,
  report: Report,
  attempt: number,
): string {
  return `Task-and-gate decision judge: choose exactly completed, repairable_pause, or escalation_required. Read-only: do not edit or independently inspect implementation correctness; no verify skill or independent review. Use current CLI state/tasks and latest implementer summary and concrete gate evidence. completed requires every task complete, no blockers/remaining work, and all applicable current gates passing after relevant edits on attempt ${attempt}. Missing, stale or failing gates cannot support completion; no gates requires explicit applicable-scope justification. Judge gate applicability against current project instructions and scope, not merely the presence of any passing command. Ordinary errors within approved design are repairable_pause. Missing artifacts, ambiguity, design changes, destructive actions, missing external access, or mixed consequential/repairable blockers are escalation_required. Never invent consent.\n${JSON.stringify({ current, report, attempt })}`;
}
