#!/usr/bin/env node
// Manual fixture tooling only: no model calls, workflow dispatch, or grading.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const inside = (root, path) => {
  const local = relative(root, path);
  return !isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`);
};

function safeFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files))
    fail("Invalid files");
  for (const [path, content] of Object.entries(files)) {
    if (
      isAbsolute(path) ||
      path.includes("\\") ||
      path
        .split("/")
        .some((part) => !part || [".", "..", ".git"].includes(part))
    )
      fail(`Unsafe path: ${path}`);
    if (typeof content !== "string") fail(`Non-text file: ${path}`);
  }
}

function prepare(suite, expectations) {
  if (
    suite.version !== 1 ||
    expectations.version !== 1 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(suite.changeId)
  )
    fail("Invalid suite metadata");
  if (typeof suite.prompt !== "string" || !suite.prompt.includes("{{CHANGE}}"))
    fail("Invalid prompt");
  if (
    !Array.isArray(suite.cases) ||
    suite.cases.length < 4 ||
    suite.cases.length > 24
  )
    fail("Expected 4..24 cases");
  safeFiles(suite.commonFiles);
  const ids = new Set();
  const prepared = suite.cases.map((item) => {
    if (!/^case-\d{2}$/.test(item.id) || ids.has(item.id))
      fail(`Invalid/duplicate id: ${item.id}`);
    ids.add(item.id);
    safeFiles(item.files);
    const indexFiles = item.indexFiles ?? {};
    safeFiles(indexFiles);
    const files = { ...suite.commonFiles, ...item.files };
    const changeRoot = `openspec/changes/${suite.changeId}`;
    for (const name of [
      "proposal.md",
      "design.md",
      "tasks.md",
      ".openspec.yaml",
      "specs/fixture-contract/spec.md",
    ]) {
      if (!files[`${changeRoot}/${name}`]) fail(`${item.id}: missing ${name}`);
    }
    const bytes = Object.values(files).reduce(
      (n, text) => n + Buffer.byteLength(text),
      0,
    );
    const indexBytes = Object.values(indexFiles).reduce(
      (n, text) => n + Buffer.byteLength(text),
      0,
    );
    if (
      Object.keys(files).length + Object.keys(indexFiles).length > 24 ||
      bytes + indexBytes > 65536
    )
      fail(`${item.id}: exceeds fixture budget`);
    const matches = expectations.cases.filter((entry) => entry.id === item.id);
    if (
      matches.length !== 1 ||
      !matches[0].must?.length ||
      !matches[0].mustNot?.length
    )
      fail(`${item.id}: missing unique rubric`);
    return { id: item.id, files, indexFiles, bytes: bytes + indexBytes };
  });
  if (expectations.cases.length !== ids.size) fail("Unexpected rubric entries");
  return prepared;
}

function optionsFor(argv) {
  const options = { cases: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (["--out", "--case"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) fail(`${arg} needs a value`);
      if (arg === "--case") options.cases.push(value);
      else {
        if (options.out) fail("Duplicate --out");
        options.out = resolve(value);
      }
    } else if (["--check", "--list", "--help"].includes(arg))
      options[arg.slice(2)] = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

async function safeOutput(out) {
  // Require an existing physical parent; reject source-tree writes unless ignored.
  const physical = join(await realpath(dirname(out)), basename(out));
  const source = await realpath(repoRoot);
  if (inside(source, physical)) {
    execFileSync("git", ["check-ignore", "--quiet", "--", physical], {
      cwd: source,
    });
    const tracked = execFileSync("git", ["ls-files", "--", physical], {
      cwd: source,
      encoding: "utf8",
    });
    if (tracked.trim()) fail("Output contains tracked files");
  }
  return physical;
}

async function main() {
  const options = optionsFor(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node materialize.mjs [--check | --list] [--case case-NN ...] [--out NEW_DIRECTORY]\nDefault: fresh OS temp directory. --out parent must exist; source-tree output must be gitignored. No models, tests, grading or commits are run.",
    );
    return;
  }
  const [caseText, expectationText] = await Promise.all([
    readFile(join(here, "cases.json"), "utf8"),
    readFile(join(here, "expectations.json"), "utf8"),
  ]);
  const suite = JSON.parse(caseText);
  const prepared = prepare(suite, JSON.parse(expectationText));
  for (const id of options.cases)
    if (!prepared.some((item) => item.id === id)) fail(`Unknown case: ${id}`);
  const selected = prepared.filter(
    (item) => !options.cases.length || options.cases.includes(item.id),
  );
  if (options.check || options.list) {
    console.log(
      JSON.stringify(
        options.list
          ? selected.map(({ id, bytes, files }) => ({
              id,
              bytes,
              fileCount: Object.keys(files).length,
            }))
          : { valid: true, cases: prepared.length },
        null,
        2,
      ),
    );
    return;
  }
  // Admit the complete random name, not a prefix whose ignore status may differ.
  const root = await safeOutput(
    options.out ??
      join(tmpdir(), `ospx-implement-${randomBytes(6).toString("hex")}`),
  );
  // Preserve mkdtemp's private default; explicit outputs keep mkdir permissions.
  await mkdir(root, { mode: options.out ? 0o777 : 0o700 }); // exclusive
  await mkdir(join(root, "grader"));
  const manifest = {
    version: 1,
    casesSha256: hash(caseText),
    expectationsSha256: hash(expectationText),
    materializerSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    cases: [],
  };
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_")) delete env[key];
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  });
  for (const item of selected) {
    const repo = join(root, "inputs", item.id, "repo");
    await mkdir(repo, { recursive: true });
    const files = {};
    for (const [path, content] of Object.entries(item.files)) {
      const target = join(repo, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, { flag: "wx" });
      files[path] = hash(content);
    }
    execFileSync(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "init.templateDir=",
        "init",
        "--quiet",
        "--initial-branch=main",
        repo,
      ],
      { env, stdio: "pipe" },
    );
    // Seed index baselines without commits/hooks; working bytes may differ or be absent.
    const indexedFiles = {};
    for (const [path, content] of Object.entries(item.indexFiles)) {
      const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
        cwd: repo,
        env,
        input: content,
        encoding: "utf8",
      }).trim();
      execFileSync(
        "git",
        ["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`],
        {
          cwd: repo,
          env,
          stdio: "pipe",
        },
      );
      indexedFiles[path] = { sha256: hash(content), blob };
    }
    const prompt = `${suite.prompt.replaceAll("{{CHANGE}}", suite.changeId)}\n`;
    await writeFile(join(dirname(repo), "prompt.txt"), prompt, { flag: "wx" });
    manifest.cases.push({
      id: item.id,
      repo,
      changeId: suite.changeId,
      files,
      indexedFiles,
      promptSha256: hash(prompt),
    });
  }
  await writeFile(join(root, "grader", "expectations.json"), expectationText, {
    flag: "wx",
  });
  await writeFile(
    join(root, "grader", "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        root,
        inputs: join(root, "inputs"),
        grader: join(root, "grader"),
        cases: manifest.cases.map(({ id, repo }) => ({ id, repo })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
