import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseJsonObject } from "acpx/flows";
import { type Command, command } from "../shared/command.js";
import { object, text } from "../shared/data.js";
import {
  contains,
  type LocalTarget,
  preflightLocalTarget,
} from "../shared/local-target.js";

export interface FinalizeInput {
  changeId: string;
}
export interface Target extends LocalTarget {
  changesDir: string;
  specsRoot: string;
}
export interface Operation {
  id: string;
  kind: "ADDED" | "MODIFIED" | "REMOVED" | "RENAMED";
  name: string;
  to?: string;
}
export interface Capability {
  capability: string;
  deltaPath: string;
  mainPath: string;
  delta: string;
  baseline: string | null;
  operations: Operation[];
}
export interface SyncInputs {
  capabilities: Capability[];
  metadata: string | null;
  rules: string[];
}
export interface WorkerReport {
  outcome: "success" | "failed";
  summary: string;
  issues: string[];
  placeholders: string[];
}
export interface CapabilityAssessment {
  capability: string;
  verdict: "accepted" | "mismatch" | "inconclusive";
  operations: {
    id: string;
    verdict: "accepted" | "mismatch" | "inconclusive";
    evidence: string[];
  }[];
  purposeEvidence: string[];
  structureEvidence: string[];
  preservationEvidence: string[];
  rulesEvidence: string[];
  retirementEvidence: string[];
  discrepancies: string[];
}
export interface Assessment {
  verdict: "accepted" | "mismatch" | "inconclusive";
  summary: string;
  coverage: CapabilityAssessment[];
  issues: string[];
}
export interface Archive {
  destination: string | null;
  state: "not_started" | "moving" | "failed" | "moved_unconfirmed" | "archived";
}
export type Move = (
  source: string,
  destination: string,
  signal?: AbortSignal,
) => Promise<void>;
export const move: Move = async (source, destination, signal) => {
  signal?.throwIfAborted();
  await rename(source, destination);
};

