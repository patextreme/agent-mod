import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateFlowFile } from "./validate.js";

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
