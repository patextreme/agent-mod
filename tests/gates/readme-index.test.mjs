import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Guard the split documentation layout: the main README is an index, so every
// extension must carry its own README, stay linked from that index, and no
// relative documentation link may dangle. Dependency-free: runs under plain
// `node --test`.
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const extensionsRoot = join(repoRoot, "extensions");
const mainReadme = join(repoRoot, "README.md");
const extraDocs = [join(repoRoot, "docs", "retired-tooling.md")];

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

function extensionNames() {
  return readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function relativeLinksIn(file) {
  const targets = [];
  for (const match of readFileSync(file, "utf8").matchAll(MARKDOWN_LINK)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // external scheme
    if (target.startsWith("#")) continue; // in-page anchor
    targets.push(target.split("#")[0]);
  }
  return targets;
}

test("every extension owns a README", () => {
  for (const name of extensionNames()) {
    const readme = join(extensionsRoot, name, "README.md");
    assert.ok(
      existsSync(readme),
      `missing ${relative(repoRoot, readme)}: each extension documents ` +
        "itself beside its code and is linked from the main README",
    );
    assert.match(
      readFileSync(readme, "utf8"),
      /^# \S/m,
      `${name}/README.md needs a title heading`,
    );
  }
});

test("the main README links every extension README", () => {
  const linked = new Set(
    relativeLinksIn(mainReadme).map((target) =>
      target.replace(/^\.\//, "").replace(/\\/g, "/"),
    ),
  );
  for (const name of extensionNames()) {
    const expected = `extensions/${name}/README.md`;
    assert.ok(
      linked.has(expected),
      `README.md does not link ${expected}; the index must reach every ` +
        "extension document",
    );
  }
});

test("relative documentation links resolve", () => {
  const files = [
    mainReadme,
    ...extraDocs,
    ...extensionNames().map((name) => join(extensionsRoot, name, "README.md")),
  ];
  for (const file of files) {
    for (const target of relativeLinksIn(file)) {
      const resolved = join(dirname(file), decodeURIComponent(target));
      assert.ok(
        existsSync(resolved),
        `${relative(repoRoot, file)} links missing ${target}`,
      );
    }
  }
});