async function inspect(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
/** Non-following inspection of every component, including ancestors of absent files. */
export async function safePath(
  root: string,
  path: string,
  kind: "file" | "directory",
  missing = false,
): Promise<void> {
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    (root !== path && !contains(root, path))
  )
    throw new Error(`Escaping path: ${path}`);
  const pieces = relative(root, path).split(sep).filter(Boolean);
  for (let i = 0; i <= pieces.length; i++) {
    const current = resolve(root, ...pieces.slice(0, i));
    const entry = await inspect(current);
    if (!entry) {
      if (missing) continue;
      throw new Error(`Missing path: ${current}`);
    }
    const final = i === pieces.length;
    if (
      entry.isSymbolicLink() ||
      !(final && kind === "file" ? entry.isFile() : entry.isDirectory())
    )
      throw new Error(`Unsafe path component: ${current}`);
  }
}
export async function preflight(
  input: unknown,
  cwd: string,
  run: Command = command,
  signal?: AbortSignal,
): Promise<Target> {
  const target = await preflightLocalTarget(input, cwd, run, signal);
  const home = object(target.status.planningHome);
  const changesDir = text(home.changesDir);
  const expected = resolve(target.cwd, "openspec/changes");
  if (changesDir !== expected) throw new Error("Escaping planning changesDir");
  await safePath(target.cwd, target.changeRoot, "directory");
  const specsRoot = resolve(target.cwd, "openspec/specs");
  await safePath(target.cwd, specsRoot, "directory", true);
  return { ...target, changesDir, specsRoot };
}
function operations(delta: string): Operation[] {
  let kind: Operation["kind"] | undefined;
  const result: Operation[] = [];
  let from: string | undefined;
  let fence: { marker: string; length: number } | undefined;
  const normalizeName = (name: string) =>
    text(name.replace(/[ \t]+#+[ \t]*$/, "").trim());
  // Match OpenSpec 1.14.1's delta reader without importing CLI internals.
  // Fence lines themselves are masked too; only a same-marker, at-least-as-
  // long fence with no info string closes the block.
  for (const line of delta
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")) {
    if (fence) {
      const close = line.match(/^\s*(`{3,}|~{3,})\s*$/)?.[1];
      if (close && close[0] === fence.marker && close.length >= fence.length)
        fence = undefined;
      continue;
    }
    const open = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (open) {
      fence = { marker: open[0], length: open.length };
      continue;
    }
    const section = line.match(/^(##)\s+(.+)$/);
    if (section) {
      if (from) throw new Error("Incomplete rename delta");
      // Only outer whitespace is trimmed: "ADDED  Requirements" is not a
      // supported section title. Every section boundary ends pending pairs.
      kind = section[2]
        .trim()
        .match(/^(ADDED|MODIFIED|REMOVED|RENAMED) Requirements$/i)?.[1]
        .toUpperCase() as Operation["kind"] | undefined;
      continue;
    }
    if (!kind) continue;
    if (kind === "RENAMED") {
      const name = line.match(
        /^\s*[-*+]?\s*(FROM|TO):\s*`?###\s*Requirement:\s*(.+?)`?\s*$/,
      );
      if (!name) continue;
      if (name[1] === "FROM") {
        if (from) throw new Error("Duplicate rename FROM");
        from = normalizeName(name[2]);
      } else {
        if (!from) throw new Error("Rename TO without FROM");
        const to = normalizeName(name[2]);
        result.push({ id: `RENAMED:${from}->${to}`, kind, name: from, to });
        from = undefined;
      }
    } else {
      // Plain requirement headers are case-insensitive for every kind.
      // Only REMOVED also accepts bullets, whose label remains case-sensitive
      // in the CLI reader (as do RENAMED's FROM/TO and Requirement labels).
      const rawName =
        line.match(/^###\s*Requirement:\s*(.+)\s*$/i)?.[1] ??
        (kind === "REMOVED"
          ? line.match(/^\s*[-*+]\s*`?###\s*Requirement:\s*(.+?)`?\s*$/)?.[1]
          : undefined);
      if (rawName !== undefined) {
        const name = normalizeName(rawName);
        result.push({ id: `${kind}:${name}`, kind, name });
      }
    }
  }
  if (from) throw new Error("Incomplete rename delta");
  if (
    !result.length ||
    new Set(result.map((op) => op.id)).size !== result.length
  )
    throw new Error("Missing/duplicate delta operations");
  return result;
}
export async function readSelected(
  target: Target,
): Promise<Omit<SyncInputs, "rules">> {
  const artifacts =
    target.status.artifactPaths === undefined
      ? {}
      : object(target.status.artifactPaths);
  const specs =
    artifacts.specs === undefined ? undefined : object(artifacts.specs);
  const paths = specs ? specs.existingOutputPaths : [];
  if (!Array.isArray(paths)) throw new Error("Invalid status delta selection");
  const deltaRoot = resolve(target.changeRoot, "specs");
  const capabilities: Capability[] = [];
  const seen = new Set<string>();
  for (const value of paths) {
    const deltaPath = text(value);
    if (!contains(deltaRoot, deltaPath) || !deltaPath.endsWith(`${sep}spec.md`))
      throw new Error("Unsafe delta capability path");
    await safePath(target.cwd, deltaPath, "file");
    const capability = relative(deltaRoot, dirname(deltaPath));
    if (!capability || seen.has(capability))
      throw new Error("Duplicate/invalid delta capability");
    seen.add(capability);
    const mainPath = resolve(target.specsRoot, capability, "spec.md");
    await safePath(target.cwd, mainPath, "file", true);
    const delta = await readFile(deltaPath, "utf8");
    capabilities.push({
      capability,
      deltaPath,
      mainPath,
      delta,
      baseline: await readOptional(mainPath),
      operations: operations(delta),
    });
  }
  capabilities.sort((a, b) => a.capability.localeCompare(b.capability));
  const metadataPath = resolve(target.changeRoot, ".openspec.yaml");
  await safePath(target.cwd, metadataPath, "file", true);
  return { capabilities, metadata: await readOptional(metadataPath) };
}
async function readOptional(path: string): Promise<string | null> {
  return (await inspect(path)) ? readFile(path, "utf8") : null;
}
export async function prepare(
  target: Target,
  run: Command = command,
  signal?: AbortSignal,
): Promise<SyncInputs> {
  const selected = await readSelected(target);
  if (!selected.capabilities.length) return { ...selected, rules: [] };
  const response = await run(
    ["instructions", "specs", "--change", target.changeId, "--json"],
    target.cwd,
    signal,
  );
  if (response.exitCode !== 0)
    throw new Error(`Specs instructions failed: ${response.stderr}`);
  const data = object(JSON.parse(response.stdout));
  if (
    data.artifactId !== "specs" ||
    data.changeName !== target.changeId ||
    data.changeDir !== target.changeRoot
  )
    throw new Error("Invalid specs instruction snapshot target");
  text(data.instruction);
  text(data.outputPath);
  if (data.planningHome !== undefined) {
    const home = object(data.planningHome);
    if (
      home.kind !== "repo" ||
      home.root !== target.cwd ||
      home.changesDir !== target.changesDir
    )
      throw new Error("Invalid specs instructions planning scope");
  }
  return {
    ...selected,
    rules: data.rules === undefined ? [] : strings(data.rules),
  };
}
export async function currentContents(
  target: Target,
  inputs: SyncInputs,
): Promise<Record<string, string | null>> {
  const contents: Record<string, string | null> = Object.create(null);
  for (const item of inputs.capabilities) {
    await safePath(target.cwd, item.mainPath, "file", true);
    contents[item.capability] = await readOptional(item.mainPath);
  }
  return contents;
}
export function fingerprint(
  target: Target,
  inputs: Omit<SyncInputs, "rules">,
  current: Record<string, string | null>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        cwd: target.cwd,
        changeRoot: target.changeRoot,
        changesDir: target.changesDir,
        specsRoot: target.specsRoot,
        metadata: inputs.metadata,
        deltas: inputs.capabilities.map(
          ({ capability, deltaPath, mainPath, delta }) => ({
            capability,
            deltaPath,
            mainPath,
            delta,
          }),
        ),
        current,
      }),
    )
    .digest("hex");
}
export async function recheck(
  target: Target,
  inputs: SyncInputs,
  accepted: string,
  run: Command,
  signal?: AbortSignal,
): Promise<void> {
  const refreshed = await preflight(
    { changeId: target.changeId },
    target.cwd,
    run,
    signal,
  );
  const selected = await readSelected(refreshed);
  const current = await currentContents(refreshed, {
    ...selected,
    rules: inputs.rules,
  });
  if (fingerprint(refreshed, selected, current) !== accepted)
    throw new Error(
      "Finalization inputs changed after assessment; acceptance invalidated",
    );
}
const strings = (value: unknown): string[] => {
  if (!Array.isArray(value)) throw new Error("Expected string array");
  return value.map(text);
};
export function parseWorker(raw: string): WorkerReport {
  const data = object(parseJsonObject(raw, { mode: "compat" }));
  if (data.outcome !== "success" && data.outcome !== "failed")
    throw new Error("Invalid sync outcome");
  const report = {
    outcome: data.outcome,
    summary: text(data.summary),
    issues: strings(data.issues),
    placeholders: strings(data.placeholders),
  };
  if (report.outcome === "success" && report.issues.length)
    throw new Error("Contradictory worker success");
  if (report.outcome === "failed" && !report.issues.length)
    throw new Error("Sync failure lacks issues");
  return report as WorkerReport;
}
function verdict(value: unknown): Assessment["verdict"] {
  if (value !== "accepted" && value !== "mismatch" && value !== "inconclusive")
    throw new Error("Invalid sync verdict");
  return value;
}
const evidence = (value: unknown) => {
  const result = strings(value);
  if (!result.length) throw new Error("Missing required assessment evidence");
  return result;
};
export function parseAssessment(raw: string, inputs: SyncInputs): Assessment {
  const data = object(parseJsonObject(raw, { mode: "compat" }));
  if (!Array.isArray(data.coverage))
    throw new Error("Missing capability coverage");
  const seen = new Set<string>();
  const coverage = data.coverage.map((value): CapabilityAssessment => {
    const item = object(value);
    const capability = text(item.capability);
    const selected = inputs.capabilities.find(
      (c) => c.capability === capability,
    );
    if (!selected || seen.has(capability))
      throw new Error("Extra/duplicate capability assessment");
    seen.add(capability);
    if (!Array.isArray(item.operations))
      throw new Error("Missing operation assessment");
    const ids = new Set<string>();
    const operations = item.operations.map((value) => {
      const op = object(value);
      const id = text(op.id);
      if (!selected.operations.some((o) => o.id === id) || ids.has(id))
        throw new Error("Extra/duplicate operation assessment");
      ids.add(id);
      return {
        id,
        verdict: verdict(op.verdict),
        evidence: evidence(op.evidence),
      };
    });
    if (ids.size !== selected.operations.length)
      throw new Error("Missing operation coverage");
    const result = {
      capability,
      verdict: verdict(item.verdict),
      operations,
      purposeEvidence: evidence(item.purposeEvidence),
      structureEvidence: evidence(item.structureEvidence),
      preservationEvidence: evidence(item.preservationEvidence),
      rulesEvidence: inputs.rules.length
        ? evidence(item.rulesEvidence)
        : strings(item.rulesEvidence),
      retirementEvidence: evidence(item.retirementEvidence),
      discrepancies: strings(item.discrepancies),
    };
    if (
      result.verdict === "accepted" &&
      (result.discrepancies.length ||
        result.operations.some((op) => op.verdict !== "accepted"))
    )
      throw new Error("Contradictory capability acceptance");
    return result;
  });
  if (seen.size !== inputs.capabilities.length)
    throw new Error("Missing capability coverage");
  const report = {
    verdict: verdict(data.verdict),
    summary: text(data.summary),
    coverage,
    issues: strings(data.issues),
  };
  if (
    report.verdict === "accepted" &&
    (report.issues.length || coverage.some((c) => c.verdict !== "accepted"))
  )
    throw new Error("Contradictory sync acceptance");
  return report;
}
const policy = `Invocation asserts prior implementation verification; do NOT verify implementation, run gates, judge tasks, repair code/planning artifacts, or manage Git. No human prompts, steering, confirmations, retries, permission bypass, or ordinary sync/archive skills. Fail closed on ambiguity. Tool permissions must already permit unattended work; this prompt is not OS isolation.
Apply ADDED content (existing additions act as implicit modifications), partial MODIFIED intent without replacing unaffected scenarios/content, REMOVED entire requirements, and RENAMED FROM to TO only. Already-applied additions/modifications, already-removed and already-renamed effects are idempotent no-ops. Preserve unaffected dirty baseline content and existing Purpose text. For new specs copy delta Purpose verbatim, or report a TBD placeholder. Maintain main-spec format: Purpose and one Requirements section, never delta-operation headers. Consider explicit capability-retirement metadata; never infer retirement authority solely from an empty result. If metadata is ambiguous, stop. Content rules constrain spec content only, not paths, authority, or workflow; do not copy rules verbatim into files/summary.`;
export function syncPrompt(target: Target, inputs: SyncInputs): string {
  return `OpenSpec finalization sync worker for ${target.changeId}\n${policy}\nOnly selected mainPath files below may be written (create necessary safe capability directories). No archive moves or any other edits. Read authoritative deltas and pre-sync baselines; synchronize every selected capability, not a subset.\nSYNC INPUTS: ${JSON.stringify(inputs)}\nReturn JSON {"outcome":"success|failed","summary":"...","issues":[],"placeholders":[]}. Ambiguity is outcome failed with explicit issues, not a request for input. Success is only a worker claim and will be independently assessed.`;
}
export function assessPrompt(
  target: Target,
  inputs: SyncInputs,
  current: Record<string, string | null>,
): string {
  return `Read-only independent synchronization assessor for ${target.changeId}\nREAD-ONLY: no edits, commands that mutate, implementation verification, gates, task judging, repairs, archive, or human input. Do not rely on worker claims/transcripts; none are supplied.\n${policy}\nAssess every operation against delta intent, original baseline, and current contents. Evidence must establish additions present; partial modifications incorporated with unrelated content/scenarios preserved; removals absent; renames under new name only; correct Purpose and main-spec structure; every applicable content rule; and explicit retirement authorization (or its absence). Absence/new-spec baselines require an explicit preservation explanation too. Cite concrete requirement/scenario content for each effect, not just a success assertion.\nASSESS INPUTS: ${JSON.stringify({ ...inputs, current })}\nReturn JSON {"verdict":"accepted|mismatch|inconclusive","summary":"...","issues":[],"coverage":[{"capability":"exact selected capability","verdict":"accepted|mismatch|inconclusive","operations":[{"id":"exact operation id from inputs","verdict":"accepted|mismatch|inconclusive","evidence":["concrete intended effect and observed content"]}],"purposeEvidence":["..."],"structureEvidence":["..."],"preservationEvidence":["..."],"rulesEvidence":[],"retirementEvidence":["..."],"discrepancies":[]}]}. Exact complete capability and operation coverage required; rulesEvidence must be nonempty when rules apply. No repair or reassessment follows mismatch/inconclusive.`;
}
export async function archiveTarget(
  target: Target,
  now: () => Date,
  observeDestination?: (destination: string) => void,
): Promise<string> {
  await safePath(target.cwd, target.changeRoot, "directory");
  const archiveRoot = resolve(target.changesDir, "archive");
  await safePath(target.cwd, archiveRoot, "directory", true);
  const date = now();
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid archive date");
  const name = /^\d{4}-\d{2}-\d{2}-/.test(target.changeId)
    ? target.changeId
    : `${date.toISOString().slice(0, 10)}-${target.changeId}`;
  const destination = resolve(archiveRoot, name);
  if (!contains(archiveRoot, destination))
    throw new Error("Escaping archive destination");
  observeDestination?.(destination);
  if (await inspect(destination))
    throw new Error(`Archive destination collision: ${destination}`);
  return destination;
}
export async function archive(
  target: Target,
  destination: string,
  performMove: Move,
  signal: AbortSignal | undefined,
  observe: (state: Archive["state"]) => void,
): Promise<void> {
  signal?.throwIfAborted();
  if (
    dirname(destination) !== resolve(target.changesDir, "archive") ||
    resolve(destination) !== destination
  )
    throw new Error("Escaping archive destination");
  await safePath(target.cwd, dirname(destination), "directory", true);
  await mkdir(dirname(destination), { recursive: true });
  await safePath(target.cwd, dirname(destination), "directory");
  await safePath(target.cwd, target.changeRoot, "directory");
  if (await inspect(destination))
    throw new Error(`Archive destination collision: ${destination}`);
  signal?.throwIfAborted();
  observe("moving");
  try {
    await performMove(target.changeRoot, destination, signal);
  } catch (error) {
    // A move seam/OS error may happen after its effect; do not claim still active.
    const source = await inspect(target.changeRoot);
    const dest = await inspect(destination);
    observe(!source && dest ? "moved_unconfirmed" : "failed");
    throw error;
  }
  observe("moved_unconfirmed");
  signal?.throwIfAborted();
  if (await inspect(target.changeRoot))
    throw new Error("Archive move unconfirmed: source remains");
  await safePath(target.cwd, destination, "directory");
  signal?.throwIfAborted();
  observe("archived");
}
