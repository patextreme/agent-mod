import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { type Command, command } from "./command.js";
import { object, text } from "./data.js";

/** Strict descendant check; the root itself is not contained. */
export function contains(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel !== "" && !rel.startsWith("../") && rel !== ".." && !isAbsolute(rel)
  );
}

export interface LocalTarget {
  changeId: string;
  cwd: string;
  changeRoot: string;
  status: Record<string, unknown>;
}

/** Select an active repo-local change, without requiring any planning artifacts. */
export async function preflightLocalTarget(
  input: unknown,
  cwd: string,
  run: Command = command,
  signal?: AbortSignal,
): Promise<LocalTarget> {
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
    !(await lstat(changeRoot)).isDirectory() ||
    object(status.actionContext).mode !== "repo-local"
  )
    throw new Error("Non-local or escaping change scope");
  return { changeId, cwd: root, changeRoot, status };
}
