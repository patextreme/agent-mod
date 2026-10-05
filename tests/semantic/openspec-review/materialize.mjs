#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hash = (text) => createHash("sha256").update(text).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function safeFiles(files, label) {
  if (!object(files)) fail(`${label}: files must be an object`);
  for (const [path, content] of Object.entries(files)) {
    if (
      isAbsolute(path) ||
      path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      path.split("/").includes(".git")
    ) {
      fail(`${label}: unsafe fixture path ${path}`);
    }
    if (typeof content !== "string") fail(`${label}: ${path} must be text`);
  }
}

function baseFiles(suite, name, seen = new Set()) {
  if (seen.has(name)) fail(`Base inheritance cycle: ${name}`);
  const base = suite.bases[name];
  if (!base) fail(`Unknown base: ${name}`);
  seen.add(name);
  safeFiles(base.files, name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base.changeId)) {
    fail(`Invalid change id in ${name}`);
  }
  if (base.extends && suite.bases[base.extends]?.changeId !== base.changeId) {
    fail(`Base ${name} changes its inherited change id`);
  }
  return {
    ...(base.extends ? baseFiles(suite, base.extends, seen) : {}),
    ...base.files,
  };
}

function prepare(suite, expectations) {
  if (suite.version !== 1 || expectations.version !== 1) {
    fail("Unsupported fixture version");
  }
  const { maxCases, maxFilesPerCase, maxBytesPerCase } = suite.limits;
  if (
    !Number.isSafeInteger(maxCases) ||
    maxCases < 18 ||
    maxCases > 24 ||
    !Number.isSafeInteger(maxFilesPerCase) ||
    maxFilesPerCase < 1 ||
    maxFilesPerCase > 16 ||
    !Number.isSafeInteger(maxBytesPerCase) ||
    maxBytesPerCase < 1 ||
    maxBytesPerCase > 24576
  ) {
    fail("Bounds exceed the live-evaluation budget");
  }
  if (suite.cases.length < 18 || suite.cases.length > maxCases) {
    fail("Expected 18..maxCases fixture cases");
  }
  safeFiles(suite.commonFiles, "common");
  const ids = new Set();
  const prepared = suite.cases.map((item) => {
    if (!/^case-\d{2}$/.test(item.id) || ids.has(item.id)) {
      fail(`Invalid or duplicate case id: ${item.id}`);
    }
    ids.add(item.id);
    safeFiles(item.files, item.id);
    const files = {
      ...suite.commonFiles,
      ...baseFiles(suite, item.base),
      ...item.files,
    };
    const changeId = suite.bases[item.base].changeId;
    const changeRoot = `openspec/changes/${changeId}`;
    for (const artifact of [
      "proposal.md",
      "design.md",
      "tasks.md",
      ".openspec.yaml",
    ]) {
      if (!files[`${changeRoot}/${artifact}`]) {
        fail(`${item.id}: missing planning artifact ${artifact}`);
      }
    }
    if (
      !Object.keys(files).some((path) =>
        path.startsWith(`${changeRoot}/specs/`),
      )
    ) {
      fail(`${item.id}: no delta specification`);
    }
    const bytes = Object.values(files).reduce(
      (total, content) => total + Buffer.byteLength(content),
      0,
    );
    if (
      Object.keys(files).length > maxFilesPerCase ||
      bytes > maxBytesPerCase
    ) {
      fail(`${item.id}: fixture exceeds file/byte budget`);
    }
    const prompt = suite.prompts[item.prompt];
    if (typeof prompt !== "string" || !prompt.includes("{{CHANGE}}")) {
      fail(`${item.id}: invalid prompt template`);
    }
    const expected = expectations.cases.filter((entry) => entry.id === item.id);
    if (expected.length !== 1 || expected[0].kind !== item.prompt) {
      fail(`${item.id}: expected exactly one separate, matching grading entry`);
    }
    return { id: item.id, changeId, files, prompt, kind: item.prompt, bytes };
  });
  if (expectations.cases.length !== ids.size)
    fail("Unexpected grading-only cases");
  for (const pair of expectations.pairs) {
    if (pair.cases.length < 2 || pair.cases.some((id) => !ids.has(id))) {
      fail(`Invalid grading pair: ${pair.topic}`);
    }
  }
  return prepared;
}

