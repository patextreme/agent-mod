import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Guard against the Pi version range in README.md drifting from the one
// declared in package.json peerDependencies. Fails when the README line is
// missing, unparseable, or out of sync — so deleting the sentence cannot
// silently pass. Dependency-free: runs under plain `node --test`.
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const PEER = "@earendil-works/pi-coding-agent";
const REQUIREMENTS_LINE = /^- Pi `([^`\n]+)` \(declared as a peer dependency/m;

test("README Requirements pins the package.json peer range", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const expected = pkg.peerDependencies?.[PEER];
  assert.ok(
    expected,
    `package.json must declare a peerDependencies entry for ${PEER}`,
  );

  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  const match = readme.match(REQUIREMENTS_LINE);
  assert.ok(
    match,
    "README Requirements must contain a line like " +
      "`- Pi `^0.0.0` (declared as a peer dependency in ...)`.",
  );

  assert.equal(
    match[1],
    expected,
    `README documents Pi ${match[1]} but package.json peers on ${expected}`,
  );
});
