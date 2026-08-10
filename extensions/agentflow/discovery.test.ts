import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  flowCandidates,
  listFlowNames,
  resolveFlowFile,
  validateFlowSyntax,
} from "./discovery.js";

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

test("validateFlowSyntax transpiles .ts flows with TypeScript-only syntax", () => {
  // `interface`/`type`/generics are plain-JS parse errors — the validator must
  // run jiti's TS transform for `.ts` files or a valid flow is rejected.
  const ts = `
interface R { ok: boolean }
type V = { n: number };
const pick = (r: R, v: V): string => af.log(r.ok, v.n);
`;
  const out = validateFlowSyntax(ts, "/proj/.pi/agentflow/reviewcode.ts");
  // TypeScript-only syntax parses and is erased to valid JS (no error marker,
  // no stray `exports`/`module` references that would break the AsyncFunction
  // runtime wrapper).
  assert.match(out, /af\.log/);
  assert.doesNotMatch(out, /__JITI_ERROR__/);
  assert.doesNotMatch(out, /exports/);
});

test("validateFlowSyntax throws a clear error on a real syntax error", () => {
  assert.throws(
    () => validateFlowSyntax("const x = ;", "/proj/.pi/agentflow/broken.js"),
    /AgentFlow: syntax error in/,
  );
});

test("validateFlowSyntax surfaces jiti's embedded parse error as a thrown Error", () => {
  // jiti signals TS-parse failures by emitting an `exports.__JITI_ERROR__`
  // assignment instead of throwing. The validator must detect that sentinel and
  // throw a real error rather than passing the error-encoded source through
  // (which would otherwise fail at runtime as "exports is not defined").
  assert.throws(
    () => validateFlowSyntax("const x: number =", "/proj/.pi/agentflow/bad.ts"),
    /AgentFlow: syntax error in/,
  );
});

test("validateFlowSyntax rejects a flow that uses `import` (would crash at runtime)", () => {
  // jiti transpiles ESM `import` to CommonJS `require(...)`, which is not in
  // scope inside the runtime's AsyncFunction wrapper — so without this guard
  // the script passes validation but dies with "require is not defined".
  assert.throws(
    () =>
      validateFlowSyntax(
        'import { x } from "y"\naf.log(x)',
        "/proj/.pi/agentflow/imports.ts",
      ),
    /cannot use/,
  );
});

test("validateFlowSyntax rejects a flow that uses `export`", () => {
  assert.throws(
    () =>
      validateFlowSyntax(
        "export const z = 1\naf.log(z)",
        "/proj/.pi/agentflow/exports.ts",
      ),
    /cannot use/,
  );
});

test("validateFlowSyntax still accepts a plain script with no module syntax", () => {
  const out = validateFlowSyntax(
    "const a = 1\naf.log(a)",
    "/proj/.pi/agentflow/plain.ts",
  );
  assert.match(out, /af\.log/);
});

test("validateFlowSyntax ignores `require`/`module.exports` mentioned in a comment (jiti keeps comments)", () => {
  // jiti does NOT strip comments from its transpiled output, so scanning the
  // output would reject a flow whose comment merely mentions require()/
  // module.exports — exactly the wording the skill's authoring guidance prompts
  // an author to write. The guard scans the stripped source instead.
  const out = validateFlowSyntax(
    '// NOTE: do not use require() or module.exports here — only `af`\naf.log("ok")',
    "/proj/.pi/agentflow/comment.ts",
  );
  assert.match(out, /af\.log/);
});

test("validateFlowSyntax ignores `require(` appearing inside a string literal", () => {
  // A bash grep that searches for require( must not read as module syntax.
  const out = validateFlowSyntax(
    'af.bash("grep -rn \'require(\' src")\naf.log("ok")',
    "/proj/.pi/agentflow/grep.ts",
  );
  assert.match(out, /af\.log/);
});

test("validateFlowSyntax ignores `require(`/`module.exports` inside a DOUBLE-quoted string", () => {
  // The string stripper must handle double quotes as well as single quotes — a
  // broken `[^"\\]` class (backslash escaping outside the class) silently
  // leaves `"...require(x)..."` in place and rejects valid prose.
  const out = validateFlowSyntax(
    'af.log("call require(x) here, see module.exports docs")',
    "/proj/.pi/agentflow/dq.ts",
  );
  assert.match(out, /af\.log/);
});

test("validateFlowSyntax ignores `exports` used as a property access (obj.exports.x)", () => {
  // Only free-identifier `exports.` (the CommonJS global) should trip the
  // guard, not a same-named property on another object.
  const out = validateFlowSyntax(
    "const pkg = { exports: { x: 1 } }\naf.log(pkg.exports.x)",
    "/proj/.pi/agentflow/prop.ts",
  );
  assert.match(out, /af\.log/);
});

test("validateFlowSyntax still rejects a direct require() call in code", () => {
  assert.throws(
    () =>
      validateFlowSyntax(
        'const fs = require("fs")\naf.log(fs)',
        "/proj/.pi/agentflow/require.ts",
      ),
    /cannot use/,
  );
});

test("validateFlowSyntax still rejects a direct module.exports assignment", () => {
  assert.throws(
    () =>
      validateFlowSyntax(
        'module.exports = 1\naf.log("ok")',
        "/proj/.pi/agentflow/mexport.ts",
      ),
    /cannot use/,
  );
});
