import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import type { Command } from "./command.js";
import { object, text } from "./data.js";
import { contains, preflightLocalTarget } from "./local-target.js";

async function fixture(t: TestContext) {
  const cwd = await mkdtemp(join(tmpdir(), "flow-target-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const changeRoot = join(cwd, "openspec/changes/example");
  await mkdir(changeRoot, { recursive: true });
  const status = {
    changeRoot,
    planningHome: { kind: "repo", root: cwd },
    actionContext: { mode: "repo-local" },
    artifactPaths: {},
  };
  const listing = { root: { path: cwd }, changes: [{ name: "example" }] };
  const calls: { args: string[]; cwd: string; signal?: AbortSignal }[] = [];
  const command: Command = async (args, root, signal) => {
    calls.push({ args, cwd: root, signal });
    return {
      stdout: JSON.stringify(args[0] === "list" ? listing : status),
      stderr: "",
      exitCode: 0,
    };
  };
  return { cwd, changeRoot, status, listing, calls, command };
}

test("shared target preflight accepts an artifact-free change and returns untouched status", async (t) => {
  const f = await fixture(t);
  // Implementation must be able to report blocked apply even without artifacts.
  for (const paths of [{}, { tasks: { existingOutputPaths: [] } }]) {
    f.status.artifactPaths = paths;
    assert.deepEqual(
      await preflightLocalTarget({ changeId: "example" }, f.cwd, f.command),
      {
        changeId: "example",
        cwd: f.cwd,
        changeRoot: f.changeRoot,
        status: f.status,
      },
    );
  }
});

test("shared preflight selects the ancestor workspace and forwards targeted arguments and signal", async (t) => {
  const f = await fixture(t);
  const nested = join(f.cwd, "src/nested");
  await mkdir(nested, { recursive: true });
  const signal = new AbortController().signal;
  await preflightLocalTarget(
    { changeId: "example" },
    nested,
    f.command,
    signal,
  );
  assert.deepEqual(f.calls, [
    { args: ["list", "--json"], cwd: f.cwd, signal },
    { args: ["status", "--change", "example", "--json"], cwd: f.cwd, signal },
  ]);
});

test("shared preflight rejects malformed or store-selecting input before commands", async (t) => {
  const f = await fixture(t);
  for (const input of [
    null,
    [],
    {},
    { changeId: " " },
    { changeId: "../example" },
    { changeId: "archive/example" },
    { changeId: "example;rm" },
    { changeId: "Example" },
    { changeId: "example", store: "other" },
  ])
    await assert.rejects(preflightLocalTarget(input, f.cwd, f.command));
  assert.equal(f.calls.length, 0);
});

test("shared preflight rejects missing/archived targets and mismatched listing roots before status", async (t) => {
  const f = await fixture(t);
  for (const listing of [
    { ...f.listing, changes: [] },
    { ...f.listing, changes: [{ name: "archived" }] },
    { ...f.listing, root: { path: join(f.cwd, "other") } },
  ]) {
    const command: Command = async (args) => {
      assert.equal(args[0], "list");
      return { stdout: JSON.stringify(listing), stderr: "", exitCode: 0 };
    };
    await assert.rejects(
      preflightLocalTarget({ changeId: "example" }, f.cwd, command),
      /not active/,
    );
  }
});

test("shared preflight rejects non-local and escaping status without requiring artifact data", async (t) => {
  const f = await fixture(t);
  for (const status of [
    { ...f.status, planningHome: { kind: "store", root: f.cwd } },
    { ...f.status, planningHome: { kind: "repo", root: tmpdir() } },
    { ...f.status, actionContext: { mode: "store-backed" } },
    { ...f.status, changeRoot: f.cwd },
    { ...f.status, changeRoot: `${join(f.changeRoot, "..", "example")}/` },
  ]) {
    const command: Command = async (args, cwd, signal) =>
      args[0] === "list"
        ? f.command(args, cwd, signal)
        : { stdout: JSON.stringify(status), stderr: "", exitCode: 0 };
    await assert.rejects(
      preflightLocalTarget({ changeId: "example" }, f.cwd, command),
      /Non-local or escaping/,
    );
  }
});

for (const component of ["openspec", "changes", "example"] as const) {
  test(`shared preflight rejects symlinked ${component} path components`, async (t) => {
    const f = await fixture(t);
    const link =
      component === "openspec"
        ? join(f.cwd, "openspec")
        : component === "changes"
          ? join(f.cwd, "openspec/changes")
          : f.changeRoot;
    await rm(link, { recursive: true });
    const outside = join(f.cwd, "outside");
    await mkdir(outside);
    await symlink(outside, link);
    await assert.rejects(
      preflightLocalTarget({ changeId: "example" }, f.cwd, f.command),
    );
  });
}

test("shared preflight rejects a non-directory change target", async (t) => {
  const f = await fixture(t);
  await rm(f.changeRoot, { recursive: true });
  await writeFile(f.changeRoot, "not a change directory");
  await assert.rejects(
    preflightLocalTarget({ changeId: "example" }, f.cwd, f.command),
    /Non-local or escaping/,
  );
});

test("shared preflight does not swallow command failures, malformed JSON, or cancellation", async (t) => {
  const f = await fixture(t);
  for (const phase of ["list", "status"]) {
    for (const reply of [
      { stdout: "{}", stderr: "operational failure", exitCode: 2 },
      { stdout: "not JSON", stderr: "", exitCode: 0 },
      { stdout: "[]", stderr: "", exitCode: 0 },
    ]) {
      const command: Command = async (args, cwd, signal) =>
        args[0] === phase ? reply : f.command(args, cwd, signal);
      await assert.rejects(
        preflightLocalTarget({ changeId: "example" }, f.cwd, command),
      );
    }
  }
  const failure = new Error("cancelled command");
  await assert.rejects(
    preflightLocalTarget({ changeId: "example" }, f.cwd, async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
});

test("shared data checks preserve strings and reject unusable envelopes", () => {
  const data = { value: "ok" };
  assert.equal(object(data), data);
  assert.equal(text("  keep whitespace  "), "  keep whitespace  ");
  for (const value of [null, [], "text", 1, false])
    assert.throws(() => object(value));
  for (const value of [null, {}, "", " \t ", 1])
    assert.throws(() => text(value));
});

test("contains requires a strict descendant, not the root, sibling prefix, or escape", () => {
  const root = join(tmpdir(), "change");
  assert.equal(contains(root, join(root, "specs/capability/spec.md")), true);
  for (const path of [
    root,
    tmpdir(),
    `${root}-other/spec.md`,
    join(root, "../outside.md"),
  ])
    assert.equal(contains(root, path), false);
});
