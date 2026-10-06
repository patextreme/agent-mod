import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import { type Operation, preflight, prepare } from "./helpers.js";
import { fixture } from "./test-fixture.js";

const op = (kind: Operation["kind"], name: string, to?: string): Operation =>
  to === undefined
    ? { id: `${kind}:${name}`, kind, name }
    : { id: `${kind}:${name}->${to}`, kind, name, to };
const fresh = "## ADDED Requirements\n### Requirement: Fresh\n";

// Portable parity fixtures for OpenSpec 1.14.1 parseDeltaSpec, checked against
// requirement-blocks.js and code-fence.js. No production internal import or
// installed CLI/Nix-store path is needed to run these tests. Operation order
// here follows the authored document; CLI plans group operations by kind.
test("delta reader parity: section casing/outer whitespace, requirement casing/spacing, normalized names and line endings", async (t) => {
  const f = await fixture(t);
  f.status.artifactPaths.specs.existingOutputPaths = [f.deltaPath];
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  for (const kind of ["ADDED", "MODIFIED", "REMOVED"] as const)
    for (const section of [
      `## ${kind} Requirements`,
      `##\t ${kind.toLowerCase()} requirements \t`,
      `##   ${kind[0]}${kind.slice(1).toLowerCase()} Requirements`,
    ])
      for (const header of [
        "### Requirement:",
        "###requirement:",
        "###\tREQUIREMENT:",
      ])
        for (const [rawName, name] of [
          ["Legacy ###", "Legacy"],
          ["  Trimmed\t##\t", "Trimmed"],
          ["C#", "C#"],
          ["Keep\u00a0###", "Keep\u00a0###"],
          ["Interior  space", "Interior  space"],
        ]) {
          const delta = `\uFEFF${section}\r\n${header} ${rawName}\r\n`;
          await writeFile(f.deltaPath, delta);
          const inputs = await prepare(target, f.command);
          assert.deepEqual(
            inputs.capabilities[0].operations,
            [op(kind, name)],
            delta,
          );
        }
  await writeFile(
    f.deltaPath,
    "\uFEFF## added requirements\r###requirement: Bare CR ###\r",
  );
  assert.deepEqual(
    (await prepare(target, f.command)).capabilities[0].operations,
    [op("ADDED", "Bare CR")],
  );
});

test("delta reader parity: every optional rename bullet/backtick and name normalization", async (t) => {
  const f = await fixture(t);
  f.status.artifactPaths.specs.existingOutputPaths = [f.deltaPath];
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  for (const fromMarker of ["", "-", "*", "+"])
    for (const toMarker of ["", "-", "*", "+"])
      for (const tick of ["", "`"]) {
        const delta = `${fresh}##\tRenamed Requirements \t\n  ${fromMarker} FROM: ${tick}###Requirement: Old name ###${tick}\n\t${toMarker} TO: ${tick}###\tRequirement: C#${tick}\n`;
        await writeFile(f.deltaPath, delta);
        assert.deepEqual(
          (await prepare(target, f.command)).capabilities[0].operations,
          [op("ADDED", "Fresh"), op("RENAMED", "Old name", "C#")],
          delta,
        );
      }
});

test("delta reader parity: unsupported internal section whitespace and bullet label casing are not broadened", async (t) => {
  const f = await fixture(t);
  f.status.artifactPaths.specs.existingOutputPaths = [f.deltaPath];
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  for (const ignored of [
    "## ADDED  Requirements\n### Requirement: Ignored",
    "## MODIFIED\tRequirements\n### Requirement: Ignored",
    "## REMOVED Requirements ###\n### Requirement: Ignored",
    "##Notes\n### Requirement: Ignored",
    "## REMOVED Requirements\n- `### requirement: Ignored`",
    "## RENAMED Requirements\n* from: `### Requirement: Ignored`\n* to: `### Requirement: Other`",
    "## RENAMED Requirements\n+ FROM: `### requirement: Ignored`\n+ TO: `### requirement: Other`",
  ]) {
    // ##Notes is not a section boundary; place it outside the selected section.
    await writeFile(f.deltaPath, `## Notes\n${ignored}\n${fresh}`);
    assert.deepEqual(
      (await prepare(target, f.command)).capabilities[0].operations,
      [op("ADDED", "Fresh")],
      ignored,
    );
  }
});

