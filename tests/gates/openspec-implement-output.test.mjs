import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Deterministic storage-admission regressions only. No models, grading or workflow
// execution: copy tooling/inputs to disposable repositories, never local captures.
const source = join(
  dirname(dirname(dirname(fileURLToPath(import.meta.url)))),
  "tests/semantic/openspec-implement",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture(t) {
  const temp = realpathSync(
    mkdtempSync(join(tmpdir(), "openspec-output-test-")),
  );
  // All child commands are synchronous; cleanup follows their termination.
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const repo = join(temp, "source");
  const suite = join(repo, "tests/semantic/openspec-implement");
  const external = join(temp, "external");
  mkdirSync(suite, { recursive: true });
  mkdirSync(external);
  for (const name of ["materialize.mjs", "cases.json", "expectations.json"])
    copyFileSync(join(source, name), join(suite, name));
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_")) delete env[key];
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  });
  const git = (...args) => {
    const result = spawnSync("git", args, {
      cwd: repo,
      env,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  git("-c", "init.templateDir=", "init", "--quiet", "--initial-branch=main");
  const run = (tempRoot, ...args) => {
    const result = spawnSync(
      process.execPath,
      [join(suite, "materialize.mjs"), ...args],
      {
        cwd: repo,
        env: { ...env, TMPDIR: tempRoot, TMP: tempRoot, TEMP: tempRoot },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return result;
  };
  return { temp, repo, suite, external, git, run };
}

function materialized(result, suite, parent) {
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(dirname(output.root), parent);
  assert.equal(output.cases.length, 1);
  const manifest = JSON.parse(
    readFileSync(join(output.grader, "manifest.json"), "utf8"),
  );
  assert.equal(
    manifest.casesSha256,
    sha256(readFileSync(join(suite, "cases.json"))),
  );
  assert.equal(
    manifest.expectationsSha256,
    sha256(readFileSync(join(suite, "expectations.json"))),
  );
  assert.equal(
    manifest.materializerSha256,
    sha256(readFileSync(join(suite, "materialize.mjs"))),
  );
  for (const [path, hash] of Object.entries(manifest.cases[0].files))
    assert.equal(sha256(readFileSync(join(output.cases[0].repo, path))), hash);
  return output;
}

function rejectedWithoutWrites(run, tempRoot, ...args) {
  const before = readdirSync(tempRoot).sort();
  const result = run(tempRoot, ...args);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /git check-ignore|Output contains tracked files/);
  assert.equal(result.stdout, "");
  assert.deepEqual(readdirSync(tempRoot).sort(), before);
  return result;
}

test("default materialization admits ordinary external temp and preserves fixture bytes", (t) => {
  const { external, suite, run } = fixture(t);
  const output = materialized(
    run(external, "--case", "case-01"),
    suite,
    external,
  );
  assert.match(output.root, /ospx-implement-[a-f0-9]+$/);
  assert.equal(statSync(output.root).mode & 0o077, 0);
});

test("nonignored source-tree TMPDIR rejects before creating any output", (t) => {
  const { repo, run } = fixture(t);
  rejectedWithoutWrites(run, repo, "--case", "case-01");
});

test("default admission checks the complete name rather than an ignored prefix", (t) => {
  const { repo, run, git } = fixture(t);
  writeFileSync(join(repo, ".gitignore"), "ospx-implement-\n");
  git("check-ignore", "--quiet", "--", join(repo, "ospx-implement-"));
  rejectedWithoutWrites(run, repo, "--case", "case-01");
});

test("default materialization admits ignored source-tree temp", (t) => {
  const { repo, suite, run } = fixture(t);
  writeFileSync(join(repo, ".gitignore"), ".local/\n");
  const ignored = join(repo, ".local");
  mkdirSync(ignored);
  materialized(run(ignored, "--case", "case-01"), suite, ignored);
});

test("symlinked temp and explicit parents cannot bypass physical source admission", (t) => {
  const { temp, repo, run } = fixture(t);
  const alias = join(temp, "alias");
  symlinkSync(repo, alias, "dir");
  rejectedWithoutWrites(run, alias, "--case", "case-01");
  rejectedWithoutWrites(
    run,
    alias,
    "--case",
    "case-01",
    "--out",
    join(alias, "new"),
  );
});

test("logically ignored temp symlink to nonignored source still rejects", (t) => {
  const { repo, run } = fixture(t);
  writeFileSync(join(repo, ".gitignore"), ".local\n");
  const ignoredAlias = join(repo, ".local");
  symlinkSync(repo, ignoredAlias, "dir");
  rejectedWithoutWrites(run, ignoredAlias, "--case", "case-01");
});

test("symlinked ignored physical parent succeeds and reports canonical output", (t) => {
  const { temp, repo, suite, run } = fixture(t);
  writeFileSync(join(repo, ".gitignore"), ".local/\n");
  const ignored = join(repo, ".local");
  mkdirSync(ignored);
  const alias = join(temp, "alias");
  symlinkSync(ignored, alias, "dir");
  materialized(run(alias, "--case", "case-01"), suite, ignored);
  const explicit = materialized(
    run(alias, "--case", "case-01", "--out", join(alias, "new")),
    suite,
    ignored,
  );
  assert.equal(explicit.root, join(ignored, "new"));
});

test("explicit ignored output containing tracked files rejects without overwriting", (t) => {
  const { repo, run, git } = fixture(t);
  writeFileSync(join(repo, ".gitignore"), ".local/\n");
  const out = join(repo, ".local");
  mkdirSync(out);
  const sentinel = join(out, "tracked.txt");
  writeFileSync(sentinel, "unchanged\n");
  git("add", "--force", "--", sentinel);
  const before = git("ls-files", "--stage");
  // Git may reject the tracked directory at check-ignore before ls-files runs.
  rejectedWithoutWrites(run, out, "--case", "case-01", "--out", out);
  assert.equal(readFileSync(sentinel, "utf8"), "unchanged\n");
  assert.equal(git("ls-files", "--stage"), before);
});

test("explicit external output remains exclusive and never overwrites an earlier run", (t) => {
  const { external, suite, run } = fixture(t);
  const out = join(external, "new");
  materialized(
    run(external, "--case", "case-01", "--out", out),
    suite,
    external,
  );
  const manifest = readFileSync(join(out, "grader/manifest.json"), "utf8");
  const result = run(external, "--case", "case-01", "--out", out);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EEXIST/);
  assert.equal(
    readFileSync(join(out, "grader/manifest.json"), "utf8"),
    manifest,
  );
});

test("check and list remain read-only even with unsafe TMPDIR and invalid output parent", (t) => {
  const { repo, run } = fixture(t);
  const before = readdirSync(repo).sort();
  const invalid = join(repo, "missing/unused");
  const check = run(repo, "--check", "--out", invalid);
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(check.stdout), { valid: true, cases: 21 });
  const list = run(repo, "--list", "--case", "case-01", "--out", invalid);
  assert.equal(list.status, 0, list.stderr);
  const entries = JSON.parse(list.stdout);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "case-01");
  assert.ok(entries[0].bytes > 0);
  assert.ok(entries[0].fileCount > 0);
  assert.deepEqual(readdirSync(repo).sort(), before);
});
