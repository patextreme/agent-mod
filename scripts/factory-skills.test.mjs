import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatSkillsForPrompt,
  loadSkills,
  parseFrontmatter,
} from "@earendil-works/pi-coding-agent";

// Static distribution and illustrative contract coverage only: no sessions,
// model calls, workflow dispatch, GitHub access, signing, sync/archive, or cleanup.
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const factorySkills = {
  "orc-openspec-groom": ["references/pseudocode.md"],
  "orc-openspec-implement": ["references/pseudocode.md"],
  "orc-openspec-verify": ["references/pseudocode.md"],
  "orc-openspec-all": [
    "references/pseudocode.md",
    "references/evidence-and-recovery.md",
  ],
  "orc-pr-review-repair": [
    "references/pseudocode.md",
    "references/report-contracts.md",
    "references/archived-intent.md",
    "references/continuation.md",
  ],
  "orc-issue-to-pr": [
    "references/pseudocode.md",
    "references/openspec-finalization.md",
    "references/recovery-and-receipts.md",
  ],
  "cleanup-merged-issues": [],
};
const externalSkills = [
  "code-review",
  "openspec-apply-change",
  "openspec-verify-change",
  "openspec-update-change",
  "openspec-propose",
  "openspec-sync-specs",
  "openspec-archive-change",
];

function assertWithin(root, path) {
  const local = relative(root, path);
  assert.ok(
    !isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`),
    `${path} must stay inside ${root}`,
  );
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    assert.ok(
      !entry.isSymbolicLink(),
      `resource must not be a symlink: ${path}`,
    );
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function localMarkdownTargets(content) {
  // Inline/image links and reference-style definitions. Ignore URL/anchor
  // targets, but retain absolute filesystem paths so validation rejects them.
  const targets = [
    ...content.matchAll(
      /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+[^)]*)?\)/g,
    ),
    ...content.matchAll(/^\s*\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm),
  ].map((match) => match[1].replace(/^<|>$/g, ""));
  return targets.filter(
    (target) =>
      !target.startsWith("#") && !/^(?:https?:|mailto:)/i.test(target),
  );
}

function checkInstalledSkill(installedRoot, name, references) {
  const skillDir = join(installedRoot, "skills", name);
  const skillPath = join(skillDir, "SKILL.md");
  const content = readFileSync(skillPath, "utf8");
  assert.match(content, /^---\r?\n/, `${name} must declare frontmatter`);
  const { frontmatter } = parseFrontmatter(content);
  assert.equal(frontmatter.name, name);
  assert.match(frontmatter.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(frontmatter.name.length <= 64);
  for (const [field, maxLength] of [
    ["description", 1024],
    ["compatibility", 500],
  ]) {
    assert.equal(typeof frontmatter[field], "string", `${name}: ${field}`);
    assert.ok(frontmatter[field].trim(), `${name}: ${field} must not be empty`);
    assert.ok(
      frontmatter[field].length <= maxLength,
      `${name}: ${field} exceeds ${maxLength} characters`,
    );
  }
  assert.equal(
    frontmatter["disable-model-invocation"] === true,
    name === "cleanup-merged-issues",
  );

  for (const reference of references) {
    assert.ok(
      content.includes(reference),
      `${name} must reference ${reference}`,
    );
    assert.ok(lstatSync(join(skillDir, reference)).isFile());
  }
  for (const path of filesUnder(skillDir).filter((path) =>
    path.endsWith(".md"),
  )) {
    const markdown = readFileSync(path, "utf8");
    assert.ok(!markdown.includes(repoRoot), `${path}: source-checkout path`);
    assert.doesNotMatch(
      markdown,
      /(?:\.agents|\.pi)[/\\]skills|(?:~[/\\]|[/\\](?:home|Users)[/\\])|file:\/\//,
      `${path}: checkout/home-specific skill dependency`,
    );
    for (const target of localMarkdownTargets(markdown)) {
      assert.ok(!isAbsolute(target), `${path}: absolute link ${target}`);
      assert.ok(!/^[a-z][a-z0-9+.-]*:/i.test(target), `${path}: ${target}`);
      const localPath = decodeURIComponent(target.split(/[?#]/)[0]);
      const destination = resolve(dirname(path), localPath);
      assertWithin(join(installedRoot, "skills"), destination);
      assertWithin(join(installedRoot, "skills"), realpathSync(destination));
      assert.ok(
        lstatSync(destination).isFile(),
        `${path}: broken link ${target}`,
      );
    }
  }
}

function checkFactoryNotice(skillsRoot) {
  // Merged main retains the standalone notice, not historical provenance.
  const licensePath = join(skillsRoot, "LICENSE");
  assertWithin(skillsRoot, licensePath);
  assertWithin(skillsRoot, realpathSync(licensePath));
  assert.equal(
    readFileSync(licensePath, "utf8"),
    readFileSync(join(repoRoot, "LICENSE"), "utf8"),
    "distributed notice must match the complete root MIT notice",
  );
}

test(
  "standalone Nix skills output contains the complete MIT notice",
  { skip: !process.env.PI_FACTORY_SKILLS_OUTPUT },
  () => checkFactoryNotice(process.env.PI_FACTORY_SKILLS_OUTPUT),
);

test("notice validation rejects missing, truncated and escaping notices", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "pi-factory-notice-"));
  try {
    const skillsRoot = join(tempRoot, "skills");
    mkdirSync(skillsRoot);
    const noticePath = join(skillsRoot, "LICENSE");
    assert.throws(() => checkFactoryNotice(skillsRoot), /ENOENT/);
    writeFileSync(noticePath, "MIT License\n");
    assert.throws(
      () => checkFactoryNotice(skillsRoot),
      /complete root MIT notice/,
    );
    rmSync(noticePath);
    const outside = join(tempRoot, "LICENSE");
    copyFileSync(join(repoRoot, "LICENSE"), outside);
    symlinkSync(outside, noticePath);
    assert.throws(() => checkFactoryNotice(skillsRoot), /must stay inside/);
    rmSync(noticePath);
    copyFileSync(outside, noticePath);
    checkFactoryNotice(skillsRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

function seedDefaultSkill(dir, name) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Default-resource isolation canary.\n---\nNot a packaged skill.\n`,
  );
}

