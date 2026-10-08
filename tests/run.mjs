// Discovery-based gate runner: the recognized roots are the entire manifest.
// Unit tests stay co-located with their extension modules; ownerless contract
// tests live under tests/gates/. A test file at a recognized location runs in
// every gate execution without any registration edit, and nothing outside the
// roots executes (openspec/changes/unify-test-harness, design D1/D2). Named
// run.mjs so the discovery globs never self-match.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function discover(root, suffix) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(path);
      } else if (entry.isFile() && entry.name.endsWith(suffix)) {
        found.push(path);
      }
    }
  };
  walk(join(repoRoot, root));
  return found.sort();
}

const roots = [
  ["extensions", ".test.ts"],
  ["tests/gates", ".test.mjs"],
];

const suites = [];
for (const [root, suffix] of roots) {
  const files = discover(root, suffix);
  if (files.length === 0) {
    console.error(
      `tests/run.mjs: no ${suffix} gate tests discovered under ${root}/ — ` +
        "a recognized root must not be empty; check the path and placement.",
    );
    process.exit(1);
  }
  suites.push(...files);
}

console.log(`tests/run.mjs: discovered ${suites.length} gate suites:`);
for (const file of suites) {
  console.log(`  ${relative(repoRoot, file)}`);
}

const result = spawnSync(
  join(repoRoot, "node_modules", ".bin", "tsx"),
  ["--test", "--test-concurrency=2", ...suites],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  },
);

if (result.error) {
  console.error(`tests/run.mjs: failed to spawn tsx: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
