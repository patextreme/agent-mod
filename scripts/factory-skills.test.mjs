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

// Model-free checks only: packaging/distribution/discovery plus documented
// report-presentation contracts. No sessions, model calls, workflow dispatch,
// GitHub access, signing, or cleanup execution. The contract tests assert the
// text of skill documentation and examples; they do not establish live model
// adherence or how GitHub renders collapsed details.
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const factorySkills = {
  "orc-openspec-groom": ["references/pseudocode.md"],
  "orc-openspec-implement": ["references/pseudocode.md"],
  "orc-openspec-verify": ["references/pseudocode.md"],
  "orc-pr-review-repair": [
    "references/pseudocode.md",
    "references/report-contracts.md",
  ],
  "orc-issue-to-pr": [
    "references/pseudocode.md",
    "references/finalization.md",
    "references/finalization-receipts.md",
  ],
  "cleanup-merged-issues": [],
  "openspec-propose-issue": [],
};
const humanOnlySkills = new Set([
  "cleanup-merged-issues",
  "openspec-propose-issue",
]);
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
    humanOnlySkills.has(name),
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
  // The migrated toolkit retains the standalone MIT notice; historical
  // provenance was retired, so no provenance document is expected.
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

// --- orc-pr-review-repair report-presentation documentation contract ------

const reportContracts = readFileSync(
  join(repoRoot, "skills/orc-pr-review-repair/references/report-contracts.md"),
  "utf8",
);
const prReviewSkill = readFileSync(
  join(repoRoot, "skills/orc-pr-review-repair/SKILL.md"),
  "utf8",
);
const prReviewPseudocode = readFileSync(
  join(repoRoot, "skills/orc-pr-review-repair/references/pseudocode.md"),
  "utf8",
);
const issueToPrSkill = readFileSync(
  join(repoRoot, "skills/orc-issue-to-pr/SKILL.md"),
  "utf8",
);

function recordExample(name) {
  const heading = `### Example: ${name}`;
  const start = reportContracts.indexOf(heading);
  assert.ok(start !== -1, `report contracts must define ${name} example`);
  // Scan fence-aware: example records contain "### " headings inside their
  // collapsed audit blocks, so the section must not end at the first one.
  const lines = reportContracts.slice(start).split("\n");
  let end = lines.length;
  let inFence = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith("```")) inFence = !inFence;
    else if (!inFence && lines[i].startsWith("### ")) {
      end = i;
      break;
    }
  }
  const section = lines.slice(0, end).join("\n");
  const fenced = section.match(/```markdown\n([\s\S]*?)\n```/);
  assert.ok(fenced, `${name} example must include a markdown code block`);
  const record = fenced[1];
  const detailsAt = record.indexOf("<details>");
  assert.ok(detailsAt !== -1, `${name} example must collapse audit details`);
  return {
    record,
    visible: record.slice(0, detailsAt),
    audit: record.slice(detailsAt),
  };
}

