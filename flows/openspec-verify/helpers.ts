import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
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
  status: Record<string, unknown>;
  instructions: Record<string, unknown>;
  state: "blocked" | "ready" | "all_done";
  tasks: Task[];
}
const strings = (value: unknown): string[] => {
  if (!Array.isArray(value)) throw new Error("Expected string array");
  return value.map(text);
};
export async function snapshot(
  target: Target,
  run: Command = command,
  signal?: AbortSignal,
): Promise<Snapshot> {
  // Revalidate local scope and status on every cycle, not just entry.
  const refreshed = await preflightLocalTarget(
    { changeId: target.changeId },
    target.cwd,
    run,
    signal,
  );
  if (refreshed.changeRoot !== target.changeRoot)
    throw new Error("Changed verification target");
  const reply = await run(
    ["instructions", "apply", "--change", target.changeId, "--json"],
    target.cwd,
    signal,
  );
  if (reply.exitCode !== 0)
    throw new Error(`OpenSpec apply instructions failed: ${reply.stderr}`);
  const data = object(JSON.parse(reply.stdout));
  if (
    data.changeName !== target.changeId ||
    data.changeDir !== target.changeRoot ||
    !["blocked", "ready", "all_done"].includes(String(data.state))
  )
    throw new Error("Invalid current verification context");
  const files = object(data.contextFiles);
  if (!Array.isArray(files.tasks) || !files.tasks.length)
    throw new Error("Missing usable tasks artifact; run implementation first");
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
        throw new Error("Escaping or symlinked verification context");
    }
  }
  if (!Array.isArray(data.tasks) || !data.tasks.length)
    throw new Error("Missing usable task snapshot; run implementation first");
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
    throw new Error("Inconsistent task snapshot");
  return {
    status: refreshed.status,
    instructions: data,
    tasks,
    state: data.state as Snapshot["state"],
  };
}
export async function preflight(
  input: unknown,
  cwd: string,
  run: Command = command,
  signal?: AbortSignal,
): Promise<Target> {
  const target = await preflightLocalTarget(input, cwd, run, signal);
  const current = await snapshot(target, run, signal);
  if (current.state === "blocked" || current.tasks.some((task) => !task.done))
    throw new Error(
      "Incomplete implementation: complete tasks with openspec-implement before verification",
    );
  return target;
}
export type Severity = "CRITICAL" | "WARNING" | "SUGGESTION";
export interface Finding {
  id: string;
  severity: Severity;
  issue: string;
  recommendation: string;
  evidence: string[];
}
export interface Dimension {
  status: "checked" | "inapplicable" | "missing";
  reason: string;
  evidence: string[];
}
export interface Gate {
  command: string;
  exitCode: number | null;
  result: string;
}
export interface Report {
  report: string;
  conclusive: boolean;
  dimensions: Record<"completeness" | "correctness" | "coherence", Dimension>;
  findings: Finding[];
  gates: Gate[];
  noApplicableGates: string | null;
  missingEvidence: string[];
}
function gates(value: unknown): Gate[] {
  if (!Array.isArray(value)) throw new Error("Missing gate evidence array");
  return value.map((value) => {
    const gate = object(value);
    if (gate.exitCode !== null && !Number.isInteger(gate.exitCode))
      throw new Error("Invalid gate result");
    return {
      command: text(gate.command),
      exitCode: gate.exitCode as number | null,
      result: text(gate.result),
    };
  });
}
export function parseReport(raw: string): Report {
  const data = object(JSON.parse(raw));
  if (typeof data.conclusive !== "boolean" || !Array.isArray(data.findings))
    throw new Error("Unusable verification report");
  const dims = object(data.dimensions);
  const dimension = (key: string): Dimension => {
    const d = object(dims[key]);
    if (!["checked", "inapplicable", "missing"].includes(String(d.status)))
      throw new Error("Invalid verification dimension");
    const evidence = strings(d.evidence);
    if (d.status === "checked" && !evidence.length)
      throw new Error("Checked dimension lacks evidence references");
    return {
      status: d.status as Dimension["status"],
      reason: text(d.reason),
      evidence,
    };
  };
  const ids = new Set<string>();
  const findings = data.findings.map((value) => {
    const f = object(value);
    const id = text(f.id);
    const evidence = strings(f.evidence);
    if (
      !/^[a-zA-Z0-9-]+$/.test(id) ||
      id.startsWith("flow-") ||
      ids.has(id) ||
      !["CRITICAL", "WARNING", "SUGGESTION"].includes(String(f.severity)) ||
      !evidence.length
    )
      throw new Error("Invalid finding identity, severity or references");
    ids.add(id);
    return {
      id,
      severity: f.severity as Severity,
      issue: text(f.issue),
      recommendation: text(f.recommendation),
      evidence,
    };
  });
  return {
    report: text(data.report),
    conclusive: data.conclusive,
    dimensions: {
      completeness: dimension("completeness"),
      correctness: dimension("correctness"),
      coherence: dimension("coherence"),
    },
    findings,
    gates: gates(data.gates),
    noApplicableGates:
      data.noApplicableGates === null ? null : text(data.noApplicableGates),
    missingEvidence: strings(data.missingEvidence),
  };
}
/** Turn explicit absent/failed evidence and reopened tasks into assessable blockers. */
export function currentReport(report: Report, current: Snapshot): Report {
  const findings = [...report.findings];
  const add = (
    id: string,
    issue: string,
    recommendation: string,
    evidence: string[],
  ) => {
    findings.push({
      id: `flow-${id}`,
      severity: "WARNING",
      issue,
      recommendation,
      evidence,
    });
  };
  report.missingEvidence.forEach((item, i) => {
    add(
      `evidence-${i}`,
      `Missing required evidence: ${item}`,
      "Establish required evidence; human guidance cannot waive it",
      [item],
    );
  });
  for (const [key, dim] of Object.entries(report.dimensions))
    if (dim.status === "missing")
      add(
        `dimension-${key}`,
        `Missing required ${key} check: ${dim.reason}`,
        "Perform the required verification check",
        [dim.reason],
      );
  report.gates.forEach((gate, i) => {
    if (gate.exitCode !== 0)
      add(
        `gate-${i}`,
        `Required gate unavailable or failing: ${gate.command}`,
        "Run and pass the applicable gate",
        [gate.result],
      );
  });
  if (!report.gates.length && !report.noApplicableGates)
    add(
      "gates",
      "No applicable gate evidence or scope justification",
      "Establish applicable current gates or justify inapplicability",
      ["Current project instructions"],
    );
  current.tasks
    .filter((task) => !task.done)
    .forEach((task, i) => {
      add(
        `task-${i}`,
        `Reopened task ${task.id}: ${task.description}`,
        "Complete the reopened task within approved intent",
        [String(current.instructions.changeDir), `task ${task.id}`],
      );
    });
  if (current.state === "blocked")
    add(
      "context",
      "Current apply context is blocked",
      "Resolve missing approved artifacts with scoped human steering",
      [JSON.stringify(current.instructions)],
    );
  return { ...report, findings };
}
export const blocking = (report: Report) =>
  report.findings.filter((f) => f.severity !== "SUGGESTION");