function argumentsFor(argv) {
  const options = { cases: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (["--out", "--case"].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail(`${arg} requires a value`);
      if (arg === "--out") {
        if (options.out) fail("--out may only be specified once");
        options.out = resolve(value);
      } else {
        options.cases.push(value);
      }
    } else if (["--check", "--list", "--help"].includes(arg)) {
      options[arg.slice(2)] = true;
    } else {
      fail(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function initRepository(repo) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_DATE: "2026-01-15T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-15T00:00:00Z",
  });
  const git = (args) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd: repo,
      env,
      stdio: "pipe",
    });
  git(["-c", "init.templateDir=", "init", "--quiet", "--initial-branch=main"]);
  git(["add", "--all"]);
  git([
    "-c",
    "user.name=Semantic fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "Initial repository snapshot",
  ]);
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node materialize.mjs [--out NEW_DIRECTORY] [--case case-NN ...]\n       node materialize.mjs --check | --list\nNo arguments: create all fixtures under a fresh OS temporary directory.\nInputs and grading metadata are separate. No model, tests or groom are run.",
    );
    return;
  }
  const [caseText, expectationText] = await Promise.all([
    readFile(join(here, "cases.json"), "utf8"),
    readFile(join(here, "expectations.json"), "utf8"),
  ]);
  const suite = JSON.parse(caseText);
  const prepared = prepare(suite, JSON.parse(expectationText));
  for (const id of options.cases) {
    if (!prepared.some((item) => item.id === id)) fail(`Unknown case: ${id}`);
  }
  const selected = prepared.filter(
    (item) => options.cases.length === 0 || options.cases.includes(item.id),
  );
  if (options.check || options.list) {
    console.log(
      JSON.stringify(
        options.list
          ? selected.map(({ id, changeId, kind, files, bytes }) => ({
              id,
              changeId,
              kind,
              fileCount: Object.keys(files).length,
              bytes,
            }))
          : { valid: true, cases: prepared.length, limits: suite.limits },
        null,
        2,
      ),
    );
    return;
  }
  // Never reuse/overwrite an old fixture tree; old/new runs need independent inputs.
  const root = options.out ?? (await mkdtemp(join(tmpdir(), "ospx-review-")));
  if (options.out) await mkdir(root);
  const inputDir = join(root, "inputs");
  const graderDir = join(root, "grader");
  await Promise.all([mkdir(inputDir), mkdir(graderDir)]);
  const manifest = {
    version: 1,
    casesSha256: hash(caseText),
    expectationsSha256: hash(expectationText),
    materializerSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    cases: [],
  };
  const locations = [];
  for (const item of selected) {
    const caseDir = join(inputDir, item.id);
    const repo = join(caseDir, "repo");
    await mkdir(repo, { recursive: true });
    const fileHashes = {};
    for (const [relative, template] of Object.entries(item.files)) {
      const content = template.replaceAll("{{ROOT}}", repo);
      if (/\{\{[^}]+\}\}/.test(content)) fail(`Unresolved token: ${relative}`);
      const target = join(repo, relative);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, { flag: "wx" });
      fileHashes[relative] = hash(content);
    }
    initRepository(repo);
    const promptText = `${item.prompt.replaceAll("{{CHANGE}}", item.changeId)}\n`;
    const prompt = join(caseDir, "prompt.txt");
    await writeFile(prompt, promptText, { flag: "wx" });
    manifest.cases.push({
      id: item.id,
      changeId: item.changeId,
      kind: item.kind,
      repo,
      promptSha256: hash(promptText),
      // Hash templates too: absolute assessment paths differ across independent roots.
      templateSha256: hash(JSON.stringify(item.files)),
      files: fileHashes,
    });
    locations.push({ id: item.id, repo, prompt });
  }
  await Promise.all([
    writeFile(join(graderDir, "expectations.json"), expectationText, {
      flag: "wx",
    }),
    writeFile(
      join(graderDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      {
        flag: "wx",
      },
    ),
  ]);
  console.log(
    JSON.stringify({ root, inputDir, graderDir, cases: locations }, null, 2),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