test("delta reader parity: fence lines/content and false closers cannot create operations or section boundaries", async (t) => {
  const f = await fixture(t);
  f.status.artifactPaths.specs.existingOutputPaths = [f.deltaPath];
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  for (const marker of ["`", "~"]) {
    const open = marker.repeat(4);
    const other = marker === "`" ? "~~~" : "```";
    const example = `${open}markdown\n## REMOVED Requirements\n### Requirement: Ghost\n${other}\n${marker.repeat(3)}\n${open}not-a-close\n## RENAMED Requirements\n* TO: \`### Requirement: Ghost\`\n  ${open}${marker}\n`;
    await writeFile(
      f.deltaPath,
      `${fresh}${example}###requirement: Real ###\n## Renamed Requirements\n+ FROM: ###Requirement: Old\n${example}+ TO: ###Requirement: New\n`,
    );
    assert.deepEqual(
      (await prepare(target, f.command)).capabilities[0].operations,
      [op("ADDED", "Fresh"), op("ADDED", "Real"), op("RENAMED", "Old", "New")],
    );
  }
  await writeFile(
    f.deltaPath,
    `${fresh}\n  ~~~\n## REMOVED Requirements\n### Requirement: Ghost\n`,
  );
  assert.deepEqual(
    (await prepare(target, f.command)).capabilities[0].operations,
    [op("ADDED", "Fresh")],
  );
});

test("delta reader parity: repeated/case-variant sections retain every operation", async (t) => {
  const f = await fixture(t);
  f.status.artifactPaths.specs.existingOutputPaths = [f.deltaPath];
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  await writeFile(
    f.deltaPath,
    `${fresh}## added requirements\n###requirement: Second\n## RENAMED Requirements\n* FROM: ###Requirement: Old\n* TO: ###Requirement: New\n## renamed requirements\n+ FROM: ###Requirement: Other\n+ TO: ###Requirement: Another\n## Removed Requirements\n* \`###Requirement: Legacy ###\`\n## removed requirements\n###requirement: Obsolete\n`,
  );
  assert.deepEqual(
    (await prepare(target, f.command)).capabilities[0].operations,
    [
      op("ADDED", "Fresh"),
      op("ADDED", "Second"),
      op("RENAMED", "Old", "New"),
      op("RENAMED", "Other", "Another"),
      op("REMOVED", "Legacy"),
      op("REMOVED", "Obsolete"),
    ],
  );
});

test("duplicate normalized operations and incomplete/interleaved renames fail closed even with an addition", async (t) => {
  const f = await fixture(t);
  f.status.artifactPaths.specs.existingOutputPaths = [f.deltaPath];
  const target = await preflight({ changeId: f.id }, f.cwd, f.command);
  const from = "* FROM: `###Requirement: Old ###`\n";
  const to = "+ TO: `###Requirement: New ###`\n";
  for (const invalid of [
    `## RENAMED Requirements\n${from}`,
    `## RENAMED Requirements\n${to}`,
    `## RENAMED Requirements\n${from}${from}${to}`,
    `## RENAMED Requirements\n${from}${to}${to}`,
    `## RENAMED Requirements\n${from}## renamed requirements\n${to}`,
    `## RENAMED Requirements\n${from}## Notes\n${to}`,
    `## RENAMED Requirements\n${from}## RENAMED  Requirements\n${to}`,
    `## RENAMED Requirements\n${from}\n~~~\n${to}~~~\n`,
    `## RENAMED Requirements\n${from}${to}## renamed requirements\nFROM: ### Requirement: Old\nTO: ### Requirement: New\n`,
    "## Added Requirements\n###requirement: Fresh ###\n",
    "## MODIFIED Requirements\n### Requirement: Same\n## modified requirements\n###requirement: Same ###\n",
  ]) {
    await writeFile(f.deltaPath, fresh + invalid);
    await assert.rejects(
      prepare(target, f.command),
      /rename|duplicate delta operations/i,
      invalid,
    );
    assert.ok(f.calls.every((args) => args[0] !== "instructions"));
  }
});