test("factory skills are self-contained, packaged, and discoverable without defaults", async (t) => {
  const tempRoot = mkdtempSync(join(tmpdir(), "pi-factory-skills-"));
  try {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    );
    assert.deepEqual(manifest.pi.skills, ["./skills"]);
    writeFileSync(join(tempRoot, ".npmrc"), "");
    const packed = JSON.parse(
      execFileSync(
        "npm",
        ["pack", "--dry-run", "--json", "--ignore-scripts", "--offline"],
        {
          cwd: repoRoot,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
          env: {
            ...process.env,
            npm_config_cache: join(tempRoot, "npm-cache"),
            npm_config_userconfig: join(tempRoot, ".npmrc"),
          },
        },
      ),
    );
    assert.equal(packed.length, 1);
    const packedPaths = new Set(packed[0].files.map((file) => file.path));
    const installedRoot = join(
      tempRoot,
      "installed",
      "node_modules",
      manifest.name,
    );
    mkdirSync(installedRoot, { recursive: true });
    // Copy only actual npm-pack resources, never load a source skill path.
    for (const path of packedPaths) {
      if (path !== "package.json" && !path.startsWith("skills/")) continue;
      const source = resolve(repoRoot, path);
      const destination = resolve(installedRoot, path);
      assertWithin(repoRoot, source);
      assertWithin(installedRoot, destination);
      assert.ok(
        lstatSync(source).isFile(),
        `packed resource must be a file: ${path}`,
      );
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }

    await t.test(
      "npm dry-run includes all toolkit definitions and every bundled file",
      () => {
        for (const [name, references] of Object.entries(factorySkills)) {
          for (const path of ["SKILL.md", ...references]) {
            assert.ok(
              packedPaths.has(`skills/${name}/${path}`),
              `not packed: ${name}/${path}`,
            );
          }
          for (const path of filesUnder(join(repoRoot, "skills", name))) {
            const resource = relative(repoRoot, path).split(sep).join("/");
            assert.ok(packedPaths.has(resource), `not packed: ${resource}`);
            assert.equal(
              readFileSync(join(installedRoot, resource)).compare(
                readFileSync(path),
              ),
              0,
              `installed copy differs: ${resource}`,
            );
          }
        }
      },
    );

    await t.test(
      "npm ships the complete MIT notice without retired provenance",
      () => {
        assert.ok(
          packedPaths.has("skills/LICENSE"),
          "not packed: skills/LICENSE",
        );
        assert.ok(!packedPaths.has("skills/FACTORY-PROVENANCE.md"));
        checkFactoryNotice(join(installedRoot, "skills"));
      },
    );

    for (const [name, references] of Object.entries(factorySkills)) {
      await t.test(
        `${name}: portable metadata and installed reference links`,
        () => {
          checkInstalledSkill(installedRoot, name, references);
        },
      );
    }

    await t.test(
      "installed archived-repair contracts retain sources, intent and ordinary policy",
      () => {
        const resource = (path) =>
          readFileSync(join(installedRoot, "skills", path), "utf8");
        const skill = resource("orc-pr-review-repair/SKILL.md");
        const archive = resource(
          "orc-pr-review-repair/references/archived-intent.md",
        );
        const pseudocode = resource(
          "orc-pr-review-repair/references/pseudocode.md",
        );
        const reports = resource(
          "orc-pr-review-repair/references/report-contracts.md",
        );
        const issueHandoff = resource("orc-issue-to-pr/SKILL.md");
        assert.match(skill, /Optional OpenSpec archived-source context/);
        assert.match(
          skill,
          /both axes; read files directly without active-change commands/,
        );
        assert.match(skill, /complete prior ledger\/history/);
        assert.match(skill, /Only a verified reservation permits edits/);
        assert.match(skill, /Allow at most ten repair attempts/);
        assert.match(skill, /Report-only:\*\* minor bugs/);
        assert.match(skill, /push without force to the exact PR head branch/);
        assert.match(
          archive,
          /Ordinary PRs keep their existing sources and policies/,
        );
        assert.match(
          archive,
          /Supply no previous findings, judgments, repair summaries or history comments/,
        );
        assert.match(
          archive,
          /Documents already expressing the correction may stay unchanged/,
        );
        assert.match(
          archive,
          /Preserve unaffected requirements\/scenarios and mandatory test expectations/,
        );
        assert.match(archive, /disposable validation fixture/);
        assert.match(
          archive,
          /fixing commit invalidates earlier head-bound gates/,
        );
        assert.match(pseudocode, /new intent or uncertain authority: ESCALATE/);
        assert.match(reports, /Archived alignment \(if applicable\)/);
        assert.match(reports, /parallel history protocol/);
        assert.match(
          issueHandoff,
          /For OpenSpec, pass the confirmed archive path\/complete inventory/,
        );
      },
    );

    await t.test(
      "installed issue recovery and PR continuation contracts retain receipt boundaries",
      () => {
        const resource = (path) =>
          readFileSync(join(installedRoot, "skills", path), "utf8");
        const recovery = resource(
          "orc-issue-to-pr/references/recovery-and-receipts.md",
        );
        const continuation = resource(
          "orc-pr-review-repair/references/continuation.md",
        );
        const reports = resource(
          "orc-pr-review-repair/references/report-contracts.md",
        );
        assert.match(
          recovery,
          /Direct edits retain existing resume\/delivery policy/,
        );
        assert.match(
          resource("orc-issue-to-pr/references/pseudocode.md"),
          /IF flow = OpenSpec AND \(explicit resume or interrupted operation\)/,
        );
        assert.match(continuation, /Ordinary PRs need no archive context/);
        assert.match(recovery, /status-authoritative inventory/);
        assert.match(
          recovery,
          /finish only missing authorized effects idempotently/,
        );
        assert.match(recovery, /current valid specs-rule snapshot/);
        assert.match(
          recovery,
          /synchronous inline sync and built-in full comparison/,
        );
        assert.match(recovery, /No second move, reopen or active-stage replay/);
        assert.match(recovery, /search matching PRs/);
        assert.match(recovery, /Independent|independently|Independently/);
        assert.match(
          recovery,
          /entire outgoing content before any remaining publication/,
        );
        assert.match(
          recovery,
          /not native checkpoints, a transaction or automatic rollback/,
        );
        assert.match(
          continuation,
          /Every verified repair-start consumes its attempt/,
        );
        assert.match(
          continuation,
          /same identity, authorization, run ID, ledger/,
        );
        assert.match(
          continuation,
          /Keep history away from the next fresh reviewer and both axes/,
        );
        assert.match(continuation, /plus authorized repair-owned changes/);
        assert.match(
          continuation,
          /At attempt ten.*never reserve attempt eleven/,
        );
        assert.match(reports, /Continuation state:/);
        assert.match(
          reports,
          /Original sync acceptance.*complete current inventory/,
        );
        assert.match(
          reports,
          /Final reviewed \/ delivered \/ required-gate SHA/,
        );
      },
    );

    await t.test(
      "Pi SDK loads only explicit installed skills, including human-only cleanup",
      () => {
        const cwd = join(tempRoot, "project");
        const agentDir = join(tempRoot, "agent");
        mkdirSync(cwd, { recursive: true });
        mkdirSync(agentDir, { recursive: true });
        // Deliberately valid defaults: excluding them must not depend on an
        // empty machine, the user's home, or this repository's .pi directory.
        seedDefaultSkill(join(agentDir, "skills"), "code-review");
        seedDefaultSkill(join(cwd, ".pi", "skills"), "openspec-verify-change");
        seedDefaultSkill(
          join(cwd, ".agents", "skills"),
          "openspec-apply-change",
        );
        const installedManifest = JSON.parse(
          readFileSync(join(installedRoot, "package.json"), "utf8"),
        );
        const { skills, diagnostics } = loadSkills({
          cwd,
          agentDir,
          skillPaths: installedManifest.pi.skills.map((path) =>
            resolve(installedRoot, path),
          ),
          includeDefaults: false,
        });
        assert.deepEqual(diagnostics, []);
        const byName = new Map(skills.map((skill) => [skill.name, skill]));
        for (const [name, references] of Object.entries(factorySkills)) {
          const skill = byName.get(name);
          assert.ok(skill, `Pi did not discover ${name}`);
          assert.equal(
            skill.filePath,
            join(installedRoot, "skills", name, "SKILL.md"),
          );
          assert.equal(skill.baseDir, dirname(skill.filePath));
          assertWithin(installedRoot, realpathSync(skill.filePath));
          assert.equal(
            skill.disableModelInvocation,
            name === "cleanup-merged-issues",
          );
          for (const reference of references) {
            assert.ok(lstatSync(join(skill.baseDir, reference)).isFile());
          }
        }
        assert.ok(
          byName.has("openspec-review"),
          "package-supplied review must remain available",
        );
        for (const name of externalSkills) {
          assert.ok(
            !byName.has(name),
            `external/default skill unexpectedly loaded: ${name}`,
          );
        }
        for (const skill of skills)
          assertWithin(installedRoot, realpathSync(skill.filePath));
        const advertised = formatSkillsForPrompt(skills);
        assert.ok(!advertised.includes("<name>cleanup-merged-issues</name>"));
        for (const name of Object.keys(factorySkills).filter(
          (name) => name !== "cleanup-merged-issues",
        )) {
          assert.ok(advertised.includes(`<name>${name}</name>`));
        }
      },
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

// Declarative examples, not a workflow runner. No fixture resolves a target,
// dispatches an agent, executes gates, or establishes real stage acceptance.
const acceptedStageTrace = [
  {
    step: "prepare",
    accepted: true,
    nestedTools: true,
    depth: true,
    skills: true,
  },
  { step: "groom", accepted: true, complete: true, fresh: true, critical: 0 },
  {
    step: "readiness",
    accepted: true,
    structuralValidation: true,
    dispositionsComplete: true,
    unresolvedDecision: false,
    major: 1,
  },
  { step: "guard:implement", accepted: true, current: true, sameTarget: true },
  {
    step: "implement",
    accepted: true,
    tasksComplete: true,
    independentDiffChecks: true,
    integratedChecks: true,
    freshApplyStatus: true,
    serializedBookkeeping: true,
  },
  { step: "guard:verify", accepted: true, current: true, sameTarget: true },
  {
    step: "verify",
    accepted: true,
    complete: true,
    fresh: true,
    critical: 0,
    warning: 0,
    requiredChecks: true,
    suggestions: 1,
    skippedOptional: ["No optional design artifact; scope disclosed"],
  },
];
const pauseEvent = { step: "pause" };
const allStages = ["groom", "implement", "verify", "finalize"];
const throughStage = (step) =>
  structuredClone(
    acceptedStageTrace.slice(
      0,
      acceptedStageTrace.findIndex((event) => event.step === step) + 1,
    ),
  );
const humanQuestion = {
  finding: "Implementation needs a product choice",
  evidence: "Approved artifacts leave two materially different behaviors",
  attemptedFixes: "Read recorded decisions; neither determines the choice",
  question: "Which behavior should be implemented?",
  options: ["Keep existing behavior", "Adopt the proposed behavior"],
  consequences: "The choices differ in compatibility",
  recommendation: "Keep compatibility until explicitly authorized",
  scope: "Selected change behavior only",
};
const lifecycleStageFixtures = [
  {
    id: "ordered-stages",
    events: structuredClone(acceptedStageTrace),
    unstarted: ["finalize"],
  },
  {
    id: "stale-readiness",
    events: [
      ...throughStage("readiness"),
      {
        step: "guard:implement",
        accepted: false,
        current: false,
        sameTarget: true,
      },
      { ...acceptedStageTrace[2], step: "refresh:readiness" },
      ...structuredClone(acceptedStageTrace.slice(3)),
    ],
    unstarted: ["finalize"],
  },
  {
    id: "stale-implementation",
    events: [
      ...throughStage("implement"),
      {
        step: "guard:verify",
        accepted: false,
        current: false,
        sameTarget: true,
      },
      { ...acceptedStageTrace[4], step: "refresh:implement" },
      ...structuredClone(acceptedStageTrace.slice(5)),
    ],
    unstarted: ["finalize"],
  },
  {
    id: "missing-predecessor",
    events: [
      ...throughStage("readiness"),
      {
        step: "guard:implement",
        accepted: false,
        current: true,
        sameTarget: true,
        missingReport: true,
      },
      pauseEvent,
    ],
    unstarted: ["implement", "verify", "finalize"],
  },
  {
    id: "major-readiness-decision",
    events: [
      ...throughStage("groom"),
      {
        ...acceptedStageTrace[2],
        accepted: false,
        unresolvedDecision: true,
        humanInput: humanQuestion,
      },
      pauseEvent,
    ],
    unstarted: ["implement", "verify", "finalize"],
  },
  {
    id: "structural-validation-failed",
    events: [
      ...throughStage("groom"),
      {
        ...acceptedStageTrace[2],
        accepted: false,
        structuralValidation: false,
      },
      pauseEvent,
    ],
    unstarted: ["implement", "verify", "finalize"],
  },
  {
    id: "human-input",
    events: [
      ...throughStage("guard:implement"),
      { ...acceptedStageTrace[4], accepted: false, humanInput: humanQuestion },
      pauseEvent,
    ],
    unstarted: ["verify", "finalize"],
  },
  {
    id: "missing-nested-tools",
    events: [
      { ...acceptedStageTrace[0], accepted: false, nestedTools: false },
      pauseEvent,
    ],
    unstarted: allStages,
  },
  {
    id: "missing-installed-procedure",
    events: [
      { ...acceptedStageTrace[0], accepted: false, skills: false },
      pauseEvent,
    ],
    unstarted: allStages,
  },
  {
    id: "identity-drift",
    events: [
      ...throughStage("readiness"),
      {
        step: "guard:implement",
        accepted: false,
        current: true,
        sameTarget: false,
      },
      pauseEvent,
    ],
    unstarted: ["implement", "verify", "finalize"],
  },
  {
    id: "incomplete-groom-report",
    events: [
      ...throughStage("prepare"),
      { ...acceptedStageTrace[1], accepted: false, complete: false },
      pauseEvent,
    ],
    unstarted: ["implement", "verify", "finalize"],
  },
  {
    id: "verification-warning",
    events: [
      ...throughStage("guard:verify"),
      { ...acceptedStageTrace[6], accepted: false, warning: 1 },
      pauseEvent,
    ],
    unstarted: ["finalize"],
  },
];

function assertIllustrativeStageTrace(fixture) {
  const { events } = fixture;
  const seen = new Map();
  assert.equal(events[0].step, "prepare");
  for (const [index, event] of events.entries()) {
    const next = events[index + 1];
    if (event.step === "pause") {
      assert.equal(
        index,
        events.length - 1,
        "a pause leaves dependents unstarted",
      );
      continue;
    }
    assert.ok(
      acceptedStageTrace.some(({ step }) => step === event.step) ||
        ["refresh:readiness", "refresh:implement"].includes(event.step),
      `unknown or later-group operation: ${event.step}`,
    );
    if (event.accepted === false) {
      const refresh = {
        "guard:implement": "refresh:readiness",
        "guard:verify": "refresh:implement",
      }[event.step];
      assert.ok(
        next?.step === "pause" ||
          (refresh &&
            !event.current &&
            event.sameTarget &&
            next?.step === refresh),
        "missing/stale/blocked evidence cannot release a dependent stage",
      );
    }
    if (event.humanInput) {
      for (const field of Object.keys(humanQuestion))
        assert.ok(event.humanInput[field], field);
      assert.equal(event.accepted, false);
      assert.equal(next?.step, "pause", "a question is not its answer");
    }
    if (event.step === "prepare" && event.accepted) {
      assert.ok(event.nestedTools && event.depth && event.skills);
    }
    if (event.step === "groom") {
      assert.equal(seen.get("prepare")?.accepted, true);
      if (event.accepted)
        assert.ok(event.complete && event.fresh && event.critical === 0);
    }
    if (["readiness", "refresh:readiness"].includes(event.step)) {
      assert.equal(seen.get("groom")?.accepted, true);
      if (event.accepted) {
        assert.ok(event.structuralValidation && event.dispositionsComplete);
        assert.equal(event.unresolvedDecision, false);
      }
    }
    if (event.step.startsWith("guard:") && event.accepted) {
      const predecessor =
        event.step === "guard:implement" ? "readiness" : "implement";
      assert.equal(seen.get(predecessor)?.accepted, true);
      assert.ok(event.current && event.sameTarget && !event.missingReport);
    }
    if (event.step.startsWith("refresh:")) {
      const stage = event.step.split(":")[1];
      const guard = stage === "readiness" ? "guard:implement" : "guard:verify";
      assert.equal(seen.get(guard)?.current, false);
      assert.equal(event.accepted, true);
    }
    if (["implement", "refresh:implement"].includes(event.step)) {
      if (event.step === "implement") {
        assert.equal(seen.get("guard:implement")?.accepted, true);
        assert.equal(seen.get("readiness")?.accepted, true);
      }
      if (event.accepted) {
        assert.ok(
          event.tasksComplete &&
            event.independentDiffChecks &&
            event.integratedChecks,
        );
        assert.ok(event.freshApplyStatus && event.serializedBookkeeping);
      }
    }
    if (event.step === "verify") {
      assert.equal(seen.get("implement")?.accepted, true);
      assert.equal(seen.get("guard:verify")?.accepted, true);
      if (event.accepted) {
        assert.ok(event.complete && event.fresh && event.requiredChecks);
        assert.equal(event.critical, 0);
        assert.equal(event.warning, 0);
        assert.ok(Array.isArray(event.skippedOptional));
      }
    }
    seen.set(event.step.replace("refresh:", ""), event);
  }
  const started = new Set(events.map(({ step }) => step));
  assert.deepEqual(
    fixture.unstarted,
    allStages.filter((stage) => !started.has(stage)),
  );
  assert.ok(
    !started.has("finalize"),
    "stage-only examples do not establish finalization",
  );
}

function documentedStageTraces() {
  const reference = readFileSync(
    join(repoRoot, "skills/orc-openspec-all/references/pseudocode.md"),
    "utf8",
  );
  const stageSection = reference
    .split("## Model-free stage traces\n")[1]
    ?.split("\n## ")[0];
  assert.ok(stageSection, "the stage-only examples must remain documented");
  return new Map(
    [
      ...stageSection.matchAll(
        /^\| ([a-z][a-z-]+) \| ([^|]+) \| ([^|]+) \|$/gm,
      ),
    ].map(([, id, trace, unstarted]) => [
      id,
      {
        steps: trace.trim().split(" → "),
        unstarted: unstarted.trim().split(", "),
      },
    ]),
  );
}

test("lifecycle preparation/stage fixtures match documented traces and acceptance boundaries", async (t) => {
  const documented = documentedStageTraces();
  assert.deepEqual(
    [...documented.keys()],
    lifecycleStageFixtures.map(({ id }) => id),
  );
  for (const fixture of lifecycleStageFixtures) {
    await t.test(fixture.id, () => {
      assert.deepEqual(documented.get(fixture.id), {
        steps: fixture.events.map(({ step }) => step),
        unstarted: fixture.unstarted,
      });
      assertIllustrativeStageTrace(fixture);
    });
  }
});

test("illustrative trace checks reject unsupported acceptance, not only missing keywords", () => {
  const forged = (mutate) => {
    const fixture = structuredClone(lifecycleStageFixtures[0]);
    mutate(fixture);
    assert.throws(() => assertIllustrativeStageTrace(fixture));
  };
  forged(({ events }) => events.splice(1, 1)); // missing predecessor
  forged(({ events }) => {
    [events[4], events[6]] = [events[6], events[4]];
  }); // wrong order
  forged(({ events }) => {
    events[3].current = false;
  }); // stale without refresh
  forged(({ events }) => {
    events[0].nestedTools = false;
  }); // parent tools alone
  forged(({ events }) => {
    events[0].depth = false;
  }); // unsupported nesting
  forged(({ events }) => {
    events[0].skills = false;
  }); // invented dependency
  forged(({ events }) => {
    events[2].unresolvedDecision = true;
  }); // Major decision
  forged(({ events }) => {
    events[4].humanInput = humanQuestion;
  }); // supplied no answer
  forged(({ events }) => {
    events[4].independentDiffChecks = false;
  }); // summary only
  forged(({ events }) => {
    events[4].integratedChecks = false;
  }); // missing required gate
  forged(({ events }) => {
    events[6].warning = 1;
  }); // task completion is not verification
  forged(({ events }) => {
    events[6].complete = false;
  }); // absent findings not a full report
  forged(({ events }) => events.push({ step: "finalize", accepted: true })); // not stage-only evidence
});

// First-run finalization examples only. These assert declared receipts and trace
// consistency; they never merge specs, move files or implement an orchestrator.
const finalizationSteps = [
  "preflight",
  "assessment",
  "rules",
  "sync",
  "comparison",
  "archive",
  "confirmation",
  "report",
];
const selectedDeltas = ["specs/accounts/spec.md", "specs/billing/spec.md"];
const changeInventory = [".openspec.yaml", "tasks.md", ...selectedDeltas];
const successfulFinalization = {
  predecessors: acceptedStageTrace,
  guard: { accepted: true, current: true, sameTarget: true },
  archiveInputs: "valid",
  preflight: { artifactsComplete: true, tasksComplete: true },
  inventory: selectedDeltas,
  assessment: { state: "needed", capabilities: [...selectedDeltas] },
  choice: "Sync now",
  rules: { lookups: 1, exitCode: 0, validJSON: true, snapshot: "rules-1" },
  sync: {
    attempted: true,
    completed: true,
    synchronous: true,
    snapshot: "rules-1",
    writes: ["accounts", "billing"],
  },
  comparison: {
    accepted: true,
    capabilities: [...selectedDeltas],
    intendedEffects: ["ADDED", "MODIFIED", "REMOVED", "RENAMED"],
    unaffectedScenarios: true,
    purposeAndStructure: true,
  },
  move: {
    attempted: true,
    collision: false,
    succeeded: true,
    sourceInventory: changeInventory,
    sourceContentIdentity: "change-content-1",
  },
  confirmation: {
    sameTarget: true,
    sourceAbsent: true,
    destinationInventory: changeInventory,
    destinationContentIdentity: "change-content-1",
  },
  events: finalizationSteps,
  syncAcceptance: "accepted",
  archive: "confirmed",
  lifecycleComplete: true,
};
const noSync = { attempted: false, writes: [] };
const noMove = { attempted: false };
const noRules = { lookups: 0 };
const pausedFinalization = {
  comparison: null,
  move: noMove,
  confirmation: null,
  archive: "unstarted",
  lifecycleComplete: false,
};
const beforeSyncPause = {
  ...pausedFinalization,
  sync: noSync,
  syncAcceptance: "unstarted",
};
const finalizationFixture = (id, overrides = {}) =>
  structuredClone({ ...successfulFinalization, id, ...overrides });
const finalizationFixtures = [
  finalizationFixture("sync-success"),
  finalizationFixture("optional-archive-inputs-unavailable", {
    archiveInputs: "unavailable",
  }),
  finalizationFixture("valid-specs-without-rules", {
    rules: { ...successfulFinalization.rules, omittedRules: true },
  }),
  finalizationFixture("already-synced", {
    assessment: { state: "already-synced", capabilities: selectedDeltas },
    choice: "Archive now",
    rules: noRules,
    sync: noSync,
    comparison: null,
    events: ["preflight", "assessment", "archive", "confirmation", "report"],
    syncAcceptance: "already-synced",
  }),
  finalizationFixture("no-delta-specs", {
    preflight: {
      artifactsComplete: true,
      tasksComplete: true,
      specsSkipped: true,
    },
    inventory: [],
    assessment: { state: "no-delta", capabilities: [] },
    choice: null,
    rules: noRules,
    sync: noSync,
    comparison: null,
    events: ["preflight", "assessment", "archive", "confirmation", "report"],
    syncAcceptance: "not-applicable",
  }),
  ...["artifacts", "tasks"].map((kind) =>
    finalizationFixture(`incomplete-${kind}`, {
      ...beforeSyncPause,
      preflight: {
        artifactsComplete: kind !== "artifacts",
        tasksComplete: kind !== "tasks",
      },
      assessment: null,
      rules: noRules,
      events: ["preflight", "pause"],
    }),
  ),
  ...["failed", "invalid"].map((kind) =>
    finalizationFixture(`${kind}-specs-instructions`, {
      ...beforeSyncPause,
      rules: {
        lookups: 1,
        exitCode: kind === "failed" ? 1 : 0,
        validJSON: kind !== "invalid",
      },
      events: ["preflight", "assessment", "rules", "pause"],
    }),
  ),
  finalizationFixture("sync-failed", {
    ...pausedFinalization,
    sync: {
      ...successfulFinalization.sync,
      completed: false,
      writes: ["accounts"],
    },
    events: ["preflight", "assessment", "rules", "sync", "pause"],
    syncAcceptance: "rejected",
  }),
  finalizationFixture("rejected-comparison", {
    ...pausedFinalization,
    comparison: {
      ...successfulFinalization.comparison,
      accepted: false,
      differences: ["billing: intended MODIFIED scenario absent"],
    },
    events: ["preflight", "assessment", "rules", "sync", "comparison", "pause"],
    syncAcceptance: "rejected",
  }),
  ...["collision", "failed"].map((kind) =>
    finalizationFixture(`archive-${kind}`, {
      move: {
        ...successfulFinalization.move,
        collision: kind === "collision",
        succeeded: false,
      },
      confirmation: null,
      events: [
        "preflight",
        "assessment",
        "rules",
        "sync",
        "comparison",
        "archive",
        "pause",
      ],
      archive: kind === "collision" ? "blocked" : "failed",
      lifecycleComplete: false,
    }),
  ),
  finalizationFixture("moved-unconfirmed", {
    confirmation: {
      ...successfulFinalization.confirmation,
      sourceAbsent: false,
    },
    events: [
      "preflight",
      "assessment",
      "rules",
      "sync",
      "comparison",
      "archive",
      "confirmation",
      "pause",
    ],
    archive: "moved-unconfirmed",
    lifecycleComplete: false,
  }),
  finalizationFixture("needed-sync-skipped", {
    ...beforeSyncPause,
    choice: "Archive without syncing",
    rules: noRules,
    events: ["preflight", "assessment", "pause"],
    syncAcceptance: "rejected",
  }),
];

function assertIllustrativeFinalizationTrace(fixture) {
  assertIllustrativeStageTrace({
    events: fixture.predecessors,
    unstarted: ["finalize"],
  });
  assert.equal(
    fixture.predecessors.at(-1).accepted,
    true,
    "verification required",
  );
  assert.ok(
    fixture.guard.accepted && fixture.guard.current && fixture.guard.sameTarget,
  );
  assert.ok(["valid", "unavailable"].includes(fixture.archiveInputs));
  const { events } = fixture;
  assert.equal(events[0], "preflight");
  assert.equal(new Set(events).size, events.length, "no automatic replay");
  for (const [index, step] of events.entries()) {
    if (step === "pause") {
      assert.equal(index, events.length - 1);
      assert.equal(fixture.lifecycleComplete, false);
    } else {
      assert.ok(
        finalizationSteps.includes(step),
        `unsupported operation: ${step}`,
      );
      if (index > 0)
        assert.ok(
          finalizationSteps.indexOf(events[index - 1]) <
            finalizationSteps.indexOf(step),
        );
    }
  }
  const has = (step) => events.includes(step);
  if (
    !fixture.preflight.artifactsComplete ||
    !fixture.preflight.tasksComplete
  ) {
    assert.deepEqual(
      events,
      ["preflight", "pause"],
      "invocation does not answer warnings",
    );
    assert.equal(fixture.syncAcceptance, "unstarted");
  } else {
    assert.ok(has("assessment"));
    assert.deepEqual(
      fixture.assessment.capabilities,
      fixture.inventory,
      "authoritative full inventory",
    );
    if (fixture.assessment.state === "no-delta") {
      assert.deepEqual(fixture.inventory, []);
      assert.equal(fixture.syncAcceptance, "not-applicable");
    } else if (fixture.assessment.state === "already-synced") {
      assert.ok(fixture.inventory.length);
      assert.equal(fixture.choice, "Archive now");
      assert.equal(fixture.syncAcceptance, "already-synced");
    } else {
      assert.equal(fixture.assessment.state, "needed");
      assert.ok(fixture.inventory.length);
      if (fixture.choice !== "Sync now") {
        assert.equal(fixture.choice, "Archive without syncing");
        assert.deepEqual(events, ["preflight", "assessment", "pause"]);
        assert.equal(fixture.syncAcceptance, "rejected");
      } else {
        assert.ok(has("rules"), "snapshot before writes");
        assert.equal(fixture.rules.lookups, 1, "inline sync never refetches");
        if (fixture.rules.exitCode !== 0 || !fixture.rules.validJSON) {
          assert.deepEqual(events, [
            "preflight",
            "assessment",
            "rules",
            "pause",
          ]);
          assert.equal(fixture.syncAcceptance, "unstarted");
        } else {
          assert.ok(has("sync"));
          assert.ok(
            fixture.sync.attempted && fixture.sync.synchronous,
            "wait before comparison/move",
          );
          assert.ok(fixture.rules.snapshot);
          assert.equal(fixture.sync.snapshot, fixture.rules.snapshot);
          if (!fixture.sync.completed) {
            assert.equal(has("comparison"), false);
            assert.equal(events.at(-1), "pause");
            assert.equal(fixture.syncAcceptance, "rejected");
          } else {
            assert.ok(has("comparison"), "worker summary is not acceptance");
            assert.deepEqual(
              fixture.comparison.capabilities,
              fixture.inventory,
            );
            if (fixture.comparison.accepted) {
              assert.deepEqual(fixture.comparison.intendedEffects, [
                "ADDED",
                "MODIFIED",
                "REMOVED",
                "RENAMED",
              ]);
              assert.ok(
                fixture.comparison.unaffectedScenarios &&
                  fixture.comparison.purposeAndStructure,
              );
              assert.equal(fixture.syncAcceptance, "accepted");
            } else {
              assert.ok(fixture.comparison.differences.length);
              assert.equal(fixture.syncAcceptance, "rejected");
              assert.equal(events.at(-1), "pause");
            }
          }
        }
      }
    }
  }
  if (["no-delta", "already-synced"].includes(fixture.assessment?.state)) {
    for (const step of ["rules", "sync", "comparison"])
      assert.equal(has(step), false);
  }
  if (!has("rules")) assert.equal(fixture.rules.lookups, 0);
  if (!has("sync")) {
    assert.equal(fixture.sync.attempted, false);
    assert.deepEqual(
      fixture.sync.writes,
      [],
      "no spec writes on no-sync/preflight paths",
    );
  }
  if (!has("comparison")) assert.equal(fixture.comparison, null);
  if (has("archive")) {
    assert.ok(
      ["accepted", "already-synced", "not-applicable"].includes(
        fixture.syncAcceptance,
      ),
    );
    assert.ok(fixture.move.attempted);
    assert.ok(fixture.move.sourceInventory.includes(".openspec.yaml"));
    assert.ok(fixture.move.sourceContentIdentity);
    if (fixture.move.collision || !fixture.move.succeeded) {
      assert.equal(has("confirmation"), false);
      assert.equal(events.at(-1), "pause");
      assert.equal(
        fixture.archive,
        fixture.move.collision ? "blocked" : "failed",
      );
    } else {
      assert.ok(has("confirmation"), "move summary is not whole archival");
      const confirmation = fixture.confirmation;
      const confirmed =
        confirmation.sameTarget &&
        confirmation.sourceAbsent &&
        JSON.stringify(confirmation.destinationInventory) ===
          JSON.stringify(fixture.move.sourceInventory) &&
        confirmation.destinationContentIdentity ===
          fixture.move.sourceContentIdentity;
      assert.equal(
        fixture.archive,
        confirmed ? "confirmed" : "moved-unconfirmed",
      );
      assert.equal(events.at(-1), confirmed ? "report" : "pause");
    }
  } else {
    assert.equal(fixture.move.attempted, false);
    assert.equal(fixture.archive, "unstarted");
    assert.equal(events.at(-1), "pause");
  }
  if (!has("confirmation")) assert.equal(fixture.confirmation, null);
  assert.equal(fixture.lifecycleComplete, fixture.archive === "confirmed");
}

function documentedFinalizationTraces() {
  const reference = readFileSync(
    join(repoRoot, "skills/orc-openspec-all/references/pseudocode.md"),
    "utf8",
  );
  const section = reference
    .split("## Model-free finalization traces\n")[1]
    ?.split("\n## ")[0];
  assert.ok(section);
  return new Map(
    [
      ...section.matchAll(
        /^\| ([a-z][a-z-]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (yes|no) \|$/gm,
      ),
    ].map(([, id, trace, syncAcceptance, archive, complete]) => [
      id,
      {
        events: trace.trim().split(" → "),
        syncAcceptance: syncAcceptance.trim(),
        archive: archive.trim(),
        lifecycleComplete: complete === "yes",
      },
    ]),
  );
}

test("lifecycle finalization fixtures match built-in evidence and documented traces", async (t) => {
  const documented = documentedFinalizationTraces();
  assert.deepEqual(
    [...documented.keys()],
    finalizationFixtures.map(({ id }) => id),
  );
  for (const fixture of finalizationFixtures) {
    await t.test(fixture.id, () => {
      const { events, syncAcceptance, archive, lifecycleComplete } = fixture;
      assert.deepEqual(documented.get(fixture.id), {
        events,
        syncAcceptance,
        archive,
        lifecycleComplete,
      });
      assertIllustrativeFinalizationTrace(fixture);
    });
  }
});

test("finalization contracts reject unsupported sync/archive and publication claims", () => {
  const forged = (mutate, index = 0) => {
    const fixture = structuredClone(finalizationFixtures[index]);
    mutate(fixture);
    assert.throws(() => assertIllustrativeFinalizationTrace(fixture));
  };
  forged((f) => {
    f.predecessors.at(-1).warning = 1;
  });
  forged((f) => {
    f.guard.current = false;
  });
  forged((f) => {
    f.guard.sameTarget = false;
  });
  forged((f) => {
    f.preflight.tasksComplete = false;
  });
  forged((f) => {
    f.rules.validJSON = false;
  });
  forged((f) => {
    f.rules.lookups = 2;
  });
  forged((f) => {
    f.sync.snapshot = "replacement-rules";
  });
  forged((f) => {
    f.sync.synchronous = false;
  });
  forged((f) => {
    f.events.splice(f.events.indexOf("comparison"), 1);
  });
  forged((f) => {
    f.comparison.capabilities.pop();
  });
  forged((f) => {
    f.comparison.capabilities.push("unselected/spec.md");
  });
  forged((f) => {
    f.comparison.unaffectedScenarios = false;
  });
  forged((f) => {
    f.move.collision = true;
  });
  forged((f) => {
    f.confirmation.destinationInventory = ["tasks.md"];
  });
  forged((f) => {
    f.confirmation.destinationContentIdentity = "other-change";
  });
  forged((f) => {
    f.lifecycleComplete = true;
  }, finalizationFixtures.length - 1);
  for (const operation of [
    "commit",
    "push",
    "deliver-pr",
    "independent-assessor",
    "background-sync",
  ])
    forged((f) => {
      f.events.splice(5, 0, operation);
    });
});

// Explicit recovery examples describe observations/receipts and permitted work.
// They inspect no real lifecycle target and execute no recovery operation.
const recoveryEvidence = {
  request: { explicit: true, sameTarget: true, authorized: true },
  prerequisites: { tools: true, depth: true, skills: true, permissions: true },
  observations: {
    identityMatches: true,
    source: "intact",
    destination: "absent",
    sourceInventory: changeInventory,
    sourceContentIdentity: "change-content-1",
    destinationInventory: [],
    destinationContentIdentity: null,
  },
  receipts: {
    predecessors: acceptedStageTrace,
    currentVerification: true,
    sync: "accepted",
    currentSync: true,
    preMoveInventory: changeInventory,
    preMoveContentIdentity: "change-content-1",
  },
  effects: { inspectedAll: true, state: "already-synced", conflict: false },
  safeWorkPreserved: true,
  historyPreserved: true,
  events: [
    "reconcile",
    "effects",
    "guard:finalize",
    "assessment",
    "archive",
    "confirmation",
    "report",
  ],
  operations: ["archive"],
  outcome: "complete",
  confirmation: successfulFinalization.confirmation,
  unstarted: [],
};
const recoveryFixture = (id, overrides = {}) =>
  structuredClone({ ...recoveryEvidence, id, ...overrides });
const archivedObservations = {
  ...recoveryEvidence.observations,
  source: "absent",
  destination: "complete",
  sourceInventory: [],
  sourceContentIdentity: null,
  destinationInventory: changeInventory,
  destinationContentIdentity: "change-content-1",
};
const blockedRecovery = {
  events: ["reconcile", "pause"],
  operations: [],
  outcome: "blocked",
  confirmation: null,
};
const recoveryFixtures = [
  recoveryFixture("partial-sync-resume", {
    receipts: {
      ...recoveryEvidence.receipts,
      sync: "partial",
      currentSync: false,
    },
    effects: { inspectedAll: true, state: "partial", conflict: false },
    events: [
      "reconcile",
      "effects",
      "guard:finalize",
      "continue:sync",
      "comparison",
      "archive",
      "confirmation",
      "report",
    ],
    operations: ["sync-missing", "archive"],
    remainingSync: {
      onlyMissingEffects: true,
      appliedEffectsPreserved: true,
      currentSnapshot: true,
      synchronous: true,
      builtInComparison: true,
    },
  }),
  recoveryFixture("accepted-sync-failed-move-resume"),
  recoveryFixture("archived-complete-evidence", {
    observations: archivedObservations,
    events: ["reconcile", "effects", "observe", "report"],
    operations: [],
    confirmation: null,
  }),
  recoveryFixture("archived-missing-predecessor", {
    ...blockedRecovery,
    observations: archivedObservations,
    receipts: { ...recoveryEvidence.receipts, predecessors: null },
  }),
  recoveryFixture("archived-missing-sync", {
    ...blockedRecovery,
    observations: archivedObservations,
    receipts: { ...recoveryEvidence.receipts, sync: null, currentSync: false },
    events: ["reconcile", "effects", "pause"],
  }),
  recoveryFixture("active-missing-receipts", {
    receipts: {
      ...recoveryEvidence.receipts,
      predecessors: null,
      currentVerification: false,
    },
    events: ["reconcile", "refresh:stages", "report"],
    operations: ["re-establish-stages"],
    outcome: "partial",
    confirmation: null,
    unstarted: ["finalize"],
  }),
  ...[
    [
      "both-paths-present",
      {
        destination: "complete",
        destinationInventory: changeInventory,
        destinationContentIdentity: "change-content-1",
      },
    ],
    [
      "neither-path-present",
      { source: "absent", sourceInventory: [], sourceContentIdentity: null },
    ],
    [
      "incomplete-archive",
      {
        ...archivedObservations,
        destination: "incomplete",
        destinationInventory: ["tasks.md"],
      },
    ],
    ["resume-identity-drift", { identityMatches: false }],
  ].map(([id, observations]) =>
    recoveryFixture(id, {
      ...blockedRecovery,
      observations: { ...recoveryEvidence.observations, ...observations },
    }),
  ),
  recoveryFixture("stale-verification-resume", {
    receipts: { ...recoveryEvidence.receipts, currentVerification: false },
    events: [
      "reconcile",
      "effects",
      "refresh:verify",
      "guard:finalize",
      "assessment",
      "archive",
      "confirmation",
      "report",
    ],
    operations: ["reverify", "archive"],
    refreshedVerification: acceptedStageTrace.at(-1),
  }),
  recoveryFixture("missing-resume-prerequisite", {
    ...blockedRecovery,
    prerequisites: { ...recoveryEvidence.prerequisites, depth: false },
  }),
  recoveryFixture("interrupted-implementation", {
    receipts: {
      ...recoveryEvidence.receipts,
      currentVerification: false,
      predecessors: throughStage("readiness"),
    },
    events: ["reconcile", "continue:implement", "report"],
    operations: ["implement"],
    outcome: "partial",
    confirmation: null,
    unstarted: ["verify", "finalize"],
    implementationReport: {
      disposition: "interrupted",
      accepted: false,
      edits: ["implementation.ts"],
      result: null,
    },
  }),
  recoveryFixture("partial-sync-conflict", {
    ...blockedRecovery,
    receipts: {
      ...recoveryEvidence.receipts,
      sync: "partial",
      currentSync: false,
    },
    effects: { inspectedAll: true, state: "partial", conflict: true },
    events: ["reconcile", "effects", "pause"],
  }),
];

function assertIllustrativeRecovery(f) {
  const has = (step) => f.events.includes(step);
  assert.ok(f.request.explicit, "no automatic continuation");
  assert.ok(f.safeWorkPreserved && f.historyPreserved);
  assert.equal(f.events[0], "reconcile");
  assert.equal(
    new Set(f.events).size,
    f.events.length,
    "no duplicate operations",
  );
  const allowed = [
    "reconcile",
    "effects",
    "guard:finalize",
    "continue:sync",
    "comparison",
    "assessment",
    "archive",
    "confirmation",
    "observe",
    "report",
    "pause",
    "refresh:stages",
    "refresh:verify",
    "continue:implement",
  ];
  for (const step of f.events)
    assert.ok(allowed.includes(step), `unsupported operation: ${step}`);
  const canContinue =
    f.request.sameTarget &&
    f.request.authorized &&
    f.observations.identityMatches &&
    ["tools", "depth", "skills", "permissions"].every(
      (field) => f.prerequisites[field] === true,
    );
  const { source, destination } = f.observations;
  const active = source === "intact" && destination === "absent";
  const archived = source === "absent" && destination === "complete";
  if (!canContinue || (!active && !archived)) {
    assert.deepEqual(f.events, ["reconcile", "pause"]);
  }
  if (active) {
    assert.deepEqual(
      f.observations.sourceInventory,
      f.receipts.preMoveInventory,
    );
    assert.equal(
      f.observations.sourceContentIdentity,
      f.receipts.preMoveContentIdentity,
    );
  }
  if (archived && !has("pause")) {
    assert.ok(f.receipts.preMoveInventory.includes(".openspec.yaml"));
    assert.ok(f.receipts.preMoveContentIdentity);
    assert.deepEqual(
      f.observations.destinationInventory,
      f.receipts.preMoveInventory,
    );
    assert.equal(
      f.observations.destinationContentIdentity,
      f.receipts.preMoveContentIdentity,
    );
  }
  if (has("effects"))
    assert.ok(f.effects.inspectedAll, "inspect all selected deltas");
  if (f.effects.conflict && has("effects"))
    assert.equal(f.events.at(-1), "pause");
  if (has("pause")) {
    assert.equal(f.events.at(-1), "pause");
    assert.deepEqual(
      f.operations,
      [],
      "ambiguous state preserves work without writes",
    );
    assert.equal(f.outcome, "blocked");
  }
  const expectedOperations = [];
  if (has("refresh:stages")) {
    assert.ok(canContinue && active);
    assert.equal(f.receipts.predecessors, null);
    expectedOperations.push("re-establish-stages");
    assert.equal(f.outcome, "partial");
    assert.ok(f.unstarted.includes("finalize"));
  }
  if (has("continue:implement")) {
    assert.ok(canContinue && active);
    assertIllustrativeStageTrace({
      events: f.receipts.predecessors,
      unstarted: ["implement", "verify", "finalize"],
    });
    assert.equal(f.implementationReport.disposition, "interrupted");
    assert.equal(f.implementationReport.accepted, false);
    assert.equal(
      f.implementationReport.result,
      null,
      "missing child result stays missing",
    );
    assert.ok(f.implementationReport.edits.length);
    expectedOperations.push("implement");
    assert.deepEqual(f.unstarted, ["verify", "finalize"]);
    assert.equal(f.outcome, "partial");
  }
  if (has("refresh:verify")) {
    assert.equal(f.receipts.currentVerification, false);
    assert.equal(f.refreshedVerification.accepted, true);
    assert.equal(f.refreshedVerification.warning, 0);
    assert.equal(f.refreshedVerification.critical, 0);
    assert.ok(
      f.refreshedVerification.complete &&
        f.refreshedVerification.fresh &&
        f.refreshedVerification.requiredChecks,
    );
    assert.ok(
      f.events.indexOf("refresh:verify") < f.events.indexOf("guard:finalize"),
    );
    expectedOperations.push("reverify");
  }
  if (has("guard:finalize") || has("observe")) {
    assert.ok(canContinue);
    assertIllustrativeStageTrace({
      events: f.receipts.predecessors,
      unstarted: ["finalize"],
    });
    assert.equal(f.receipts.predecessors.at(-1).step, "verify");
    assert.equal(f.receipts.predecessors.at(-1).accepted, true);
    assert.ok(f.receipts.currentVerification || has("refresh:verify"));
    assert.ok(has("effects") && !f.effects.conflict);
  }
  if (has("continue:sync")) {
    assert.ok(active && has("guard:finalize"));
    assert.equal(f.effects.state, "partial");
    assert.equal(f.receipts.sync, "partial");
    for (const field of [
      "onlyMissingEffects",
      "appliedEffectsPreserved",
      "currentSnapshot",
      "synchronous",
      "builtInComparison",
    ])
      assert.equal(f.remainingSync[field], true, field);
    assert.ok(
      has("comparison") &&
        f.events.indexOf("continue:sync") < f.events.indexOf("comparison"),
    );
    expectedOperations.push("sync-missing");
  } else assert.equal(has("comparison"), false);
  if (has("archive")) {
    assert.ok(active && canContinue && has("guard:finalize"));
    if (!has("continue:sync")) {
      assert.equal(f.receipts.sync, "accepted");
      assert.ok(f.receipts.currentSync && has("assessment"));
      assert.equal(f.effects.state, "already-synced");
    }
    assert.ok(f.events.indexOf("guard:finalize") < f.events.indexOf("archive"));
    assert.ok(
      f.events.indexOf(has("continue:sync") ? "comparison" : "assessment") <
        f.events.indexOf("archive"),
    );
    assert.ok(
      has("confirmation") &&
        f.events.indexOf("archive") < f.events.indexOf("confirmation"),
    );
    assert.ok(f.confirmation.sourceAbsent && f.confirmation.sameTarget);
    assert.deepEqual(
      f.confirmation.destinationInventory,
      f.receipts.preMoveInventory,
    );
    assert.equal(
      f.confirmation.destinationContentIdentity,
      f.receipts.preMoveContentIdentity,
    );
    expectedOperations.push("archive");
  } else {
    assert.equal(has("confirmation"), false);
    assert.equal(f.confirmation, null);
  }
  if (has("observe")) {
    assert.ok(archived && !has("archive"));
    assert.ok(f.receipts.currentSync);
    assert.ok(
      ["accepted", "already-synced", "not-applicable"].includes(
        f.receipts.sync,
      ),
    );
    assert.equal(
      f.effects.state,
      f.receipts.sync === "not-applicable" ? "no-delta" : "already-synced",
      "retained sync receipt must still match all current effects",
    );
    assert.deepEqual(f.events, ["reconcile", "effects", "observe", "report"]);
  }
  assert.deepEqual(f.operations, expectedOperations);
  assert.equal(f.outcome === "complete", has("observe") || has("confirmation"));
  if (!has("pause")) assert.equal(f.events.at(-1), "report");
}

function documentedRecoveryTraces() {
  const reference = readFileSync(
    join(repoRoot, "skills/orc-openspec-all/references/pseudocode.md"),
    "utf8",
  );
  const section = reference.split("## Model-free recovery traces\n")[1];
  assert.ok(section);
  return new Map(
    [
      ...section.matchAll(
        /^\| ([a-z][a-z-]+) \| ([^|]+) \| ([^|]+) \| (complete|blocked|partial) \|$/gm,
      ),
    ].map(([, id, trace, operations, outcome]) => [
      id,
      {
        events: trace.trim().split(" → "),
        operations:
          operations.trim() === "none" ? [] : operations.trim().split(", "),
        outcome,
      },
    ]),
  );
}

test("explicit lifecycle recovery fixtures match observed-state and remaining-work contracts", async (t) => {
  const documented = documentedRecoveryTraces();
  assert.deepEqual(
    [...documented.keys()],
    recoveryFixtures.map(({ id }) => id),
  );
  for (const fixture of recoveryFixtures)
    await t.test(fixture.id, () => {
      const { events, operations, outcome } = fixture;
      assert.deepEqual(documented.get(fixture.id), {
        events,
        operations,
        outcome,
      });
      assertIllustrativeRecovery(fixture);
    });
});

test("recovery contracts reject inferred completion, unsafe replay and lost evidence", () => {
  const forged = (id, mutate) => {
    const fixture = structuredClone(recoveryFixtures.find((f) => f.id === id));
    mutate(fixture);
    assert.throws(() => assertIllustrativeRecovery(fixture));
  };
  const archived = (mutate) => forged("archived-complete-evidence", mutate);
  archived((f) => {
    f.receipts.predecessors = null;
  });
  archived((f) => {
    f.receipts.currentVerification = false;
  });
  archived((f) => {
    f.receipts.sync = null;
  });
  archived((f) => {
    f.observations.destinationInventory = ["tasks.md"];
  });
  archived((f) => {
    f.observations.destinationContentIdentity = "wrong-change";
  });
  archived((f) => {
    f.observations.source = "intact";
  });
  archived((f) => {
    f.request.explicit = false;
  });
  archived((f) => {
    f.request.sameTarget = false;
  });
  archived((f) => {
    f.request.authorized = false;
  });
  archived((f) => {
    f.prerequisites = {};
  });
  archived((f) => {
    f.effects.inspectedAll = false;
  });
  archived((f) => {
    f.effects.state = "partial";
  });
  archived((f) => {
    f.historyPreserved = false;
  });
  for (const field of ["tools", "depth", "skills", "permissions"])
    archived((f) => {
      f.prerequisites[field] = false;
    });
  forged("partial-sync-resume", (f) => {
    delete f.remainingSync.onlyMissingEffects;
  });
  forged("partial-sync-resume", (f) => {
    f.remainingSync.appliedEffectsPreserved = false;
  });
  forged("partial-sync-resume", (f) => {
    f.remainingSync.synchronous = false;
  });
  forged("partial-sync-resume", (f) => {
    f.remainingSync.currentSnapshot = false;
  });
  forged("partial-sync-resume", (f) => {
    f.remainingSync.builtInComparison = false;
  });
  forged("accepted-sync-failed-move-resume", (f) => {
    f.receipts.currentSync = false;
  });
  forged("stale-verification-resume", (f) => {
    f.refreshedVerification.warning = 1;
  });
  forged("both-paths-present", (f) => {
    f.outcome = "complete";
  });
  forged("interrupted-implementation", (f) => {
    f.implementationReport.accepted = true;
  });
  for (const step of [
    "replay-all",
    "reset-budget",
    "rollback",
    "reopen",
    "alternate-name",
    "active-change-invocation",
    "independent-assessor",
    "push",
    "archive",
  ])
    archived((f) => {
      f.events.splice(2, 0, step);
    });
});

// #49 route/package examples reuse illustrative built-in receipts above, not
// orc-openspec-all as a runtime dependency. No dispatch or publication occurs.
const issueArchiveInventory = [
  ".openspec.yaml",
  "proposal.md",
  "design.md",
  "tasks.md",
  ...selectedDeltas,
];
const issueDeliveryPackage = {
  code: ["src/accounts.ts"],
  mainSpecs: [
    "openspec/specs/accounts/spec.md",
    "openspec/specs/billing/spec.md",
  ],
  archive: issueArchiveInventory.map(
    (path) => `openspec/changes/archive/2026-10-06-accounts/${path}`,
  ),
  activeDeletions: issueArchiveInventory.map(
    (path) => `openspec/changes/accounts/${path}`,
  ),
};
function issuePackageFor(finalization) {
  const contents = structuredClone(issueDeliveryPackage);
  if (finalization.syncAcceptance === "not-applicable") {
    contents.mainSpecs = [];
    for (const category of ["archive", "activeDeletions"])
      contents[category] = contents[category].filter(
        (path) => !selectedDeltas.some((delta) => path.endsWith(`/${delta}`)),
      );
  }
  return contents;
}
const issueRoutePrerequisites = {
  archiveSkill: true,
  syncSkill: true,
  nestedTools: true,
  workflowOptIn: true,
  depth: true,
  sameAuthorizedRepository: true,
};
const issueRouteSuccess = [
  "prepare",
  "verify",
  "finalize",
  "inspect-package",
  "deliver",
];
function issueRouteFixture(
  id,
  finalizationId = "sync-success",
  overrides = {},
) {
  const finalization = structuredClone(
    finalizationFixtures.find((f) => f.id === finalizationId),
  );
  const inventory = issueArchiveInventory.filter(
    (path) =>
      finalization.inventory.length > 0 || !selectedDeltas.includes(path),
  );
  if (finalization.move.attempted)
    finalization.move.sourceInventory = [...inventory];
  if (finalization.confirmation)
    finalization.confirmation.destinationInventory = [...inventory];
  const ready = finalization.lifecycleComplete;
  return structuredClone({
    id,
    prerequisites: issueRoutePrerequisites,
    finalization,
    expectedPackage: issuePackageFor(finalization),
    inspection: {
      independent: true,
      staged: issuePackageFor(finalization),
      outgoing: issuePackageFor(finalization),
      contentMatches: true,
      unrelatedPaths: [],
      baselineOwnershipChecked: true,
    },
    policy: {
      signed: true,
      dco: true,
      forcePush: false,
      branch: "issue-49",
      worktreeBasename: "issue-49",
      prHead: "issue-49",
      prBase: "develop",
      closingIssue: 49,
      currentDevelopReconciled: true,
      requiredChecks: true,
      deliveredHead: "head-1",
      reviewedHead: "head-1",
      gateHead: "head-1",
    },
    events: ready
      ? issueRouteSuccess
      : ["prepare", "verify", "finalize", "pause"],
    deliveryAllowed: ready,
    ...overrides,
  });
}
const issueRouteFixtures = [
  ...[
    "sync-success",
    "already-synced",
    "no-delta-specs",
    "optional-archive-inputs-unavailable",
  ].map((id) => issueRouteFixture(id, id)),
  ...[
    ["missing-archive-procedure", "archiveSkill"],
    ["missing-sync-procedure", "syncSkill"],
    ["missing-nested-tools", "nestedTools"],
    ["missing-workflow-opt-in", "workflowOptIn"],
    ["incompatible-depth", "depth"],
    ["external-store-delivery-mismatch", "sameAuthorizedRepository"],
  ].map(([id, field]) =>
    issueRouteFixture(id, "sync-success", {
      prerequisites: { ...issueRoutePrerequisites, [field]: false },
      finalization: null,
      events: ["prepare", "pause"],
      deliveryAllowed: false,
    }),
  ),
  ...[
    "incomplete-artifacts",
    "incomplete-tasks",
    "failed-specs-instructions",
    "invalid-specs-instructions",
    "rejected-comparison",
    "sync-failed",
    "archive-collision",
    "archive-failed",
    "moved-unconfirmed",
    "needed-sync-skipped",
  ].map((id) => issueRouteFixture(id, id)),
  ...["outgoing-archive-omitted", "unrelated-outgoing-content"].map((id) => {
    const fixture = issueRouteFixture(id, "sync-success", {
      events: ["prepare", "verify", "finalize", "inspect-package", "pause"],
      deliveryAllowed: false,
    });
    if (id === "outgoing-archive-omitted")
      fixture.inspection.outgoing.archive.pop();
    else fixture.inspection.unrelatedPaths.push("user-unrelated.txt");
    return fixture;
  }),
];

function assertIllustrativeIssueRoute(f) {
  assert.equal(f.events[0], "prepare");
  const prerequisites = Object.keys(issueRoutePrerequisites).every(
    (field) => f.prerequisites[field] === true,
  );
  if (!prerequisites) {
    assert.deepEqual(f.events, ["prepare", "pause"]);
    assert.equal(f.finalization, null, "pause before write-capable dispatch");
    assert.equal(f.deliveryAllowed, false);
    return;
  }
  assertIllustrativeFinalizationTrace(f.finalization);
  if (!f.finalization.lifecycleComplete) {
    assert.deepEqual(f.events, ["prepare", "verify", "finalize", "pause"]);
    assert.equal(f.deliveryAllowed, false, "archive gates Deliver");
    return;
  }
  const inventory = issueArchiveInventory.filter(
    (path) =>
      f.finalization.inventory.length > 0 || !selectedDeltas.includes(path),
  );
  assert.deepEqual(f.finalization.move.sourceInventory, inventory);
  assert.deepEqual(f.finalization.confirmation.destinationInventory, inventory);
  const expected = issuePackageFor(f.finalization);
  assert.deepEqual(f.expectedPackage, expected);
  const inspection = f.inspection;
  const matching =
    inspection.independent &&
    inspection.contentMatches &&
    inspection.baselineOwnershipChecked &&
    inspection.unrelatedPaths.length === 0 &&
    JSON.stringify(inspection.staged) === JSON.stringify(expected) &&
    JSON.stringify(inspection.outgoing) === JSON.stringify(expected);
  if (!matching) {
    assert.deepEqual(f.events, [
      "prepare",
      "verify",
      "finalize",
      "inspect-package",
      "pause",
    ]);
    assert.equal(f.deliveryAllowed, false);
    return;
  }
  assert.deepEqual(f.events, issueRouteSuccess);
  const p = f.policy;
  assert.ok(p.signed && p.dco && !p.forcePush);
  assert.equal(p.branch, "issue-49");
  assert.equal(p.worktreeBasename, p.branch);
  assert.equal(p.prHead, p.branch);
  assert.equal(p.prBase, "develop");
  assert.equal(p.closingIssue, 49);
  assert.ok(p.currentDevelopReconciled && p.requiredChecks);
  for (const head of [p.deliveredHead, p.reviewedHead, p.gateHead])
    assert.ok(typeof head === "string" && head.length > 0);
  assert.equal(p.reviewedHead, p.deliveredHead);
  assert.equal(p.gateHead, p.deliveredHead);
  assert.equal(f.deliveryAllowed, true);
}

test("OpenSpec issue route fixtures require confirmed archive and authorized outgoing package", async (t) => {
  const reference = readFileSync(
    join(
      repoRoot,
      "skills/orc-issue-to-pr/references/openspec-finalization.md",
    ),
    "utf8",
  );
  const documented = new Map(
    [
      ...reference.matchAll(/^\| ([a-z][a-z-]+) \| ([^|]+) \| (yes|no) \|$/gm),
    ].map(([, id, trace, allowed]) => [
      id,
      { events: trace.trim().split(" → "), deliveryAllowed: allowed === "yes" },
    ]),
  );
  assert.deepEqual(
    [...documented.keys()],
    issueRouteFixtures.map((f) => f.id),
  );
  for (const fixture of issueRouteFixtures)
    await t.test(fixture.id, () => {
      assert.deepEqual(documented.get(fixture.id), {
        events: fixture.events,
        deliveryAllowed: fixture.deliveryAllowed,
      });
      assertIllustrativeIssueRoute(fixture);
    });
});

test("issue route contracts reject forged readiness, partial content and relaxed delivery policy", () => {
  const forged = (mutate, id = "sync-success") => {
    const fixture = structuredClone(
      issueRouteFixtures.find((f) => f.id === id),
    );
    mutate(fixture);
    assert.throws(() => assertIllustrativeIssueRoute(fixture));
  };
  for (const field of Object.keys(issueRoutePrerequisites))
    forged((f) => {
      f.prerequisites[field] = false;
    });
  forged((f) => {
    f.prerequisites = {};
  });
  forged((f) => {
    f.finalization.predecessors.at(-1).warning = 1;
  });
  forged((f) => {
    f.finalization.comparison.capabilities.pop();
  });
  forged((f) => {
    f.finalization.confirmation.sourceAbsent = false;
  });
  forged((f) => {
    f.finalization.confirmation.destinationInventory.pop();
  });
  forged((f) => {
    f.inspection.independent = false;
  });
  forged((f) => {
    f.inspection.contentMatches = false;
  });
  forged((f) => {
    f.inspection.baselineOwnershipChecked = false;
  });
  for (const category of Object.keys(issueDeliveryPackage)) {
    forged((f) => {
      f.inspection.staged[category].pop();
    });
    forged((f) => {
      f.inspection.outgoing[category].pop();
    });
  }
  forged((f) => {
    f.inspection.unrelatedPaths.push("unowned.txt");
  });
  forged((f) => {
    f.policy.signed = false;
  });
  forged((f) => {
    f.policy.dco = false;
  });
  forged((f) => {
    f.policy.forcePush = true;
  });
  forged((f) => {
    f.policy.branch = "issues-48-49";
  });
  forged((f) => {
    f.policy.worktreeBasename = "other-worktree";
  });
  forged((f) => {
    f.policy.prBase = "main";
  });
  forged((f) => {
    f.policy.currentDevelopReconciled = false;
  });
  forged((f) => {
    f.policy.requiredChecks = false;
  });
  forged((f) => {
    f.policy.gateHead = "stale-head";
  });
  forged((f) => {
    f.policy.reviewedHead = "stale-head";
  });
  forged((f) => {
    f.policy.deliveredHead = "";
    f.policy.reviewedHead = "";
    f.policy.gateHead = "";
  });
  for (const id of [
    "needed-sync-skipped",
    "moved-unconfirmed",
    "external-store-delivery-mismatch",
  ])
    forged((f) => {
      f.deliveryAllowed = true;
    }, id);
});

// Archived-repair receipts are declarative examples, not a repair workflow.
// No fixture calls code-review, active-change CLI, git or an agent.
const archivedSources = {
  target: "accounts",
  schema: "spec-driven",
  planningRoot: "workspace",
  store: null,
  archivePath: "openspec/changes/archive/2026-10-06-accounts",
  inventory: issueArchiveInventory,
  mainSpecs: issueDeliveryPackage.mainSpecs,
  issue: "issue-49",
  approvedIntent: "Correct account behavior under the approved scenarios",
};
const archiveSourcePaths = [
  ...issueDeliveryPackage.archive,
  ...archivedSources.mainSpecs,
];
const correctionTrace = [
  "prepare",
  "review",
  "judge",
  "reserve",
  "repair",
  "validate",
  "deliver",
  "fresh-review",
  "final-gates",
];
const archivedDocumentDispositions = [
  ...issueDeliveryPackage.archive.filter((path) => !path.endsWith(".yaml")),
  ...archivedSources.mainSpecs,
].map((path) => ({
  path,
  disposition: "unchanged",
  evidence: "Already expresses the approved correction; actual code inspected",
}));
function archivedRepairFixture(id, overrides = {}) {
  return structuredClone({
    id,
    context: archivedSources,
    sourceEvidence: {
      sameTarget: true,
      sourceAbsent: true,
      completeInventory: true,
      archivePresent: true,
      mainSpecsPresent: true,
      branchAndOutgoingInspected: true,
      currentContentsReconciled: true,
      trackerReady: true,
    },
    coverage: { limited: false, authorization: null, omitted: [] },
    review: {
      fullDiff: true,
      fresh: true,
      activeChangeCommands: [],
      sources: archiveSourcePaths,
      priorFindings: [],
      repairSummaries: [],
      history: [],
      axes: ["Standards", "Spec"].map((axis) => ({
        axis,
        sources: archiveSourcePaths,
        priorFindings: [],
        repairSummaries: [],
        history: [],
        sourcesRead: true,
      })),
    },
    judgment: {
      material: true,
      riskAccepted: true,
      historyLoaded: true,
      allPriorActionableAccounted: true,
      unresolved: 0,
      class: "code-only",
      intentCitations: [
        "archive: Account safety scenario",
        "main: Account safety",
      ],
    },
    reservation: {
      verified: true,
      run: "head-1",
      before: 2,
      used: 3,
      limit: 10,
    },
    alignment: {
      codeEvidence: ["src/accounts.ts: guard restores established requirement"],
      archiveEvidence: ["archived Account safety requirement/design/task"],
      mainEvidence: ["main Account safety requirement"],
      documents: archivedDocumentDispositions,
      bookkeeping: false,
      bookkeepingReason: null,
      archivePathUnchanged: true,
      unaffectedRequirementsPreserved: true,
      mandatoryTestsPreserved: true,
    },
    validation: {
      independentDiff: true,
      regression: true,
      requiredChecks: true,
      documentRequired: false,
      documentPassed: null,
      comparison: true,
      mode: "direct-files",
      paths: archiveSourcePaths,
      commands: ["targeted regression: exit 0", "required checks: exit 0"],
    },
    delivery: {
      signed: true,
      dco: true,
      forcePush: false,
      commitAndOutgoingInspected: true,
      onlyAuthorized: true,
      remoteConfirmed: true,
      summaryVerified: true,
      head: "head-2",
    },
    final: {
      freshFullDiffReview: true,
      historyAwareJudgment: true,
      priorIDsAccounted: true,
      unresolved: 0,
      reviewedHead: "head-2",
      validationHead: "head-2",
      gateHead: "head-2",
      requiredChecks: true,
    },
    safeWorkPreserved: true,
    forbiddenOperations: [],
    events: correctionTrace,
    outcome: "verified",
    ...overrides,
  });
}
const archivedRepairFixtures = [
  archivedRepairFixture("ordinary-pr", {
    context: null,
    alignment: null,
    review: {
      fullDiff: true,
      fresh: true,
      sources: ["originating-issue"],
      priorFindings: [],
      repairSummaries: [],
      history: [],
      axes: ["Standards", "Spec"].map((axis) => ({
        axis,
        sources: ["originating-issue"],
        priorFindings: [],
        repairSummaries: [],
        history: [],
        sourcesRead: true,
      })),
    },
  }),
  ...[
    ["missing-archive", "archivePresent"],
    ["incomplete-archive-inventory", "completeInventory"],
    ["missing-main-spec", "mainSpecsPresent"],
  ].map(([id, field]) => {
    const f = archivedRepairFixture(id);
    f.sourceEvidence[field] = false;
    f.events = ["prepare", "pause"];
    f.outcome = "escalated";
    f.reservation = null;
    return f;
  }),
  (() => {
    const f = archivedRepairFixture("explicitly-limited-sources");
    f.sourceEvidence.mainSpecsPresent = false;
    f.coverage = {
      limited: true,
      authorization:
        "User authorized review without unavailable main-spec sources",
      omitted: [...archivedSources.mainSpecs],
    };
    f.review.sources = [...issueDeliveryPackage.archive];
    for (const axis of f.review.axes) axis.sources = [...f.review.sources];
    f.events = ["prepare", "review", "judge", "final-gates"];
    f.judgment.material = false;
    f.reservation = null;
    f.delivery.head = "head-1";
    for (const field of ["reviewedHead", "validationHead", "gateHead"])
      f.final[field] = "head-1";
    f.outcome = "limited";
    return f;
  })(),
  archivedRepairFixture("code-only-correction"),
  (() => {
    const f = archivedRepairFixture("code-only-bookkeeping");
    f.alignment.documents.find((d) => d.path.endsWith("tasks.md")).disposition =
      "changed";
    f.alignment.bookkeeping = true;
    f.alignment.bookkeepingReason =
      "Record corrected regression evidence, not new behavior";
    f.validation.documentRequired = true;
    f.validation.documentPassed = true;
    f.validation.commands.push("affected document validation: exit 0");
    return f;
  })(),
  ...["approved-behavior-reconciled", "approved-behavior-docs-current"].map(
    (id) => {
      const f = archivedRepairFixture(id);
      f.judgment.class = "approved-behavior";
      f.validation.documentRequired = true;
      f.validation.documentPassed = true;
      f.validation.mode = "disposable-copies";
      f.validation.commands.push(
        "copied archived delta form and main coherence: exit 0",
      );
      if (id === "approved-behavior-reconciled")
        for (const doc of f.alignment.documents) doc.disposition = "changed";
      return f;
    },
  ),
  (() => {
    const f = archivedRepairFixture("document-validation-failed");
    f.judgment.class = "approved-behavior";
    f.validation.documentRequired = true;
    f.validation.documentPassed = false;
    f.validation.commands.push("copied archived delta validation: exit 1");
    f.events = [...correctionTrace.slice(0, 6), "pause"];
    f.outcome = "escalated";
    return f;
  })(),
  (() => {
    const f = archivedRepairFixture("new-consequential-intent");
    f.judgment.class = "new-intent";
    f.question = {
      finding: "Correction would change a public contract",
      investigation: "Existing approved artifacts do not decide this behavior",
      proposedIntent: "Change the public contract",
      affectedDocuments: archiveSourcePaths,
      question:
        "Authorize this scoped contract change or preserve existing intent?",
      options: ["Preserve approved behavior", "Authorize a scoped amendment"],
      consequences: "Compatibility changes for existing callers",
      recommendation: "Preserve compatibility until explicitly authorized",
    };
    f.events = ["prepare", "review", "judge", "pause"];
    f.reservation = null;
    f.outcome = "escalated";
    return f;
  })(),
  (() => {
    const f = archivedRepairFixture("stale-final-head-checks");
    f.final.gateHead = "head-1";
    f.events = [...correctionTrace, "pause"];
    f.outcome = "escalated";
    return f;
  })(),
];

function assertIllustrativeArchivedRepair(f) {
  assert.ok(f.safeWorkPreserved);
  assert.deepEqual(
    f.forbiddenOperations,
    [],
    "no lifecycle replay or requirements weakening",
  );
  const has = (event) => f.events.includes(event);
  assert.equal(f.events[0], "prepare");
  const sourceReady =
    !f.context ||
    [
      "sameTarget",
      "sourceAbsent",
      "completeInventory",
      "archivePresent",
      "mainSpecsPresent",
      "branchAndOutgoingInspected",
      "currentContentsReconciled",
      "trackerReady",
    ].every((field) => f.sourceEvidence[field] === true);
  if (!sourceReady && !f.coverage.limited) {
    assert.deepEqual(f.events, ["prepare", "pause"]);
    assert.equal(f.outcome, "escalated");
    assert.equal(f.reservation, null);
    return;
  }
  if (f.coverage.limited) {
    assert.ok(f.coverage.authorization && f.coverage.omitted.length);
    // This fixture authorizes missing main-spec sources only, not identity,
    // ownership, tracker setup or other missing prerequisites.
    for (const field of [
      "sameTarget",
      "sourceAbsent",
      "completeInventory",
      "archivePresent",
      "branchAndOutgoingInspected",
      "currentContentsReconciled",
      "trackerReady",
    ])
      assert.equal(f.sourceEvidence[field], true);
    assert.deepEqual(f.coverage.omitted, archivedSources.mainSpecs);
    assert.equal(
      f.outcome,
      "limited",
      "narrow sources are never full verification",
    );
    assert.deepEqual(f.events, ["prepare", "review", "judge", "final-gates"]);
    assert.equal(f.reservation, null);
  }
  assert.ok(f.review.fresh && f.review.fullDiff);
  const expectedSources = f.context
    ? archiveSourcePaths.filter((p) => !f.coverage.omitted.includes(p))
    : ["originating-issue"];
  assert.deepEqual(f.review.sources, expectedSources);
  for (const review of [f.review, ...f.review.axes]) {
    for (const field of ["priorFindings", "repairSummaries", "history"])
      assert.deepEqual(
        review[field],
        [],
        `fresh reviewer cannot receive ${field}`,
      );
    assert.deepEqual(review.sources, expectedSources);
  }
  assert.deepEqual(
    f.review.axes.map((a) => a.axis),
    ["Standards", "Spec"],
  );
  assert.ok(f.review.axes.every((a) => a.sourcesRead));
  assert.ok(f.judgment.historyLoaded && f.judgment.allPriorActionableAccounted);
  assert.equal(f.judgment.unresolved, 0);
  if (f.context) {
    assert.deepEqual(f.context, archivedSources);
    assert.deepEqual(f.review.activeChangeCommands, []);
    assert.ok(f.judgment.intentCitations.length);
  }
  if (f.judgment.class === "new-intent") {
    assert.deepEqual(f.events, ["prepare", "review", "judge", "pause"]);
    for (const field of [
      "finding",
      "investigation",
      "proposedIntent",
      "affectedDocuments",
      "question",
      "options",
      "consequences",
      "recommendation",
    ])
      assert.ok(f.question[field]?.length, field);
    assert.equal(f.reservation, null, "new intent pauses before editing");
    assert.equal(f.outcome, "escalated");
    return;
  }
  assert.ok(["code-only", "approved-behavior"].includes(f.judgment.class));
  if (has("repair")) {
    assert.ok(f.judgment.material && f.judgment.riskAccepted);
    assert.ok(f.reservation.verified && f.reservation.run);
    assert.equal(f.reservation.limit, 10);
    assert.equal(f.reservation.used, f.reservation.before + 1);
    assert.ok(f.reservation.used <= 10);
    assert.ok(
      f.validation.independentDiff &&
        f.validation.regression &&
        f.validation.requiredChecks,
    );
    if (f.context) {
      const a = f.alignment;
      for (const field of ["codeEvidence", "archiveEvidence", "mainEvidence"])
        assert.ok(a[field].length, field);
      assert.ok(
        a.archivePathUnchanged &&
          a.unaffectedRequirementsPreserved &&
          a.mandatoryTestsPreserved,
      );
      assert.deepEqual(
        a.documents.map((d) => d.path),
        archivedDocumentDispositions.map((d) => d.path),
      );
      for (const doc of a.documents) {
        assert.ok(["changed", "unchanged"].includes(doc.disposition));
        assert.ok(doc.evidence);
      }
      if (
        f.judgment.class === "code-only" &&
        a.documents.some((d) => d.disposition === "changed")
      )
        assert.ok(a.bookkeeping && a.bookkeepingReason);
      const documentRequired =
        f.judgment.class === "approved-behavior" ||
        a.documents.some((d) => d.disposition === "changed");
      assert.equal(f.validation.documentRequired, documentRequired);
      assert.ok(f.validation.comparison);
      assert.deepEqual(f.validation.paths, archiveSourcePaths);
      assert.ok(
        ["direct-files", "disposable-copies"].includes(f.validation.mode),
      );
      assert.ok(f.validation.commands.length);
      if (documentRequired && !f.validation.documentPassed) {
        assert.deepEqual(f.events, [...correctionTrace.slice(0, 6), "pause"]);
        assert.equal(f.outcome, "escalated");
        return;
      }
    } else assert.equal(f.alignment, null, "ordinary PR needs no archive");
    const d = f.delivery;
    assert.ok(d.signed && d.dco && !d.forcePush);
    assert.ok(
      d.commitAndOutgoingInspected &&
        d.onlyAuthorized &&
        d.remoteConfirmed &&
        d.summaryVerified,
    );
  }
  const final = f.final;
  const headMatches = [
    final.reviewedHead,
    final.validationHead,
    final.gateHead,
  ].every((sha) => sha === f.delivery.head && sha.length > 0);
  assert.ok(
    final.freshFullDiffReview &&
      final.historyAwareJudgment &&
      final.priorIDsAccounted,
  );
  assert.equal(final.unresolved, 0);
  assert.ok(final.requiredChecks);
  if (!headMatches) {
    assert.deepEqual(f.events, [...correctionTrace, "pause"]);
    assert.equal(f.outcome, "escalated");
  } else if (!f.coverage.limited) {
    assert.deepEqual(f.events, correctionTrace);
    assert.equal(f.outcome, "verified");
  }
}

test("archived PR review/repair fixtures match clean-source, alignment and final-head contracts", async (t) => {
  const reference = readFileSync(
    join(repoRoot, "skills/orc-pr-review-repair/references/archived-intent.md"),
    "utf8",
  );
  const documented = new Map(
    [
      ...reference.matchAll(
        /^\| ([a-z][a-z-]+) \| ([^|]+) \| (verified|limited|escalated) \|$/gm,
      ),
    ].map(([, id, trace, outcome]) => [
      id,
      { events: trace.trim().split(" → "), outcome },
    ]),
  );
  assert.deepEqual(
    [...documented.keys()],
    archivedRepairFixtures.map((f) => f.id),
  );
  for (const fixture of archivedRepairFixtures)
    await t.test(fixture.id, () => {
      assert.deepEqual(documented.get(fixture.id), {
        events: fixture.events,
        outcome: fixture.outcome,
      });
      assertIllustrativeArchivedRepair(fixture);
    });
});

test("archived-repair contracts reject dirty review context, lost intent/history and stale acceptance", () => {
  const forged = (mutate, id = "code-only-correction") => {
    const fixture = structuredClone(
      archivedRepairFixtures.find((f) => f.id === id),
    );
    mutate(fixture);
    assert.throws(() => assertIllustrativeArchivedRepair(fixture));
  };
  for (const field of Object.keys(archivedRepairFixtures[0].sourceEvidence))
    forged((f) => {
      f.sourceEvidence[field] = false;
    });
  forged((f) => {
    f.sourceEvidence = {};
  });
  forged((f) => {
    f.context.inventory = ["tasks.md"];
  });
  forged((f) => {
    f.review.activeChangeCommands.push(
      "openspec instructions apply --change accounts",
    );
  });
  for (const index of [-1, 0, 1])
    for (const field of ["priorFindings", "repairSummaries", "history"])
      forged((f) => {
        (index < 0 ? f.review : f.review.axes[index])[field].push(
          "previous round",
        );
      });
  for (const index of [0, 1]) {
    forged((f) => {
      f.review.axes[index].sources.pop();
    });
    forged((f) => {
      f.review.axes[index].sourcesRead = false;
    });
  }
  for (const field of [
    "historyLoaded",
    "allPriorActionableAccounted",
    "material",
    "riskAccepted",
  ])
    forged((f) => {
      f.judgment[field] = false;
    });
  forged((f) => {
    f.reservation.verified = false;
  });
  forged((f) => {
    f.reservation.before = 9;
    f.reservation.used = 11;
  });
  forged((f) => {
    f.reservation.used = 0;
  });
  for (const field of ["codeEvidence", "archiveEvidence", "mainEvidence"])
    forged((f) => {
      f.alignment[field] = [];
    });
  for (const field of [
    "archivePathUnchanged",
    "unaffectedRequirementsPreserved",
    "mandatoryTestsPreserved",
  ])
    forged((f) => {
      f.alignment[field] = false;
    });
  forged((f) => {
    f.alignment.documents.pop();
  });
  forged((f) => {
    f.alignment.documents[0].evidence = "";
  });
  forged((f) => {
    f.alignment.documents[0].disposition = "changed";
  });
  forged((f) => {
    f.validation.documentRequired = false;
  }, "approved-behavior-reconciled");
  forged((f) => {
    f.validation.documentPassed = false;
  }, "approved-behavior-docs-current");
  for (const field of [
    "independentDiff",
    "regression",
    "requiredChecks",
    "comparison",
  ])
    forged((f) => {
      f.validation[field] = false;
    });
  forged((f) => {
    f.validation.mode = "reopen-real-archive";
  });
  forged((f) => {
    f.delivery.signed = false;
  });
  forged((f) => {
    f.delivery.forcePush = true;
  });
  forged((f) => {
    f.delivery.onlyAuthorized = false;
  });
  for (const field of [
    "freshFullDiffReview",
    "historyAwareJudgment",
    "priorIDsAccounted",
    "requiredChecks",
  ])
    forged((f) => {
      f.final[field] = false;
    });
  forged((f) => {
    f.final.gateHead = "head-1";
  });
  forged((f) => {
    f.question.options = [];
  }, "new-consequential-intent");
  forged((f) => {
    f.events = correctionTrace;
    f.outcome = "verified";
  }, "new-consequential-intent");
  forged((f) => {
    f.coverage.authorization = null;
  }, "explicitly-limited-sources");
  forged((f) => {
    f.sourceEvidence.sameTarget = false;
  }, "explicitly-limited-sources");
  forged((f) => {
    f.sourceEvidence.trackerReady = false;
  }, "explicitly-limited-sources");
  forged((f) => {
    f.outcome = "verified";
  }, "explicitly-limited-sources");
  forged((f) => {
    f.outcome = "verified";
  }, "missing-archive");
  for (const operation of [
    "reopen",
    "rearchive",
    "full-lifecycle",
    "weaken-requirements",
    "weaken-tests",
    "reset-budget",
  ])
    forged((f) => {
      f.forbiddenOperations.push(operation);
    });
});

// #49 explicit-resume examples: assertions over declared observations, not a
// runtime/finalizer. "remaining" permits dispatch; it is not a delivery receipt.
const issueActivePath = "openspec/changes/accounts";
const issueArchivePath = archivedSources.archivePath;
const issueResumeEvidence = {
  target: archivedSources,
  explicitResume: true,
  sameIdentityAndAuthority: true,
  prerequisitesCurrent: true,
  safeWorkPreserved: true,
  historyPreserved: true,
  finishClaimed: false,
  replayOperations: [],
  observations: {
    activePath: issueActivePath,
    archivePath: issueArchivePath,
    source: "absent",
    destination: "complete",
    inventory: issueArchiveInventory,
    contentIdentity: "whole-change-1",
    metadataMatched: true,
  },
  receipts: {
    preMoveInventory: issueArchiveInventory,
    preMoveContentIdentity: "whole-change-1",
    verification: {
      fullReport: true,
      complete: true,
      critical: 0,
      warning: 0,
      checks: true,
      current: true,
    },
    sync: "accepted",
    currentComparison: true,
    mapping: selectedDeltas,
    effectsInspected: selectedDeltas,
    effects: "already-synced",
    conflict: false,
    unaffectedPreserved: true,
  },
  events: ["reconcile", "observe-archive", "package"],
  remaining: ["deliver"],
  outcome: "ready",
  delivery: null,
  repair: null,
  question: null,
};
function issueResumeFixture(id, overrides = {}) {
  return structuredClone({ ...issueResumeEvidence, id, ...overrides });
}
function resumeQuestion(f, blocker) {
  return {
    blocker,
    evidence: [
      f.observations.activePath,
      f.observations.archivePath,
      `source=${f.observations.source}; archive=${f.observations.destination}; inventory=${f.observations.inventory.join(", ")}; content=${f.observations.contentIdentity}`,
      ...(f.delivery
        ? [
            `local=${f.delivery.localHead}; remote=${f.delivery.remoteHead}; branch=${f.delivery.branch}; state=${f.delivery.remoteState}; PRs=${f.delivery.prs.map((pr) => pr.url).join(", ") || "none found"}`,
          ]
        : []),
      ...(f.repair
        ? [
            `run=${f.repair.run}; start=${f.repair.startURL}; reserved=${f.repair.recoveredUsed}/10; history unambiguous=${f.repair.unambiguous}`,
          ]
        : []),
    ],
    attemptedInvestigation:
      "Read actual inventories, full available receipts and git/PR/history identity; preserved safe work",
    question: `At ${f.observations.activePath} and ${f.observations.archivePath}: ${blocker}. Recover the missing evidence or provide a scoped reconciliation decision for this exact state?`,
    options: [
      "Recover original receipts and reconcile exact state",
      "Provide a scoped recovery decision; keep delivery paused",
    ],
    consequences:
      "Unresolved identity/content/history cannot establish delivery or replenish the budget",
    recommendation:
      "Preserve work and recover evidence before any further publication",
  };
}
function blockIssueResume(f, blocker) {
  f.events.push("pause");
  f.remaining = [];
  f.outcome = "blocked";
  f.question = resumeQuestion(f, blocker);
  return f;
}
const activeIssueObservations = {
  ...issueResumeEvidence.observations,
  source: "intact",
  destination: "absent",
};
const activeResumeTrace = ["reconcile", "assess", "move", "confirm", "package"];
const confirmedIssueMove = {
  sourceAbsent: true,
  archivePath: issueArchivePath,
  inventory: issueArchiveInventory,
  contentIdentity: "whole-change-1",
  metadataMatched: true,
};
const deliveryResumeEvidence = {
  localHead: "head-2",
  remoteHead: "head-1",
  localCommitExists: true,
  signed: true,
  dco: true,
  independentOutgoingInspection: true,
  contents: issueDeliveryPackage,
  authorizedBaselineChecked: true,
  requiredChecksCurrent: true,
  currentDevelopReconciled: true,
  remoteQueried: true,
  remoteState: "behind",
  ancestryVerified: true,
  forcePush: false,
  branch: "issue-49",
  base: "develop",
  prSearchComplete: true,
  prs: [],
};
function deliveredResume(id, overrides = {}) {
  return issueResumeFixture(id, {
    delivery: { ...deliveryResumeEvidence, ...overrides },
    events: [...issueResumeEvidence.events, "reconcile-delivery"],
    remaining: ["push", "create-pr", "review"],
  });
}
const matchingResumePR = {
  url: "https://example.test/repo/pull/49",
  head: "issue-49",
  base: "develop",
  sha: "head-2",
  issue: 49,
  repositoryMatches: true,
  open: true,
};
const repairResumeEvidence = {
  run: "head-1",
  originalRun: "head-1",
  round: 3,
  startURL: "https://example.test/repo/repair-start/3",
  verifiedStart: true,
  paginatedHistory: true,
  unambiguous: true,
  originalUsed: 6,
  recoveredUsed: 6,
  limit: 10,
  newReservations: 0,
  ledger: ["F-001"],
  originalLedger: ["F-001"],
  unresolvedIDsRetained: true,
  ownedChangesInspected: true,
  approvedScope: true,
  archivePath: issueArchivePath,
  repairContentChainReconciled: true,
  codeArchiveMainAlignment: true,
  documentDispositions: archivedDocumentDispositions,
  previousReportsRetained: true,
  expectedHead: "head-2",
  originalExpectedHead: "head-2",
  deliveredHead: null,
  validationHead: null,
  previousGatesInvalidated: false,
  reviewerHistory: [],
  axesHistory: [[], []],
  attemptDelivered: false,
  summaryVerified: false,
};
function repairResume(id, overrides = {}) {
  const f = deliveredResume(id, {
    remoteHead: "head-2",
    remoteState: "matching",
    prs: [matchingResumePR],
  });
  f.repair = structuredClone({ ...repairResumeEvidence, ...overrides });
  if (f.repair.attemptDelivered) {
    f.delivery.localHead = "head-3";
    f.delivery.remoteHead = "head-3";
    f.delivery.prs[0].sha = "head-3";
    f.repair.deliveredHead = "head-3";
    f.repair.validationHead = "head-3";
    f.repair.previousGatesInvalidated = true;
  }
  f.events.push("resume-repair");
  f.remaining = [
    "validate",
    "repair-delivery",
    "record-summary",
    "fresh-review",
  ];
  return f;
}
const issueResumeFixtures = [
  issueResumeFixture("active-partial-sync", {
    observations: activeIssueObservations,
    receipts: {
      ...issueResumeEvidence.receipts,
      sync: "partial",
      currentComparison: false,
      effects: "partial",
    },
    remainingSync: {
      onlyMissingEffects: true,
      appliedEffectsPreserved: true,
      validCurrentSnapshot: true,
      synchronous: true,
      builtInComparisonAccepted: true,
      comparedEffects: selectedDeltas,
    },
    confirmation: confirmedIssueMove,
    events: [
      "reconcile",
      "assess",
      "sync-missing",
      "compare",
      "move",
      "confirm",
      "package",
    ],
    remaining: ["sync-missing", "archive", "deliver"],
  }),
  issueResumeFixture("accepted-sync-failed-archive", {
    observations: activeIssueObservations,
    confirmation: confirmedIssueMove,
    events: activeResumeTrace,
    remaining: ["archive", "deliver"],
  }),
  issueResumeFixture("matching-complete-archive"),
  ...[
    ["both-active-and-archive", { source: "intact" }],
    ["neither-active-nor-archive", { destination: "absent", inventory: [] }],
    ["partial-archive", { destination: "partial", inventory: ["tasks.md"] }],
    ["mismatched-archive-content", { contentIdentity: "other-change" }],
  ].map(([id, observations]) =>
    blockIssueResume(
      issueResumeFixture(id, {
        observations: { ...issueResumeEvidence.observations, ...observations },
        events: ["reconcile"],
      }),
      id,
    ),
  ),
  blockIssueResume(
    issueResumeFixture("archived-missing-predecessor", {
      receipts: { ...issueResumeEvidence.receipts, verification: null },
      events: ["reconcile"],
    }),
    "missing full verification report/check evidence",
  ),
  blockIssueResume(
    issueResumeFixture("archived-stale-comparison", {
      receipts: { ...issueResumeEvidence.receipts, currentComparison: false },
      events: ["reconcile"],
    }),
    "archived comparison no longer current",
  ),
  issueResumeFixture("active-stale-verification", {
    observations: activeIssueObservations,
    receipts: {
      ...issueResumeEvidence.receipts,
      verification: {
        ...issueResumeEvidence.receipts.verification,
        current: false,
      },
    },
    refreshedVerification: issueResumeEvidence.receipts.verification,
    confirmation: confirmedIssueMove,
    events: [
      "reconcile",
      "refresh-verify",
      "assess",
      "move",
      "confirm",
      "package",
    ],
    remaining: ["reverify", "archive", "deliver"],
  }),
  blockIssueResume(
    issueResumeFixture("active-sync-conflict", {
      observations: activeIssueObservations,
      receipts: { ...issueResumeEvidence.receipts, conflict: true },
      events: ["reconcile", "assess"],
    }),
    "conflicting billing delta/main effect",
  ),
  deliveredResume("local-signed-commit-only"),
  (() => {
    const f = deliveredResume("pushed-response-lost", {
      remoteHead: "head-2",
      remoteState: "matching",
    });
    f.remaining = ["create-pr", "review"];
    return f;
  })(),
  (() => {
    const f = deliveredResume("matching-pr-response-lost", {
      remoteHead: "head-2",
      remoteState: "matching",
      prs: [matchingResumePR],
    });
    f.remaining = ["review"];
    return f;
  })(),
  blockIssueResume(
    deliveredResume("remote-diverged", {
      remoteState: "diverged",
      ancestryVerified: false,
    }),
    "unexpected/diverged remote issue-49 branch",
  ),
  blockIssueResume(
    deliveredResume("ambiguous-existing-pr", {
      prs: [
        matchingResumePR,
        { ...matchingResumePR, url: "https://example.test/repo/pull/50" },
      ],
    }),
    "two matching-looking issue-49 PRs",
  ),
  blockIssueResume(
    deliveredResume("unsigned-local-commit", { signed: false }),
    "local commit signature unavailable/invalid",
  ),
  (() => {
    const f = deliveredResume("outgoing-package-incomplete");
    f.delivery.contents.archive.pop();
    return blockIssueResume(
      f,
      "whole outgoing archive metadata/content missing",
    );
  })(),
  repairResume("unfinished-reserved-repair"),
  (() => {
    const f = repairResume("repair-push-summary-missing", {
      attemptDelivered: true,
    });
    f.remaining = ["record-summary", "fresh-review"];
    return f;
  })(),
  (() => {
    const f = repairResume("conflicting-repair-history", {
      unambiguous: false,
    });
    f.events.pop();
    return blockIssueResume(f, "conflicting repair-start records/count");
  })(),
  repairResume("repair-ten-incomplete", {
    originalUsed: 10,
    recoveredUsed: 10,
  }),
  (() => {
    const f = repairResume("repair-ten-delivered", {
      originalUsed: 10,
      recoveredUsed: 10,
      attemptDelivered: true,
      summaryVerified: true,
    });
    f.remaining = ["fresh-review"];
    return f;
  })(),
];

function assertIllustrativeIssueResume(f) {
  assert.equal(f.explicitResume, true);
  assert.ok(f.sameIdentityAndAuthority && f.prerequisitesCurrent);
  assert.ok(f.safeWorkPreserved && f.historyPreserved);
  assert.equal(f.finishClaimed, false, "remaining dispatch is not Finish");
  assert.deepEqual(
    f.replayOperations,
    [],
    "no duplicate publication, lifecycle replay or budget reset",
  );
  assert.deepEqual(f.target, archivedSources);
  assert.equal(f.events[0], "reconcile");
  assert.equal(new Set(f.events).size, f.events.length);
  const o = f.observations;
  const r = f.receipts;
  assert.equal(o.activePath, issueActivePath);
  assert.equal(o.archivePath, issueArchivePath);
  const active = o.source === "intact" && o.destination === "absent";
  const archived = o.source === "absent" && o.destination === "complete";
  const whole =
    o.metadataMatched &&
    JSON.stringify(o.inventory) === JSON.stringify(r.preMoveInventory) &&
    o.contentIdentity === r.preMoveContentIdentity;
  assert.deepEqual(r.preMoveInventory, issueArchiveInventory);
  assert.deepEqual(r.mapping, selectedDeltas);
  assert.deepEqual(r.effectsInspected, r.mapping);
  if (r.sync === "not-applicable")
    assert.deepEqual(
      r.mapping,
      [],
      "no-delta applicability must match authoritative inventory",
    );
  const currentVerification = (v) =>
    v?.fullReport &&
    v.complete &&
    v.critical === 0 &&
    v.warning === 0 &&
    v.checks &&
    v.current;
  const headDelivery = f.delivery;
  const deliverySafe =
    !headDelivery ||
    (headDelivery.localCommitExists &&
      headDelivery.signed &&
      headDelivery.dco &&
      headDelivery.independentOutgoingInspection &&
      headDelivery.authorizedBaselineChecked &&
      headDelivery.requiredChecksCurrent &&
      headDelivery.currentDevelopReconciled &&
      headDelivery.remoteQueried &&
      headDelivery.ancestryVerified &&
      !headDelivery.forcePush &&
      headDelivery.branch === "issue-49" &&
      headDelivery.base === "develop" &&
      headDelivery.prSearchComplete &&
      headDelivery.prs.length <= 1 &&
      ["behind", "matching"].includes(headDelivery.remoteState) &&
      JSON.stringify(headDelivery.contents) ===
        JSON.stringify(issueDeliveryPackage));
  const v = f.refreshedVerification || r.verification;
  const evidenceSafe =
    (active || archived) &&
    whole &&
    currentVerification(v) &&
    !r.conflict &&
    r.unaffectedPreserved &&
    (active ||
      (r.currentComparison &&
        ["accepted", "already-synced", "not-applicable"].includes(r.sync)));
  const repairSafe = !f.repair || f.repair.unambiguous;
  if (!evidenceSafe || !deliverySafe || !repairSafe) {
    assert.equal(f.events.at(-1), "pause");
    assert.equal(f.outcome, "blocked");
    assert.deepEqual(f.remaining, []);
    assert.ok(
      f.question?.blocker &&
        f.question.attemptedInvestigation &&
        f.question.question &&
        f.question.consequences &&
        f.question.recommendation,
    );
    assert.ok(f.question.options.length >= 2);
    assert.ok(
      f.question.evidence.includes(o.activePath) &&
        f.question.evidence.includes(o.archivePath),
    );
    assert.deepEqual(
      f.events,
      f.delivery
        ? [...issueResumeEvidence.events, "reconcile-delivery", "pause"]
        : r.conflict && active
          ? ["reconcile", "assess", "pause"]
          : ["reconcile", "pause"],
    );
    return;
  }
  assert.equal(f.outcome, "ready");
  assert.equal(f.question, null);
  const expectedEvents = ["reconcile"];
  const expectedRemaining = [];
  if (active) {
    if (!r.verification.current) {
      assert.ok(currentVerification(f.refreshedVerification));
      expectedEvents.push("refresh-verify");
      expectedRemaining.push("reverify");
    } else assert.equal(f.refreshedVerification, undefined);
    expectedEvents.push("assess");
    if (r.effects === "partial") {
      assert.equal(r.sync, "partial");
      for (const field of [
        "onlyMissingEffects",
        "appliedEffectsPreserved",
        "validCurrentSnapshot",
        "synchronous",
        "builtInComparisonAccepted",
      ])
        assert.equal(f.remainingSync[field], true, field);
      assert.deepEqual(f.remainingSync.comparedEffects, selectedDeltas);
      expectedEvents.push("sync-missing", "compare");
      expectedRemaining.push("sync-missing");
    } else {
      assert.equal(r.effects, "already-synced");
      assert.ok(r.currentComparison && r.sync === "accepted");
    }
    expectedEvents.push("move", "confirm", "package");
    expectedRemaining.push("archive", "deliver");
    assert.deepEqual(f.confirmation, confirmedIssueMove);
  } else {
    assert.equal(r.effects, "already-synced");
    expectedEvents.push("observe-archive", "package");
    expectedRemaining.push("deliver");
  }
  if (headDelivery) {
    assert.ok(archived, "publication follows confirmed archive");
    expectedEvents.push("reconcile-delivery");
    expectedRemaining.length = 0;
    assert.ok(headDelivery.localHead && headDelivery.remoteHead);
    if (headDelivery.remoteState === "matching")
      assert.equal(headDelivery.localHead, headDelivery.remoteHead);
    else {
      assert.notEqual(headDelivery.localHead, headDelivery.remoteHead);
      expectedRemaining.push("push");
    }
    if (!headDelivery.prs.length) expectedRemaining.push("create-pr");
    else {
      assert.deepEqual(headDelivery.prs[0], {
        ...matchingResumePR,
        sha: headDelivery.localHead,
      });
      assert.equal(headDelivery.remoteState, "matching");
    }
    expectedRemaining.push("review");
  }
  if (f.repair) {
    const h = f.repair;
    assert.ok(headDelivery.prs.length === 1);
    assert.equal(h.run, h.originalRun);
    assert.equal(h.expectedHead, h.originalExpectedHead);
    assert.equal(h.expectedHead, "head-2");
    if (h.attemptDelivered) {
      assert.equal(h.deliveredHead, headDelivery.remoteHead);
      assert.equal(h.validationHead, h.deliveredHead);
      assert.notEqual(h.deliveredHead, h.expectedHead);
      assert.equal(h.previousGatesInvalidated, true);
    } else {
      assert.equal(headDelivery.localHead, h.expectedHead);
      assert.equal(h.deliveredHead, null);
      assert.equal(h.validationHead, null);
    }
    assert.ok(h.run && h.startURL && h.round > 0);
    assert.ok(
      h.verifiedStart && h.paginatedHistory && h.previousReportsRetained,
    );
    assert.equal(h.recoveredUsed, h.originalUsed);
    assert.ok(h.recoveredUsed > 0 && h.recoveredUsed <= 10);
    assert.equal(h.limit, 10);
    assert.equal(h.newReservations, 0);
    assert.deepEqual(h.ledger, h.originalLedger);
    assert.ok(
      h.unresolvedIDsRetained && h.ownedChangesInspected && h.approvedScope,
    );
    assert.equal(h.archivePath, issueArchivePath);
    assert.ok(h.repairContentChainReconciled && h.codeArchiveMainAlignment);
    assert.deepEqual(h.documentDispositions, archivedDocumentDispositions);
    assert.deepEqual(h.reviewerHistory, []);
    assert.deepEqual(h.axesHistory, [[], []]);
    expectedEvents.push("resume-repair");
    expectedRemaining.length = 0;
    if (!h.attemptDelivered) {
      assert.equal(h.summaryVerified, false);
      expectedRemaining.push("validate", "repair-delivery");
    }
    if (!h.summaryVerified) expectedRemaining.push("record-summary");
    expectedRemaining.push("fresh-review");
  }
  assert.deepEqual(f.events, expectedEvents);
  assert.deepEqual(f.remaining, expectedRemaining);
}

test("issue finalization/delivery/repair recovery fixtures require actual state and exact remaining operations", async (t) => {
  const reference = readFileSync(
    join(
      repoRoot,
      "skills/orc-issue-to-pr/references/recovery-and-receipts.md",
    ),
    "utf8",
  );
  const documented = new Map(
    [
      ...reference.matchAll(
        /^\| ([a-z][a-z-]+) \| ([^|]+) \| ([^|]+) \| (ready|blocked) \|$/gm,
      ),
    ].map(([, id, trace, remaining, outcome]) => [
      id,
      {
        events: trace.trim().split(" → "),
        remaining:
          remaining.trim() === "none" ? [] : remaining.trim().split(", "),
        outcome,
      },
    ]),
  );
  assert.deepEqual(
    [...documented.keys()],
    issueResumeFixtures.map((f) => f.id),
  );
  for (const f of issueResumeFixtures)
    await t.test(f.id, () => {
      assert.deepEqual(documented.get(f.id), {
        events: f.events,
        remaining: f.remaining,
        outcome: f.outcome,
      });
      assertIllustrativeIssueResume(f);
    });
});

test("issue recovery rejects inferred acceptance, duplicate publication and replenished repair accounting", () => {
  const forged = (id, mutate) => {
    const f = structuredClone(issueResumeFixtures.find((f) => f.id === id));
    mutate(f);
    assert.throws(() => assertIllustrativeIssueResume(f));
  };
  const archived = (mutate) => forged("matching-complete-archive", mutate);
  for (const field of [
    "explicitResume",
    "sameIdentityAndAuthority",
    "prerequisitesCurrent",
    "safeWorkPreserved",
    "historyPreserved",
  ])
    archived((f) => {
      f[field] = false;
    });
  archived((f) => {
    f.finishClaimed = true;
  });
  archived((f) => {
    f.observations.inventory.pop();
  });
  archived((f) => {
    f.observations.contentIdentity = "other-change";
  });
  archived((f) => {
    f.observations.metadataMatched = false;
  });
  archived((f) => {
    f.observations.source = "intact";
  });
  archived((f) => {
    f.observations.archivePath = "another-date-copy";
  });
  archived((f) => {
    f.receipts.verification = null;
  });
  for (const field of ["fullReport", "complete", "checks", "current"])
    archived((f) => {
      f.receipts.verification[field] = false;
    });
  archived((f) => {
    f.receipts.verification.warning = 1;
  });
  archived((f) => {
    f.receipts.currentComparison = false;
  });
  archived((f) => {
    f.receipts.sync = "partial";
  });
  archived((f) => {
    f.receipts.sync = "not-applicable";
  });
  archived((f) => {
    f.receipts.effectsInspected.pop();
  });
  archived((f) => {
    f.receipts.unaffectedPreserved = false;
  });
  for (const field of Object.keys(issueResumeFixtures[0].remainingSync).filter(
    (key) => key !== "comparedEffects",
  ))
    forged("active-partial-sync", (f) => {
      f.remainingSync[field] = false;
    });
  forged("active-partial-sync", (f) => {
    f.remainingSync.comparedEffects.pop();
  });
  forged("active-partial-sync", (f) => {
    f.confirmation.sourceAbsent = false;
  });
  forged("active-stale-verification", (f) => {
    f.refreshedVerification.critical = 1;
  });
  for (const field of [
    "signed",
    "dco",
    "independentOutgoingInspection",
    "authorizedBaselineChecked",
    "requiredChecksCurrent",
    "currentDevelopReconciled",
    "remoteQueried",
    "ancestryVerified",
    "prSearchComplete",
  ])
    forged("local-signed-commit-only", (f) => {
      f.delivery[field] = false;
    });
  forged("local-signed-commit-only", (f) => {
    f.delivery.forcePush = true;
  });
  for (const category of Object.keys(issueDeliveryPackage))
    forged("local-signed-commit-only", (f) => {
      f.delivery.contents[category].pop();
    });
  forged("pushed-response-lost", (f) => {
    f.remaining.unshift("push");
  });
  forged("matching-pr-response-lost", (f) => {
    f.remaining.unshift("create-pr");
  });
  forged("matching-pr-response-lost", (f) => {
    f.delivery.prs[0].base = "main";
  });
  for (const field of [
    "verifiedStart",
    "paginatedHistory",
    "previousReportsRetained",
    "unresolvedIDsRetained",
    "ownedChangesInspected",
    "approvedScope",
    "repairContentChainReconciled",
    "codeArchiveMainAlignment",
  ])
    forged("unfinished-reserved-repair", (f) => {
      f.repair[field] = false;
    });
  forged("unfinished-reserved-repair", (f) => {
    f.repair.run = "new-run";
  });
  forged("unfinished-reserved-repair", (f) => {
    f.repair.recoveredUsed = 0;
  });
  forged("unfinished-reserved-repair", (f) => {
    f.repair.ledger = [];
  });
  forged("unfinished-reserved-repair", (f) => {
    f.repair.documentDispositions.pop();
  });
  forged("unfinished-reserved-repair", (f) => {
    f.repair.reviewerHistory.push("prior finding");
  });
  forged("unfinished-reserved-repair", (f) => {
    f.repair.axesHistory[1].push("prior repair");
  });
  forged("repair-push-summary-missing", (f) => {
    f.remaining.unshift("repair-delivery");
  });
  forged("unfinished-reserved-repair", (f) => {
    f.repair.expectedHead = "unrelated-head";
  });
  forged("repair-push-summary-missing", (f) => {
    f.repair.validationHead = "head-2";
  });
  forged("repair-push-summary-missing", (f) => {
    f.repair.previousGatesInvalidated = false;
  });
  forged("repair-ten-incomplete", (f) => {
    f.repair.newReservations = 1;
  });
  forged("repair-ten-delivered", (f) => {
    f.remaining.push("reserve-eleven");
  });
  for (const id of [
    "both-active-and-archive",
    "neither-active-nor-archive",
    "partial-archive",
    "archived-missing-predecessor",
    "remote-diverged",
    "conflicting-repair-history",
  ]) {
    forged(id, (f) => {
      f.outcome = "ready";
      f.remaining = ["deliver"];
    });
    forged(id, (f) => {
      f.question.question = "";
    });
    forged(id, (f) => {
      f.question.evidence = [];
    });
  }
  for (const operation of [
    "duplicate-move",
    "alternate-name",
    "reopen",
    "active-change-replay",
    "duplicate-commit",
    "duplicate-push",
    "duplicate-pr",
    "force-push",
    "reset-budget",
    "new-finalizer",
    "independent-assessor",
  ])
    archived((f) => {
      f.replayOperations.push(operation);
    });
});