function visibleWords(record) {
  return record.visible
    .replace(/<!--[\s\S]*?-->/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

const recordMarker =
  /<!-- orc-pr-review-repair run=\S+ round=\d+ kind=(?:summary|escalation) -->/;

const auditPreservations = [
  "Complete original Standards report",
  "Complete original Spec report",
  "Complete ledger",
];

for (const [name, kind] of [
  ["clean round", "summary"],
  ["repaired round", "summary"],
  ["escalated round", "escalation"],
]) {
  test(`${name} example preserves identity, audit, and bookkeeping`, () => {
    const example = recordExample(name);
    assert.match(example.record, recordMarker);
    assert.ok(
      example.record.includes(`kind=${kind} -->`),
      `${name} example marker must use kind=${kind}`,
    );
    assert.ok(
      example.record.trimEnd().endsWith("</details>"),
      `${name} example must close the collapsed audit in the same comment`,
    );
    for (const preserved of auditPreservations) {
      assert.ok(
        example.audit.includes(preserved),
        `${name} collapsed audit must preserve: ${preserved}`,
      );
    }
    assert.ok(
      /repair-start|Audit record/.test(example.audit),
      `${name} collapsed audit must retain repair links/bookkeeping`,
    );
    assert.doesNotMatch(
      example.visible,
      /\/tmp\/|\/home\//,
      `${name} visible summary must not expose local paths`,
    );
    assert.match(example.visible, /\b\d+\/10\b/, `${name} must show budget`);
  });
}

test("clean-round example is outcome-first, near 150 words, without repeated reports", () => {
  const example = recordExample("clean round");
  const outcome = example.visible.indexOf("## Review complete");
  assert.ok(outcome !== -1, "clean round must state its outcome in a heading");
  assert.ok(
    outcome < example.visible.indexOf("**Validation:"),
    "outcome must precede validation details",
  );
  const words = visibleWords(example);
  assert.ok(
    words >= 40 && words <= 160,
    `clean-round visible summary must stay near 150 words, got ${words}`,
  );
  assert.doesNotMatch(
    example.visible,
    /### Standards|### Spec|Judge ledger|Pinned base|merge-base|Tested HEAD tree/,
    "visible summary must not repeat axis reports or audit plumbing",
  );
  assert.ok(
    example.visible.includes("cached") &&
      example.visible.includes("not a fresh run"),
    "clean round must distinguish cached evidence from fresh execution",
  );
  assert.ok(
    example.visible.includes("**Scope:"),
    "material scope limitations must stay visible",
  );
  assert.ok(
    example.visible.includes("**No findings or unresolved investigations.**"),
    "clean round must report finding counts including investigations",
  );
});

test("repaired example uses stable IDs, commits, and truthful validation", () => {
  const example = recordExample("repaired round");
  assert.ok(
    (example.visible.match(/\bF-\d{3}\b/g) ?? []).length >= 2,
    "repaired round must reference stable finding IDs",
  );
  assert.match(example.visible, /`abc1234`/);
  assert.match(example.visible, /`def5678`/);
  assert.match(example.visible, /regression test/);
  assert.ok(
    example.visible.includes("cached evidence"),
    "repaired round must attribute cached validation truthfully",
  );
  assert.ok(
    example.visible.includes(
      "remained unavailable and is not counted as passing",
    ),
    "unavailable checks must not be labeled green",
  );
  const reviewed = example.visible.indexOf("**Reviewed:** `abc1234`");
  const delivered = example.visible.indexOf("**Delivered:** `def5678`");
  assert.ok(reviewed !== -1 && delivered !== -1);
  assert.ok(
    reviewed < delivered,
    "delivered head must be shown when it differs from the reviewed head",
  );
  assert.ok(
    example.audit.includes("repair-start link") ||
      example.audit.includes("Repair-start link"),
    "repaired round audit must link its repair-start record",
  );
});

test("escalated example places blockers and recovery before routine details", () => {
  const example = recordExample("escalated round");
  const decision = example.visible.indexOf("**Needs decision:**");
  const validation = example.visible.indexOf("**Validation:**");
  assert.ok(decision !== -1, "escalation must name the required decision");
  assert.ok(
    decision < validation,
    "blockers and required decisions must precede routine details",
  );
  assert.match(
    example.visible,
    /recovery action/,
    "escalation must state the specific recovery action",
  );
  assert.ok(
    example.audit.includes("awaiting human input"),
    "escalated ledger must retain the awaiting-input disposition",
  );
  assert.ok(
    example.audit.includes("incomplete-operation state") &&
      example.audit.includes("recovery input"),
    "escalated audit must retain exact operation state and recovery input",
  );
});

test("report contracts require complete collapsed audits without new storage", () => {
  for (const required of [
    "Collapsed audit details",
    "Complete original Standards and Spec reports",
    "full finding ledger",
    "Run identity, pinned refs",
    "repair-start record link",
    "delivery state and receipts",
    "incomplete-operation/recovery state",
  ]) {
    assert.ok(
      reportContracts.includes(required),
      `collapsed audit contract must require: ${required}`,
    );
  }
  assert.ok(
    reportContracts.includes(
      "Nothing is replaced by a digest, external storage, or local-file links",
    ),
    "contract must forbid digest/external/local-file substitutes",
  );
  assert.ok(
    reportContracts.includes("only as non-public audit references"),
    "local paths must be confined to non-public audit references",
  );
  assert.ok(
    reportContracts.includes(
      "never label unknown or unavailable checks as green",
    ),
    "check truthfulness requirement must be explicit",
  );
  assert.ok(
    reportContracts.includes("never move them into collapsed details"),
    "material limitations must stay out of collapsed details",
  );
  assert.ok(
    reportContracts.includes("readability target, not a hard cap"),
    "word target must remain a soft readability goal",
  );
  assert.ok(
    reportContracts.includes("kind=<repair-start|summary|escalation>"),
    "record identity marker template must be retained",
  );
  for (const reservationField of [
    "- PR / run / round:",
    "- Pinned base / merge-base:",
    "- Expected local and remote head:",
    "- Repairs used:",
    "- Authorized actionable IDs:",
    "- Intended scope:",
    "- State: repair reserved; no delivery confirmed",
  ]) {
    assert.ok(
      reportContracts.includes(reservationField),
      `repair-start reservation field must be retained: ${reservationField}`,
    );
  }
  assert.ok(
    reportContracts.includes("reservation sequencing is unchanged"),
    "repair reservation contract must remain unchanged",
  );
  assert.ok(
    reportContracts.includes(
      "report the unrecorded state directly to the user",
    ),
    "publication failure must still be disclosed",
  );
  assert.ok(
    reportContracts.includes("never invent a receipt or link"),
    "fabricated receipts must stay forbidden",
  );
});

test("skills keep concise user responses with complete internal handoffs", () => {
  assert.ok(
    prReviewSkill.includes("never discards internal stage outputs"),
    "pr-review skill must retain complete stage outputs",
  );
  assert.ok(
    prReviewSkill.includes("full ledger remains in PR history"),
    "ledger must stay in PR history, not the user response",
  );
  assert.ok(
    prReviewSkill.includes("verified PR comment link") &&
      prReviewSkill.includes("concise final response"),
    "user response must be concise with the verified PR record link",
  );
  assert.ok(
    prReviewSkill.includes("complete internal handoff"),
    "callers must still receive complete orchestration evidence",
  );
  assert.ok(
    !prReviewSkill.includes(
      "Return the final user report from Report contracts with counts, ledger",
    ),
    "skill must no longer return the full ledger to the user",
  );
  assert.ok(
    prReviewPseudocode.includes("visible summary plus collapsed audit layers"),
    "pseudocode must reference the two record layers",
  );
  assert.ok(
    prReviewPseudocode.includes(
      "POST and VERIFY escalation record when possible",
    ) &&
      prReviewPseudocode.includes(
        "REPORT missing receipts/history directly if recording fails",
      ),
    "pseudocode publication gates must be preserved",
  );
  assert.ok(
    prReviewPseudocode.includes("concise escalation summary"),
    "escalation reporting must be concise",
  );
  assert.ok(
    issueToPrSkill.includes("complete final orchestration report") &&
      issueToPrSkill.includes(
        "does not replace this internal handoff evidence",
      ),
    "caller must retain complete internal review handoff evidence",
  );
  assert.ok(
    issueToPrSkill.includes("verified PR record link"),
    "caller finish report must link the verified PR record",
  );
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
      "npm dry-run includes every packaged definition and bundled file",
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

    await t.test(
      "finalization contract text covers the required scenarios without execution",
      () => {
        const read = (...parts) =>
          readFileSync(join(installedRoot, "skills", ...parts), "utf8");
        const routeSkill = read("orc-issue-to-pr", "SKILL.md");
        const routePseudocode = read(
          "orc-issue-to-pr",
          "references",
          "pseudocode.md",
        );
        const finalization = read(
          "orc-issue-to-pr",
          "references",
          "finalization.md",
        );
        const receipts = read(
          "orc-issue-to-pr",
          "references",
          "finalization-receipts.md",
        );
        const reviewSkill = read("orc-pr-review-repair", "SKILL.md");
        const reviewPseudocode = read(
          "orc-pr-review-repair",
          "references",
          "pseudocode.md",
        );

        // Successful finalization: delegated built-in procedure, accepted
        // post-sync comparison, confirmed archival gating delivery.
        assert.match(routeSkill, /openspec-archive-change/);
        assert.match(routeSkill, /openspec-sync-specs/);
        assert.match(routeSkill, /post-sync comparison/);
        assert.match(routeSkill, /Confirm actual archival/);
        assert.match(
          finalization,
          /No separate finalizer skill and no fresh independent sync assessor/,
        );
        assert.match(routePseudocode, /CONFIRM actual archival/);
        assert.match(routePseudocode, /DO NOT dispatch delivery/);

        // No-delta changes archive without synchronization.
        assert.match(routeSkill, /no-delta path/);
        assert.match(finalization, /no-delta path/);
        assert.match(routePseudocode, /no-delta path/);

        // Rejected synchronization and archive failures pause with preserved work.
        assert.match(finalization, /synchronization conflicts/);
        assert.match(
          finalization,
          /Archive failure after completed synchronization preserves/,
        );
        assert.match(routePseudocode, /sync conflict/);
        assert.match(routePseudocode, /preserve safe work and receipts/);

        // Resume reconciles already-finalized, partial sync/archive, and
        // partially completed delivery without duplicate moves or replay.
        assert.match(receipts, /Already-finalized change/);
        assert.match(receipts, /Partial synchronization/);
        assert.match(receipts, /Partial archival/);
        assert.match(receipts, /Partially completed delivery/);
        assert.match(receipts, /duplicate archive/);
        assert.match(routePseudocode, /without moving it again/);

        // Post-archive PR repairs keep archived intent under authorization.
        assert.match(reviewSkill, /archived-intent rules/);
        assert.match(reviewSkill, /keep the change archived/);
        assert.match(reviewSkill, /require user authorization/);
        assert.match(reviewPseudocode, /archived artifacts/);
        assert.match(reviewPseudocode, /ESCALATE for user authorization/);
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
      "Pi SDK loads only explicit installed skills, including human-only skills",
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
          assert.equal(skill.disableModelInvocation, humanOnlySkills.has(name));
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
        for (const name of Object.keys(factorySkills)) {
          assert.equal(
            advertised.includes(`<name>${name}</name>`),
            !humanOnlySkills.has(name),
            `${name} advertisement must match its human-only status`,
          );
        }
      },
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
