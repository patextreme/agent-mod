import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateLocalDeclarations } from "./init.js";

/** Absolute path to this module's directory (sibling of `agentflow.d.ts`). */
const here = dirname(fileURLToPath(import.meta.url));

/** The shipped declarations, the input the surgery is defined against. */
function shippedSource(): string {
  return readFileSync(join(here, "agentflow.d.ts"), "utf-8");
}

test("the checked-in local copy stays in sync with generateLocalDeclarations", () => {
  const checkedIn = readFileSync(
    join(here, "..", "..", ".pi", "agentflow", "agentflow.d.ts"),
    "utf-8",
  );
  assert.equal(checkedIn, generateLocalDeclarations(shippedSource()));
});
test("the shipped examples copy stays in sync with generateLocalDeclarations", () => {
  // The examples import `./agentflow.d.ts`, so a self-contained copy must ship
  // beside them for the import to resolve in place (before copying to
  // `.pi/agentflow/` and running `/af-init`).
  const checkedIn = readFileSync(
    join(here, "examples", "agentflow.d.ts"),
    "utf-8",
  );
  assert.equal(checkedIn, generateLocalDeclarations(shippedSource()));
});
test("generateLocalDeclarations removes the typebox module import", () => {
  const generated = generateLocalDeclarations(shippedSource());
  // No module imports of any kind survive the surgery.
  assert.doesNotMatch(generated, /^\s*import\s.+from\s/m);
  assert.doesNotMatch(generated, /from\s*["']typebox["']/);
});

test("generateLocalDeclarations retains the global `af` declaration", () => {
  const generated = generateLocalDeclarations(shippedSource());
  assert.match(generated, /declare global\s*\{\s*const af: AgentFlow;\s*\}/);
});

test("generateLocalDeclarations injects the structural fallbacks", () => {
  const generated = generateLocalDeclarations(shippedSource());
  assert.match(generated, /interface TSchema\s*\{/);
  assert.match(generated, /declare const Type:/);
});

test("generateLocalDeclarations leaves the rest of the surface verbatim", () => {
  const before = shippedSource();
  const after = generateLocalDeclarations(before);
  // Every exported interface survives unchanged.
  for (const name of [
    "BashResult",
    "BashTimeoutError",
    "FlowAgentConfig",
    "FlowImageContent",
    "SendMessageOptions",
    "FlowAgent",
    "AgentFlow",
  ]) {
    assert.match(after, new RegExp(`export interface ${name}\\b`));
  }
  // `resultSchema?: TSchema` still refers to the (fallback) TSchema name.
  assert.match(after, /resultSchema\?: TSchema;/);
  assert.match(after, /Type: typeof Type;/);
});

test("generateLocalDeclarations throws when the typebox import is missing", () => {
  // The surgery is defined against the shipped file's shape; if that changes,
  // failing loudly beats silently emitting a copy with a stale import.
  assert.throws(
    () => generateLocalDeclarations("export interface X {}\n"),
    /no longer contain the expected typebox import/,
  );
});
