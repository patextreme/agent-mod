import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";
import { createFinalizeFlow } from "../openspec-finalize/flow.js";

const root = new URL("../../", import.meta.url);
const load = (path: string) => readFile(new URL(path, root), "utf8");
let readme: string;
let agents: string;
let glossary: string;
let finalize: string;
let pipeline: string;
const section = (heading: string, next: string) => {
  const start = readme.indexOf(`## ${heading}\n`);
  const end = readme.indexOf(`## ${next}\n`, start + 1);
  assert.ok(start >= 0 && end > start, `Missing README section: ${heading}`);
  return readme.slice(start, end).replaceAll("**", "");
};
before(async () => {
  [readme, agents, glossary] = await Promise.all([
    load("README.md"),
    load("AGENTS.md"),
    load("GLOSSARY.md"),
  ]);
  finalize = section("OpenSpec finalization flow", "OpenSpec full pipeline");
  pipeline = section("OpenSpec full pipeline", "Development");
});

function includesAll(body: string, phrases: string[]) {
  for (const phrase of phrases) assert.ok(body.includes(phrase), phrase);
}

test("documented entrypoints take only the same explicit local changeId and retain standalone flows", async () => {
  for (const name of ["groom", "implement", "verify", "finalize", "all"]) {
    const invocation = `acpx flow run ./flows/openspec-${name}/index.ts --input-json '{"changeId":"example-change"}'`;
    assert.ok(readme.includes(invocation), invocation);
  }
  includesAll(finalize, [
    "Only `changeId` is accepted",
    "absolute entrypoint path",
    "invocation directory selects the workspace",
    "archived, store-backed, symlinked, escaping targets",
    "unsupported input fields",
    "Scope is rechecked before archival",
  ]);
  includesAll(pipeline, [
    "Only `changeId` is accepted",
    "same change and canonical workspace",
    "All existing standalone entrypoints remain available and unchanged",
  ]);
  assert.match(
    await load("flows/openspec-finalize/index.ts"),
    /export default createFinalizeFlow\(\)/,
  );
});

test("standalone finalization asserts readiness rather than verifying implementation", () => {
  includesAll(finalize, [
    "Standalone invocation asserts prior implementation verification",
    "does not require saved verification evidence",
    "rerun implementation gates",
    "judge task completion",
    "repair code/planning artifacts",
    "not implementation verification",
    "ordinary generated sync/archive skills are unchanged",
  ]);
  const graph = createFinalizeFlow();
  assert.deepEqual(
    Object.entries(graph.nodes)
      .filter(([, node]) => node.nodeType === "acp")
      .map(([id]) => id),
    ["sync", "assess"],
  );
  assert.ok(
    !Object.keys(graph.nodes).some((id) => /verify|repair|steer/.test(id)),
  );
  includesAll(pipeline, [
    "reaches finalization only after its verification stage succeeds",
    "without duplicate implementation verification",
    "no stage-transition prompts",
  ]);
});

test("docs define complete semantic merge and independent synchronization acceptance", () => {
  includesAll(finalize, [
    "artifactPaths.specs.existingOutputPaths",
    "nested capabilities",
    "one valid `openspec instructions specs --change <id> --json` snapshot",
    "Omitted rules mean no configured rules",
    "dirty baseline edits",
    "semantic merge",
    "ADDED, partial MODIFIED, REMOVED and RENAMED",
    "unaffected requirements/scenarios and existing Purpose text",
    "reported TBD placeholder",
    "idempotent no-ops",
    "Explicit capability-retirement metadata",
    "empty result alone does not authorize retirement",
    "original baseline, current main specs and content rules, without the worker transcript",
    "Worker success alone cannot authorize archival",
    "every capability and operation",
    "`mismatch`, `inconclusive`",
    "block archival without repairs or retries",
    "changed inputs invalidate acceptance",
    "no delta specs",
    "`not_applicable`",
    "no specs-instruction lookup or main-spec write",
  ]);
});

test("authorization and fresh sessions are not tool approval or OS isolation", () => {
  includesAll(finalize, [
    "fresh isolated Pi sessions",
    "90-minute timeout",
    "flow-owned",
    "Tool permissions must already permit unattended execution",
    "does not approve tools, bypass deny rules, or enable YOLO",
    "prompt-level scope, not OS isolation",
    "fresh-session isolation is not filesystem isolation",
    "Pi provider retries remain separately controlled",
  ]);
  includesAll(pipeline, [
    "`openspec-review`, `openspec-apply-change` and `openspec-verify-change`",
    "pinning only review or only verification is insufficient",
    "Tool permissions remain separately configured",
    "neither expands scope nor provides OS isolation",
  ]);
});

