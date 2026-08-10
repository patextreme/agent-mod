import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFlowScript, typeCheckFlowScript } from "./discovery.js";
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
