import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFlowScript, typeCheckFlowScript } from "./discovery.js";
import { generateLocalDeclarations } from "./init.js";
import { validateFlowFile } from "./validate.js";

/** Absolute path to this module's directory (sibling of `agentflow.d.ts`). */
const here = dirname(fileURLToPath(import.meta.url));
/** The shipped `af` declarations, used to type-check `.ts` flows. */
const DECLARATIONS = join(here, "agentflow.d.ts");

/** Build an isolated project dir with a `.pi/agentflow/` flow dir for a test. */
function makeDir(): { cwd: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "agentflow-validate-"));
  mkdirSync(join(root, ".pi", "agentflow"), { recursive: true });
  return {
    cwd: root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("validateFlowFile reports a valid script as ok", async () => {
  const d = makeDir();
  try {
    writeFileSync(
      join(d.cwd, ".pi", "agentflow", "good.ts"),
      "const n: number = 1;\naf.log(n);\n",
    );
    const report = await validateFlowFile("good", d.cwd);
    assert.equal(report.ok, true);
    assert.equal(report.name, "good");
    assert.deepEqual(report.errors, []);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile reports a syntax error as invalid with a located error", async () => {
  const d = makeDir();
  try {
    writeFileSync(
      join(d.cwd, ".pi", "agentflow", "syntax.ts"),
      "const x = ;\n",
    );
    const report = await validateFlowFile("syntax", d.cwd);
    assert.equal(report.ok, false);
    assert.ok(report.errors.length > 0);
    assert.match(report.errors[0].message, /syntax error/);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile reports a type error as invalid with a located error", async () => {
  const d = makeDir();
  try {
    // Parses fine but violates the strict type-check against `agentflow.d.ts`.
    writeFileSync(
      join(d.cwd, ".pi", "agentflow", "typebad.ts"),
      'const n: number = "not a number";\n',
    );
    const report = await validateFlowFile("typebad", d.cwd);
    assert.equal(report.ok, false);
    assert.ok(report.errors.length > 0);
    assert.ok(report.errors[0].line > 0, "expected a located line");
    assert.ok(report.errors[0].col > 0, "expected a located column");
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile reports not-found for an unresolvable name", async () => {
  const d = makeDir();
  try {
    const report = await validateFlowFile("nope", d.cwd);
    assert.equal(report.ok, false);
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0].message, /no flow script found/);
    assert.equal(report.errors[0].line, 0);
    assert.equal(report.errors[0].col, 0);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile reports an unreadable path (a directory) without throwing", async () => {
  const d = makeDir();
  try {
    // A directory named like a flow file resolves, but readFileSync throws
    // EISDIR. validateFlowFile must surface that as a structured report
    // (never throw), honoring its documented contract — the `/af` run path
    // already guards the same readFlowScript call.
    mkdirSync(join(d.cwd, ".pi", "agentflow", "dir.ts"));
    const report = await validateFlowFile("dir", d.cwd);
    assert.equal(report.ok, false);
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0].message, /could not read/i);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile preserves multi-line (chained) type diagnostics", async () => {
  const d = makeDir();
  try {
    // A union→narrow assignment yields a *chained* TS diagnostic whose
    // flattened message spans two lines. The continuation line must be folded
    // into the error message, not dropped (which is what truncating to the
    // first line did before).
    writeFileSync(
      join(d.cwd, ".pi", "agentflow", "chained.ts"),
      "const x: string = Math.random() > 0.5 ? 'a' : 5;\n",
    );
    const report = await validateFlowFile("chained", d.cwd);
    assert.equal(report.ok, false);
    assert.ok(report.errors.length > 0);
    const text = report.errors.map((e) => e.message).join("\n");
    assert.match(text, /not assignable to type 'string'/);
    assert.match(
      text,
      /Type 'number' is not assignable to type 'string'/,
      "chained continuation line is preserved, not truncated",
    );
  } finally {
    d.cleanup();
  }
});

// ─── Import-graph validation ───────────────────────────────────────────────

test("validateFlowFile reports a valid flow with relative imports as ok", async () => {
  const d = makeDir();
  try {
    const flowDir = join(d.cwd, ".pi", "agentflow");
    writeFileSync(join(flowDir, "helper.ts"), "export const MAGIC = 41;\n");
    writeFileSync(
      join(flowDir, "importing.ts"),
      'import { MAGIC } from "./helper.ts";\nconst n: number = MAGIC + 1;\naf.log(n);\n',
    );
    const report = await validateFlowFile("importing", d.cwd);
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile reports import-policy violations with locations", async () => {
  const d = makeDir();
  try {
    writeFileSync(
      join(d.cwd, ".pi", "agentflow", "bare.ts"),
      'import { z } from "zod";\naf.log(z);\n',
    );
    const report = await validateFlowFile("bare", d.cwd);
    assert.equal(report.ok, false);
    assert.equal(report.errors.length, 1);
    assert.match(report.errors[0].message, /bare specifier "zod"/);
    assert.ok(report.errors[0].line > 0, "located line");
    assert.ok(report.errors[0].col > 0, "located column");
    assert.equal(report.errors[0].file, undefined, "entry errors omit file");
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile reports dynamic import() as invalid", async () => {
  const d = makeDir();
  try {
    writeFileSync(
      join(d.cwd, ".pi", "agentflow", "dynamic.ts"),
      'const m = await import("./helper.ts");\naf.log(m);\n',
    );
    const report = await validateFlowFile("dynamic", d.cwd);
    assert.equal(report.ok, false);
    assert.match(report.errors[0].message, /dynamic import\(\) is not allowed/);
    assert.ok(report.errors[0].line > 0);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile reports a missing import target as invalid", async () => {
  const d = makeDir();
  try {
    writeFileSync(
      join(d.cwd, ".pi", "agentflow", "missing.ts"),
      'import { gone } from "./gone.ts";\naf.log(gone);\n',
    );
    const report = await validateFlowFile("missing", d.cwd);
    assert.equal(report.ok, false);
    assert.match(
      report.errors[0].message,
      /cannot resolve import "\.\/gone\.ts"/,
    );
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile accepts a .ts flow using CommonJS require of a relative file", async () => {
  const d = makeDir();
  try {
    const flowDir = join(d.cwd, ".pi", "agentflow");
    // The import policy documents `require("./x")` and the runtime executes
    // it, so the type-checker needs an ambient `require` declaration —
    // without one tsc rejects the flow with "Cannot find name 'require'".
    writeFileSync(join(flowDir, "legacy.cjs"), "module.exports = { n: 3 };\n");
    writeFileSync(
      join(flowDir, "cjsuser.ts"),
      'const legacy = require("./legacy.cjs");\naf.log(legacy.n);\n',
    );
    const report = await validateFlowFile("cjsuser", d.cwd);
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile accepts a .ts flow importing a .js helper", async () => {
  const d = makeDir();
  try {
    const flowDir = join(d.cwd, ".pi", "agentflow");
    // Documented (".ts or .js files inside the flow root") and executed by jiti;
    // needs `allowJs` or tsc rejects the import with TS7016.
    writeFileSync(join(flowDir, "helper.js"), "export const MAGIC = 41;\n");
    writeFileSync(
      join(flowDir, "jsimporter.ts"),
      'import { MAGIC } from "./helper.js";\nconst n: number = MAGIC + 1;\naf.log(n);\n',
    );
    const report = await validateFlowFile("jsimporter", d.cwd);
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile accepts type-position import(...) annotations", async () => {
  const d = makeDir();
  try {
    const flowDir = join(d.cwd, ".pi", "agentflow");
    writeFileSync(join(flowDir, "nums.ts"), "export type Num = number;\n");
    writeFileSync(
      join(flowDir, "typdyn.ts"),
      'const n: import("./nums.ts").Num = 41;\naf.log(n);\n',
    );
    const report = await validateFlowFile("typdyn", d.cwd);
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile reports type errors in imported files with the file name", async () => {
  const d = makeDir();
  try {
    const flowDir = join(d.cwd, ".pi", "agentflow");
    writeFileSync(
      join(flowDir, "helper.ts"),
      "export const n: number = 'not a number';\n",
    );
    writeFileSync(
      join(flowDir, "entry.ts"),
      'import { n } from "./helper.ts";\naf.log(n);\n',
    );
    const report = await validateFlowFile("entry", d.cwd);
    assert.equal(report.ok, false);
    assert.ok(report.errors.length > 0);
    const inHelper = report.errors.find((e) => e.file !== undefined);
    assert.ok(inHelper, "at least one error carries a file");
    assert.equal(inHelper?.file, join(flowDir, "helper.ts"));
    assert.ok(inHelper !== undefined && inHelper.line > 0);
    assert.match(inHelper.message, /not assignable to type 'number'/);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile detects a nested-brace local `declare global { const af }`", async () => {
  const d = makeDir();
  try {
    const flowDir = join(d.cwd, ".pi", "agentflow");
    // A realistic declaration file can have an interface (or namespace) with
    // braces before `const af`; the old `[^}]*` regex stopped at the first
    // nested `}`, so the shipped declarations were injected and duplicate
    // globals were reported.
    writeFileSync(
      join(flowDir, "agentflow.d.ts"),
      [
        "declare global {",
        "  interface Nested { value: string }",
        "  const af: { log(...parts: unknown[]): void }",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(join(flowDir, "nested-decl.ts"), 'af.log("ok");\n');
    const report = await validateFlowFile("nested-decl", d.cwd);
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile types a script by its local agentflow.d.ts without duplicate globals", async () => {
  const d = makeDir();
  try {
    const flowDir = join(d.cwd, ".pi", "agentflow");
    // The graph contains a local `agentflow.d.ts` → the shipped declarations
    // must NOT be injected (`af` declared exactly once). Use the real
    // generated copy so the surface matches what `/af-init` produces.
    writeFileSync(
      join(flowDir, "agentflow.d.ts"),
      generateLocalDeclarations(readFlowScript(DECLARATIONS)),
    );
    writeFileSync(
      join(flowDir, "localdecl.ts"),
      [
        'import type { AgentFlow, FlowAgent } from "./agentflow.d.ts";',
        "const typed: AgentFlow = af;",
        "const agent: FlowAgent<{ ok: boolean }> | undefined = undefined;",
        "af.log(typed.cwd, agent);",
        "af.result(af.Type.Object({ done: af.Type.Boolean() }));",
        "",
      ].join("\n"),
    );
    const report = await validateFlowFile("localdecl", d.cwd);
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
  } finally {
    d.cleanup();
  }
});

test("validateFlowFile ignores an unrelated agentflow.d.ts basename collision", async () => {
  const d = makeDir();
  try {
    const flowDir = join(d.cwd, ".pi", "agentflow");
    mkdirSync(join(flowDir, "unrelated"));
    writeFileSync(
      join(flowDir, "unrelated", "agentflow.d.ts"),
      "export type Collision = { id: string };\n",
    );
    writeFileSync(
      join(flowDir, "collision.ts"),
      [
        'import type { Collision } from "./unrelated/agentflow.d.ts";',
        'const c: Collision = { id: "x" };',
        "af.log(c.id);",
        "",
      ].join("\n"),
    );
    const report = await validateFlowFile("collision", d.cwd);
    assert.equal(report.ok, true);
    assert.deepEqual(report.errors, []);
  } finally {
    d.cleanup();
  }
});

// ─── af.bash type surface ──────────────────────────────────────────────────

test("the shipped bash example type-checks against the af declarations", async () => {
  const examplePath = join(here, "examples", "bash.ts");
  // Resolves (no throw) when every af.bash / af.createAgent / af.result use is
  // well-typed against the shipped `agentflow.d.ts`.
  await typeCheckFlowScript(
    examplePath,
    readFlowScript(examplePath),
    DECLARATIONS,
  );
});

test("a script using af.bash with opts and reading BashResult type-checks", async () => {
  const source = [
    'const a = await af.bash("npm test");',
    "a.stdout;",
    "a.stderr;",
    "a.code;",
    'const b = await af.bash("git diff", { cwd: "/tmp", timeoutMs: 1000 });',
    "if (b.code !== 0) af.log(b.stdout);",
    "af.result(a.code);",
    "",
  ].join("\n");
  await typeCheckFlowScript("/tmp/sample-bash.ts", source, DECLARATIONS);
});

test("misusing af.bash is a type error (guards the declaration)", async () => {
  const source = [
    'const a = await af.bash("x");',
    "a.nonexistent; // property does not exist on BashResult", // eslint-disable-line @typescript-eslint/no-unused-vars
    "",
  ].join("\n");
  await assert.rejects(
    typeCheckFlowScript("/tmp/sample-bash-bad.ts", source, DECLARATIONS),
    /type errors/,
  );
});