export function acceptanceSupported(
  report: Report,
  current: Snapshot,
): boolean {
  return report.conclusive && !blocking(currentReport(report, current)).length;
}
export interface Resolution {
  id: string;
  findingIds: string[];
  issue: string;
  recommendation: string;
  scope: string;
  paths: string[];
  escalation: boolean;
  reason: string;
}
export interface Assessment {
  resolutions: Resolution[];
}
export interface Authorization {
  resolution: Resolution;
  answer: string;
}
async function scopedPath(target: Target, value: unknown): Promise<string> {
  const path = resolve(target.cwd, text(value));
  if (!contains(target.cwd, path)) throw new Error("Escaping resolution path");
  // New paths are allowed, but every existing ancestor must remain canonical.
  let existing = path;
  while (true) {
    try {
      await lstat(existing);
      if ((await realpath(existing)) !== existing)
        throw new Error("Symlinked resolution path");
      break;
    } catch (error) {
      if (object(error).code !== "ENOENT") throw error;
      existing = dirname(existing);
    }
  }
  return path;
}
export async function parseAssessment(
  raw: string,
  target: Target,
  report: Report,
): Promise<Assessment> {
  const data = object(JSON.parse(raw));
  if (!Array.isArray(data.resolutions) || !data.resolutions.length)
    throw new Error("Empty resolution assessment");
  const blockers = blocking(report);
  const ids = new Set<string>();
  const covered = new Set<string>();
  const resolutions = await Promise.all(
    data.resolutions.map(async (value) => {
      const r = object(value);
      const id = text(r.id);
      const findingIds = strings(r.findingIds);
      if (
        !/^[a-zA-Z0-9-]+$/.test(id) ||
        ids.has(id) ||
        !findingIds.length ||
        new Set(findingIds).size !== findingIds.length ||
        findingIds.some((id) => !blockers.some((f) => f.id === id)) ||
        typeof r.escalation !== "boolean" ||
        !Array.isArray(r.paths)
      )
        throw new Error("Invalid or unrelated resolution");
      ids.add(id);
      for (const findingId of findingIds) covered.add(findingId);
      const paths = await Promise.all(
        r.paths.map((path) => scopedPath(target, path)),
      );
      const escalation = r.escalation;
      const reason = text(r.reason);
      if (
        paths.some((path) => contains(resolve(target.cwd, "openspec"), path)) &&
        !escalation
      )
        throw new Error("Planning-artifact changes require explicit steering");
      return {
        id,
        findingIds,
        paths,
        escalation,
        reason,
        issue: text(r.issue),
        recommendation: text(r.recommendation),
        scope: text(r.scope),
      };
    }),
  );
  if (blockers.some((f) => !covered.has(f.id)))
    throw new Error("Incomplete blocking-finding assessment");
  return { resolutions };
}
export function authorize(
  assessment: Assessment,
  answers: Record<string, string>,
): Authorization[] {
  const issues = assessment.resolutions.filter((r) => r.escalation);
  if (
    !issues.length ||
    Object.keys(answers).some((id) => !issues.some((r) => r.id === id))
  )
    throw new Error("Steering outside current resolution scope");
  return issues.map((resolution) => ({
    resolution,
    answer: text(answers[resolution.id]),
  }));
}
const policy =
  "Preserve unrelated dirty edits. No sync, archive, commit, stash, reset, rollback, or extra report file. This is prompt-level policy, not OS isolation or a tool permission grant.";
