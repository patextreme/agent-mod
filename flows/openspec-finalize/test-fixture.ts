import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import type { Command } from "../shared/command.js";
import type { Assessment, SyncInputs } from "./helpers.js";

export const changeId = "fixture-change";
export const original =
  "# Identity Specification\n\n## Purpose\nHuman-owned Purpose stays exactly intact.\n\n## Requirements\n\n### Requirement: Login\nThe system SHALL sign in.\n\n#### Scenario: Updated\n- **WHEN** old input\n- **THEN** old result\n\n#### Scenario: Unaffected\n- **WHEN** existing unrelated input\n- **THEN** KEEP DIRTY HUMAN SCENARIO\n\n### Requirement: Legacy\nLegacy SHALL go away.\n\n### Requirement: Old name\nRename SHALL retain content.\n";
export const delta =
  "# Delta\n\n## Purpose\nIgnored for existing capabilities.\n\n## ADDED Requirements\n\n### Requirement: Fresh\nThe system SHALL add fresh behavior.\n\n#### Scenario: Fresh\n- **WHEN** new input\n- **THEN** fresh result\n\n## MODIFIED Requirements\n\n### Requirement: Login\n#### Scenario: Updated\n- **WHEN** new input\n- **THEN** new result\n\n## REMOVED Requirements\n\n### Requirement: Legacy\n**Reason**: retired\n**Migration**: Fresh\n\n## RENAMED Requirements\n\n- FROM: `### Requirement: Old name`\n- TO: `### Requirement: New name`\n";
export const merged =
  original
    .replace("old input", "new input")
    .replace("old result", "new result")
    .replace("### Requirement: Legacy\nLegacy SHALL go away.\n\n", "")
    .replace("### Requirement: Old name", "### Requirement: New name") +
  "\n### Requirement: Fresh\nThe system SHALL add fresh behavior.\n\n#### Scenario: Fresh\n- **WHEN** new input\n- **THEN** fresh result\n";
export async function fixture(
  t: TestContext,
  opts: { noDelta?: boolean; name?: string; mode?: string } = {},
) {
  const base = await mkdtemp(join(tmpdir(), "finalize-fixture-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const cwd = join(base, "workspace");
  const id = opts.name ?? changeId;
  const changesDir = join(cwd, "openspec/changes");
  const changeRoot = join(changesDir, id);
  await mkdir(changeRoot, { recursive: true });
  await writeFile(
    join(changeRoot, ".openspec.yaml"),
    "schema: spec-driven\nretire_capabilities: true\n",
  );
  await writeFile(
    join(changeRoot, "tasks.md"),
    "- [ ] Caller asserts verification; no task judging\n",
  );
  await writeFile(join(cwd, "dirty.txt"), "KEEP UNRELATED DIRTY EDIT\n");
  const cap = "identity/login";
  const deltaPath = join(changeRoot, "specs", cap, "spec.md");
  const mainPath = join(cwd, "openspec/specs", cap, "spec.md");
  const freshPath = join(changeRoot, "specs/new-capability/spec.md");
  const freshMain = join(cwd, "openspec/specs/new-capability/spec.md");
  const freshDelta =
    "# Delta\n\n## Purpose\nA new capability Purpose copied verbatim from its delta.\n\n## ADDED Requirements\n\n### Requirement: New capability\nThe system SHALL create this capability.\n\n#### Scenario: Create\n- **WHEN** input arrives\n- **THEN** create output\n";
  const freshMerged = freshDelta
    .replace("# Delta", "# new-capability Specification")
    .replace("## ADDED Requirements", "## Requirements");
  if (!opts.noDelta) {
    for (const path of [deltaPath, mainPath, freshPath])
      await mkdir(dirname(path), { recursive: true });
    await writeFile(deltaPath, delta);
    await writeFile(mainPath, original);
    await writeFile(freshPath, freshDelta);
  }
  const status = {
    changeRoot,
    planningHome: { kind: "repo", root: cwd, changesDir },
    actionContext: { mode: "repo-local" },
    artifactPaths: {
      specs: {
        existingOutputPaths: opts.noDelta ? [] : [deltaPath, freshPath],
      },
    },
  };
  const listing = { root: { path: cwd }, changes: [{ name: id }] };
  const instructions: Record<string, unknown> = {
    changeName: id,
    changeDir: changeRoot,
    artifactId: "specs",
    outputPath: "specs/**/*.md",
    instruction: "Spec content only",
    rules: ["Use SHALL and WHEN/THEN scenarios."],
  };
  const calls: string[][] = [];
  const command: Command = async (args, root) => {
    assert.equal(root, cwd);
    calls.push(args);
    assert.ok(
      args[0] === "list" ||
        args[0] === "status" ||
        (args[0] === "instructions" && args[1] === "specs"),
      `Unexpected verification/archive/repair command ${args}`,
    );
    return {
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify(
        args[0] === "list"
          ? listing
          : args[0] === "status"
            ? status
            : instructions,
      ),
    };
  };
  const expected: Record<string, string> = {
    [cap]: merged,
    "new-capability": freshMerged,
  };
  const config = {
    cwd,
    changeId: id,
    mode: opts.mode,
    status,
    listing,
    instructions,
    expected,
  };
  await writeFile(join(cwd, ".finalize-fixture.json"), JSON.stringify(config));
  const sync = {
    outcome: "success" as const,
    summary: "WORKER TRANSCRIPT MUST NOT REACH ASSESSOR",
    issues: [],
    placeholders: [],
  };
  async function apply(inputs: SyncInputs) {
    for (const item of inputs.capabilities) {
      await mkdir(dirname(item.mainPath), { recursive: true });
      await writeFile(item.mainPath, config.expected[item.capability]);
    }
  }
  async function unchanged() {
    assert.equal(
      await readFile(join(cwd, "dirty.txt"), "utf8"),
      "KEEP UNRELATED DIRTY EDIT\n",
    );
  }
  return {
    base,
    cwd,
    id,
    changeRoot,
    changesDir,
    cap,
    deltaPath,
    mainPath,
    freshPath,
    freshMain,
    freshDelta,
    freshMerged,
    status,
    listing,
    instructions,
    calls,
    command,
    config,
    sync,
    apply,
    unchanged,
  };
}
export function accepted(inputs: SyncInputs): Assessment {
  return {
    verdict: "accepted",
    summary: "Every delta effect and baseline preservation established",
    issues: [],
    coverage: inputs.capabilities.map((item) => ({
      capability: item.capability,
      verdict: "accepted",
      operations: item.operations.map((op) => ({
        id: op.id,
        verdict: "accepted",
        evidence: [
          `${op.kind} ${op.name}: intended content inspected in current spec`,
        ],
      })),
      purposeEvidence: [
        item.baseline === null
          ? "Delta Purpose copied verbatim or declared TBD"
          : "Original Purpose unchanged",
      ],
      structureEvidence: ["Purpose and single Requirements; no delta headers"],
      preservationEvidence: [
        item.baseline === null
          ? "New spec has no prior content to lose"
          : "Unaffected dirty human scenario remains intact",
      ],
      rulesEvidence: inputs.rules.length ? ["SHALL and WHEN/THEN checked"] : [],
      retirementEvidence: [
        "Explicit retire_capabilities: true considered; retained nonempty capability",
      ],
      discrepancies: [],
    })),
  };
}
