import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { flowCandidates, listFlowNames, resolveFlowFile } from "./discovery.js";

/** Build an isolated set of project + global flow dirs for a test. */
function makeDirs(): {
  root: string;
  project: string;
  global: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "agentflow-test-"));
  const project = join(root, "proj", ".pi", "agentflow");
  const global = join(root, "global", ".pi", "agentflow");
  mkdirSync(project, { recursive: true });
  mkdirSync(global, { recursive: true });
  return {
    root,
    project,
    global,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("flowCandidates orders project .ts → project .js → global .ts → global .js", () => {
  const { project, global } = makeDirs();
  const candidates = flowCandidates("reviewcode", project, global);
  assert.deepEqual(candidates, [
    join(project, "reviewcode.ts"),
    join(project, "reviewcode.js"),
    join(global, "reviewcode.ts"),
    join(global, "reviewcode.js"),
  ]);
});

test("resolveFlowFile prefers a project script over a global one", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "reviewcode.ts"), "");
    writeFileSync(join(d.global, "reviewcode.ts"), "");
    const resolved = resolveFlowFile("reviewcode", join(d.root, "proj"));
    assert.ok(resolved);
    assert.equal(resolved?.path, join(d.project, "reviewcode.ts"));
    assert.equal(resolved?.isProject, true);
    assert.equal(resolved?.isTypeScript, true);
  } finally {
    d.cleanup();
  }
});

test("resolveFlowFile falls back to .js when no .ts exists", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "quick.js"), "");
    const resolved = resolveFlowFile("quick", join(d.root, "proj"));
    assert.ok(resolved);
    assert.equal(resolved?.path, join(d.project, "quick.js"));
    assert.equal(resolved?.isTypeScript, false);
  } finally {
    d.cleanup();
  }
});

test("resolveFlowFile falls back to the global dir when no project script exists", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.global, "shared.ts"), "");
    const resolved = resolveFlowFile("shared", join(d.root, "proj"), {
      globalDir: d.global,
    });
    assert.ok(resolved);
    assert.equal(resolved?.path, join(d.global, "shared.ts"));
    assert.equal(resolved?.isProject, false);
  } finally {
    d.cleanup();
  }
});

test("resolveFlowFile returns null when no script exists", () => {
  const d = makeDirs();
  try {
    const resolved = resolveFlowFile("nope", join(d.root, "proj"));
    assert.equal(resolved, null);
  } finally {
    d.cleanup();
  }
});

test("listFlowNames merges project and global flows, deduplicating and sorting", () => {
  const d = makeDirs();
  try {
    writeFileSync(join(d.project, "reviewcode.ts"), "");
    writeFileSync(join(d.project, "quick.js"), "");
    writeFileSync(join(d.global, "shared.ts"), "");
    // Same name in both dirs → deduplicated.
    writeFileSync(join(d.project, "dup.ts"), "");
    writeFileSync(join(d.global, "dup.js"), "");
    const names = listFlowNames(join(d.root, "proj"), { globalDir: d.global });
    assert.deepEqual(names, ["dup", "quick", "reviewcode", "shared"]);
  } finally {
    d.cleanup();
  }
});

test("listFlowNames returns empty when no flow dirs exist", () => {
  const d = makeDirs();
  try {
    const names = listFlowNames(join(d.root, "proj"), { globalDir: d.global });
    assert.deepEqual(names, []);
  } finally {
    d.cleanup();
  }
});