const shape =
  '{"report":"full Markdown verification report","conclusive":true,"dimensions":{"completeness":{"status":"checked","reason":"...","evidence":["file:line"]},"correctness":{"status":"checked","reason":"...","evidence":["file:line"]},"coherence":{"status":"inapplicable","reason":"no design artifact under this schema","evidence":[]}},"findings":[{"id":"unique-id","severity":"WARNING","issue":"...","recommendation":"...","evidence":["file:line"]}],"gates":[{"command":"npm test","exitCode":0,"result":"current command output"}],"noApplicableGates":null,"missingEvidence":[]}';
export function verifyPrompt(
  target: Target,
  current: Snapshot,
  steering: Authorization[],
): string {
  return `/skill:openspec-verify-change ${target.changeId}\nOpenSpec independent verification flow for explicit changeId ${target.changeId}. READ-ONLY: inspect implementation and EVERY current contextFiles artifact and run applicable checks, but do not edit implementation or planning artifacts. Do not repair findings. No prior implement transcript is required. Check completeness, correctness and coherence; preserve the skill's useful report prose. Outer acceptance is STRICTER than archive-readiness prose: no CRITICAL/WARNING, conclusive, all required current evidence; SUGGESTIONs may remain. Missing required evidence is at least WARNING, never an allowed skip or human waiver. Justify checks genuinely inapplicable under the schema/project scope. Establish current applicable gate evidence; do not rely on earlier repair claims. Use unique finding IDs not starting flow-. ${policy}\nCURRENT SNAPSHOT: ${JSON.stringify(current)}\nACCUMULATED SCOPED STEERING: ${JSON.stringify(steering)}\nReturn ONLY JSON with full Markdown report and validated supporting envelope: ${shape}`;
}
export function judgePrompt(current: Snapshot, report: Report): string {
  return `Read-only verification classifier: choose exactly accepted, blocking, or inconclusive. Classify the FULL report and evidence, not its archive-ready sentence. accepted requires conclusive no CRITICAL or WARNING and no missing required evidence, all current tasks done and applicable gates passed. Suggestions may remain. Judge gate/check applicability against current project instructions, artifacts and affected scope; merely listing a passing command does not establish that all required checks ran. Evaluate inapplicability reasons against the selected schema, not just their presence. Justified schema-inapplicable checks are allowed; absent required checks cannot be waived. Unusable/inconclusive evidence is inconclusive. Do not edit, repair, or invent consent.\n${JSON.stringify({ current, report })}`;
}
export function assessPrompt(
  target: Target,
  current: Snapshot,
  report: Report,
  steering: Authorization[],
): string {
  return `Read-only verification resolution assessment for ${target.changeId}. Assess ONLY current blocking findings including missing required evidence, not suggestions. Do not edit or repair. Associate every blocking finding with resolutions. Scope automatic work to approved intent. Ambiguous requirements, design changes, destructive actions and missing external access require escalation:true and an explicit reason/requested scope. Planning-artifact edits are never automatic. Any mixed batch waits for ALL consequential answers. Human steering cannot waive required evidence. Proposed paths may include new repository code/test files, never escaping paths. Relevant prior guidance retains ONLY its original issue-associated scope and does not grant tool permissions. ${policy}\n${JSON.stringify({ current, report, steering })}\nReturn ONLY JSON: {"resolutions":[{"id":"unique-resolution-id","findingIds":["current-blocking-id"],"issue":"...","recommendation":"...","scope":"precise intended work or requested authorization","paths":["repository/path"],"escalation":false,"reason":"why within approved intent or what human decision is needed"}]}. Use paths:[] for evidence-only checks when no file changes are proposed.`;
}
export interface RepairReport {
  summary: string;
  changes: string[];
  unresolved: string[];
  gates: Gate[];
}
export function parseRepairReport(raw: string): RepairReport {
  const data = object(JSON.parse(raw));
  return {
    summary: text(data.summary),
    changes: strings(data.changes),
    unresolved: strings(data.unresolved),
    gates: gates(data.gates),
  };
}
export function repairPrompt(
  target: Target,
  current: Snapshot,
  report: Report,
  assessment: Assessment,
  steering: Authorization[],
  attempt: number,
): string {
  const scoped = assessment.resolutions.filter((r) => r.escalation);
  if (
    scoped.some(
      (r) =>
        !steering.some(
          (a) =>
            a.answer.trim() &&
            (a.resolution === r ||
              JSON.stringify(a.resolution) === JSON.stringify(r)),
        ),
    )
  )
    throw new Error("Missing scoped repair authorization");
  return `OpenSpec verification repair for ${target.changeId}; repair attempt ${attempt}. Apply ONLY assessed current CRITICAL/WARNING fixes and necessary supporting changes. No independent SUGGESTION cleanup; no nested implement flow or nested budget. Stay within approved intent, assessed paths/scope and explicit associated steering. Do not autonomously rewrite requirements/design to eliminate findings. Planning changes require explicit scoped authorization in the associated answer. Stop and report newly discovered ambiguity, design changes, destructive actions or missing access instead of inventing consent. Run ALL applicable project gates after relevant edits (format first). Report commands/results and unresolved issues; every normal return will receive fresh independent verification, regardless of your completion claims. Human guidance does not waive evidence or broaden authority. ${policy}\n${JSON.stringify({ current, report, assessment, steering, attempt })}\nReturn ONLY JSON: {"summary":"useful repair prose","changes":["path and change"],"unresolved":["remaining issue"],"gates":[{"command":"npm test","exitCode":0,"result":"actual output"}]}. Ordinary test failures belong in this report, not invocation errors.`;
}