test("move-only archive docs reject collisions and retain observed partial state", () => {
  includesAll(finalize, [
    "performs no second sync",
    "whole change directory",
    "`.openspec.yaml`",
    "changesDir/archive/",
    "`YYYY-MM-DD-<changeId>`",
    "current UTC date",
    "prefix is preserved, not doubled",
    "file, directory or dangling symlink",
    "no overwrite, merge, automatic alternate name or inferred success",
    "exclusive operation",
    "does not provide a concurrent-writer transaction",
    "confirmed source absence and destination presence",
    "`moved_unconfirmed`",
    "not success or a guarantee that the change is still active",
    "Failure preserves existing and partial edits",
    "does not revert specs",
    "current active tree afresh",
    "independently reassesses even already-applied changes",
    "Already-archived targets are rejected",
    "no commits, stashes, reset, rollback, separate report files",
  ]);
});

test("finalization result fields and states are distinguished from the runtime envelope", async () => {
  const source = await load("flows/openspec-finalize/flow.ts");
  for (const field of [
    "changeId",
    "outcome",
    "summary",
    "phase",
    "failedPhase",
    "phases",
    "sync",
    "assessment",
    "remaining",
    "archive",
  ]) {
    assert.ok(finalize.includes(`\`${field}\``), field);
    assert.match(source, new RegExp(`\\b${field}\\??:`));
  }
  includesAll(finalize, [
    "`not_started`, `completed`, `failed` or `not_applicable`",
    "`not_started`, `moving`, `failed`, `moved_unconfirmed` or `archived`",
    "Only `success` exits zero",
    "`failed` and `cancelled` exit nonzero",
    "CLI run envelope",
    "it is not the flow-owned result",
  ]);
});

test("pipeline docs preserve native stage policies, independent budgets and transparent complete steering", () => {
  includesAll(pipeline, [
    "one single native acpx graph",
    "groom → implement → verify → finalize",
    "not shell chaining",
    "stage-scoping adapter",
    "outputs, results, step history and node identifiers",
    "Existing acceptance policies, authorized edit scopes, fresh sessions, per-node timeouts",
    "independent budgets",
    "implementation repairs never consume verification's budget",
    "Missing, malformed, contradictory or unsuccessful results",
    "no-Critical/no-Warning acceptance with required evidence",
    "not the entire stderr stream",
    "Stage-labelled stderr progress",
    "issues, recommendations and scoped questions",
    "originating stage's existing logic",
    "TTYs",
    "seven-day",
    "complete-answer",
    "Incomplete answers cannot authorize that cycle's edits",
    "`needs_human` stops the pipeline with later stages `not_started`",
    "aggregate flow-owned JSON result",
    "not duplicate constituent terminal JSON",
    "ordered `stages` entries (`stage`, `status`, retained child `result`)",
    "`limit_reached`, `needs_human`, `cancelled` or `failed`",
    "all four stages",
    "CLI run envelope",
    "do not confuse that runtime output with the aggregate result",
    "restart begins again at groom",
    "fresh stage-local budgets",
    "standalone groom/implement/verify/finalize entrypoints",
    "Already-archived targets are invalid",
    "Neither new entrypoint performs automatic Git management",
  ]);
});

test("aggregate documentation names the actual pipeline result contract", async () => {
  const source = await load("flows/openspec-all/helpers.ts");
  for (const field of [
    "changeId",
    "workspace",
    "outcome",
    "summary",
    "activeStage",
    "failedStage",
    "stages",
    "finalization",
    "archive",
    "stage",
    "status",
    "result",
  ]) {
    assert.ok(pipeline.includes(`\`${field}\``), field);
    assert.match(source, new RegExp(`\\b${field}\\??:`));
  }
});

test("both flows document bounded observed cancellation and persisted diagnostics for uncovered intervals", () => {
  includesAll(pipeline, [
    "Both `openspec-finalize` and `openspec-all`",
    "best-effort cancellation emission at most once",
    "only where cancellation is observed",
    "active attempt-scoped abort signals",
    "check already-aborted signals",
    "cleaned up when their scope ends",
    "routing bypass after listener installation",
    "only recorded progress",
    "preserves edits and prevents later dispatch",
    "never fabricates an absent child result",
    "not an exactly-once delivery guarantee",
    "public parent-run signal",
    "whole-invocation cancellation coverage",
    "callback gaps",
    "node-start persistence",
    "routing bypass before listener installation",
    "may be absent",
    "Forced termination",
    "acpx persisted run history/transcripts",
    "~/.acpx/flows/runs/",
    "missing output does not prove that no writes or move occurred",
    "without a runtime/dependency change",
  ]);
});

test("repository layout and terminology keep finalization separate from implementation verification", () => {
  includesAll(agents, [
    "`flows/openspec-finalize/`",
    "independent read-only sync assessor",
    "invocation asserts prior implementation verification without saved evidence",
    "`flows/openspec-all/`",
    "Single native groom → implement → verify → finalize pipeline",
    "independent budgets and transparent terminal steering",
    "documentation-contract tests",
  ]);
  includesAll(glossary, [
    "**Verification acceptance**:",
    "acceptance does not mean the change has been synced or archived",
    "**Change finalization**:",
    "accepting that synchronization independently",
    "Finalization does not perform implementation verification or repairs",
    "**Synchronization acceptance**:",
    "distinct from implementation verification acceptance",
    "does not by itself mean the change has been archived",
    "Archival is distinct from spec synchronization",
  ]);
});
