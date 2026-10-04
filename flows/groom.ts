import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
export type Command = (
  args: string[],
  cwd: string,
  signal?: AbortSignal,
) => Promise<CommandResult>;
const execute = promisify(execFile);
export const command: Command = async (args, cwd, signal) => {
  try {
    const result = await execute("openspec", args, {
      cwd,
      signal,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ...result, exitCode: 0 };
  } catch (error) {
    const failure = error as Error & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    if (typeof failure.code !== "number" || signal?.aborted) throw error;
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      exitCode: failure.code,
    };
  }
};
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected JSON object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Expected nonblank string");
  return value;
}
export function contains(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel !== "" && !rel.startsWith("../") && rel !== ".." && !isAbsolute(rel)
  );
}
export interface Target {
  changeId: string;
  cwd: string;
  changeRoot: string;
  artifacts: string[];
}
export async function preflight(
  input: unknown,
  cwd: string,
  run: Command = command,
  signal?: AbortSignal,
): Promise<Target> {
  const data = object(input);
  const changeId = text(data.changeId);
  if (
    Object.keys(data).some((key) => key !== "changeId") ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(changeId)
  )
    throw new Error("Input must contain only a local kebab-case changeId");
  let root = await realpath(cwd);
  while (true) {
    try {
      await lstat(resolve(root, "openspec"));
      break;
    } catch {
      const parent = dirname(root);
      if (parent === root) throw new Error("No local OpenSpec workspace");
      root = parent;
    }
  }
  const local = await realpath(resolve(root, "openspec"));
  if (local !== resolve(root, "openspec"))
    throw new Error("Store-backed/symlinked OpenSpec roots are unsupported");
  const listing = await run(["list", "--json"], root, signal);
  if (listing.exitCode !== 0)
    throw new Error(`OpenSpec list failed: ${listing.stderr}`);
  const listed = object(JSON.parse(listing.stdout));
  if (
    object(listed.root).path !== root ||
    !Array.isArray(listed.changes) ||
    !listed.changes.some((item) => object(item).name === changeId)
  )
    throw new Error("Change is not active in this local workspace");
  const result = await run(
    ["status", "--change", changeId, "--json"],
    root,
    signal,
  );
  if (result.exitCode !== 0)
    throw new Error(`OpenSpec status failed: ${result.stderr}`);
  const status = object(JSON.parse(result.stdout));
  const expected = resolve(local, "changes", changeId);
  const changeRoot = await realpath(text(status.changeRoot));
  const home = object(status.planningHome);
  if (
    home.kind !== "repo" ||
    home.root !== root ||
    changeRoot !== expected ||
    text(status.changeRoot) !== expected ||
    object(status.actionContext).mode !== "repo-local"
  )
    throw new Error("Non-local or escaping change scope");
  const artifacts: string[] = [];
  for (const artifact of Object.values(object(status.artifactPaths))) {
    const paths = object(artifact).existingOutputPaths;
    if (!Array.isArray(paths)) throw new Error("Invalid schema artifact paths");
    for (const path of paths) {
      const file = text(path);
      if (
        !isAbsolute(file) ||
        !contains(changeRoot, file) ||
        (await realpath(file)) !== file ||
        !(await lstat(file)).isFile()
      )
        throw new Error("Escaping or non-file planning artifact");
      artifacts.push(file);
    }
  }
  if (!artifacts.length)
    throw new Error("No existing planning artifacts; creation is unsupported");
  return {
    changeId,
    cwd: root,
    changeRoot,
    artifacts: [...new Set(artifacts)],
  };
}
export interface Validation {
  route: "valid" | "invalid";
  issues: unknown[];
}
export async function validate(
  target: Target,
  run: Command = command,
  signal?: AbortSignal,
): Promise<Validation> {
  const result = await run(
    [
      "validate",
      target.changeId,
      "--type",
      "change",
      "--strict",
      "--json",
      "--no-interactive",
    ],
    target.cwd,
    signal,
  );
  const data = object(JSON.parse(result.stdout));
  if (!Array.isArray(data.items) || data.items.length !== 1)
    throw new Error("Unusable validation output");
  const item = object(data.items[0]);
  if (
    item.id !== target.changeId ||
    item.type !== "change" ||
    typeof item.valid !== "boolean" ||
    !Array.isArray(item.issues)
  )
    throw new Error("Unusable targeted validation output");
  for (const issue of item.issues) {
    const value = object(issue);
    text(value.message);
    text(value.level);
  }
  if (result.exitCode !== (item.valid ? 0 : 1))
    throw new Error(
      `Operational validation failure (${result.exitCode}): ${result.stderr}`,
    );
  return { route: item.valid ? "valid" : "invalid", issues: item.issues };
}
export interface Resolution {
  id: string;
  issue: string;
  recommendation: string;
  escalation: boolean;
  paths: string[];
}
export interface Assessment {
  route: "autonomous" | "steering" | "missing" | "inconclusive";
  resolutions: Resolution[];
  missingArtifacts: string[];
}
export function parseAssessment(raw: string, target: Target): Assessment {
  const data = object(JSON.parse(raw));
  if (
    typeof data.conclusive !== "boolean" ||
    !Array.isArray(data.missingArtifacts) ||
    !Array.isArray(data.resolutions)
  )
    throw new Error("Invalid assessment");
  const missingArtifacts = data.missingArtifacts.map(text);
  const ids = new Set<string>();
  const resolutions = data.resolutions.map((value) => {
    const issue = object(value);
    const id = text(issue.id);
    if (
      !/^[a-zA-Z0-9-]+$/.test(id) ||
      ids.has(id) ||
      typeof issue.escalation !== "boolean" ||
      !Array.isArray(issue.paths) ||
      !issue.paths.length
    )
      throw new Error("Invalid resolution identity, escalation, or paths");
    ids.add(id);
    const paths = issue.paths.map(text);
    if (paths.some((path) => !target.artifacts.includes(path)))
      throw new Error("Resolution outside existing artifact allowlist");
    return {
      id,
      issue: text(issue.issue),
      recommendation: text(issue.recommendation),
      escalation: issue.escalation,
      paths,
    };
  });
  const route = !data.conclusive
    ? "inconclusive"
    : missingArtifacts.length
      ? "missing"
      : !resolutions.length
        ? "inconclusive"
        : resolutions.some((issue) => issue.escalation)
          ? "steering"
          : "autonomous";
  return { route, resolutions, missingArtifacts };
}
export function updatePrompt(
  target: Target,
  assessment: Assessment,
  steering: Record<string, string>,
): string {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.changeId) ||
    target.changeRoot !==
      resolve(target.cwd, "openspec/changes", target.changeId) ||
    !target.artifacts.length ||
    target.artifacts.some(
      (path) => !isAbsolute(path) || !contains(target.changeRoot, path),
    )
  )
    throw new Error("Invalid authorized change scope");
  const checked = parseAssessment(
    JSON.stringify({
      conclusive: true,
      missingArtifacts: assessment.missingArtifacts,
      resolutions: assessment.resolutions,
    }),
    target,
  );
  if (
    !["autonomous", "steering"].includes(assessment.route) ||
    checked.route !== assessment.route
  )
    throw new Error("Assessment cannot authorize update");
  for (const issue of checked.resolutions)
    if (
      issue.escalation &&
      (typeof steering[issue.id] !== "string" || !steering[issue.id].trim())
    )
      throw new Error(`Missing steering for ${issue.id}`);
  if (
    Object.keys(steering).some(
      (id) =>
        !checked.resolutions.some(
          (issue) => issue.id === id && issue.escalation,
        ),
    )
  )
    throw new Error("Steering outside current-cycle escalations");
  return `OpenSpec grooming updater for ${target.changeId}\n\nOPENSpec GROOMING AUTHORIZATION (current cycle only)\n${JSON.stringify({ changeId: target.changeId, resolutions: checked.resolutions, steering, existingArtifactAllowlist: target.artifacts })}
You are the flow-owned planning updater, not a skill invocation. Do not invoke the built-in update skill.
Before ANY edits, run openspec status --change ${target.changeId} --json from the local workspace. Verify the selected active local change ID and changeRoot, repo-local actionContext, and schema-resolved artifactPaths.<id>.existingOutputPaths against this authorization. Verify every authorized path still exists as a regular file within that change, with no symlink or path escape. Reject invalid scope, incomplete steering, or required missing artifacts without applying any cycle fixes. Never write to a glob resolvedOutputPath.
Read all existing planning artifacts and reconcile the assessed resolutions across them. Apply only these assessed structural or Critical repairs together, with supplied steering, without additional per-artifact confirmations. Authorization does not independently target Major findings or unrelated inconsistencies. For substantial rewrites, first read openspec instructions <artifact-id> --change ${target.changeId} --json for the schema-resolved artifact. Honor applicable project context and artifact rules within this scope.
If you discover a new consequential architecture, design, product, high-stakes decision or materially different alternative, stop and report it for fresh assessment and steering; never invent consent. Use only current-cycle resolutions and steering, never previous-cycle transcripts.
Restrict writes to the supplied existing-artifact allowlist and assessed resolution paths. No new files, unrelated edits, implementation changes, Git automation, report files, or tool permission overrides. Preserve existing dirty edits. Stop if a required artifact is missing. This authorization does not approve tools, bypass permission denials, or enable YOLO. Report revised artifacts and any unresolved limitation in your response only.`;
}
