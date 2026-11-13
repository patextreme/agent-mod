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
// report-presentation and review-scope contracts. No sessions, model calls,
// workflow dispatch, GitHub access, or signing. The contract tests assert the
// text of skill documentation and examples; they do not establish live model
// adherence or how GitHub renders collapsed details.
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packagedSkills = {
  "pr-review-repair": [
    "references/pseudocode.md",
    "references/report-contracts.md",
    "references/audit-publication.md",
    "references/audit-publication.mjs",
    "references/policy.md",
    "references/prepare.md",
    "references/review-scope.md",
    "references/lifecycle.md",
    "references/lifecycle.mjs",
    "references/coverage-evidence.md",
    "references/coverage-evidence.mjs",
    "references/coverage-fixtures.json",
  ],
};
const externalSkills = [
  "code-review",
  "code-review-project",
  "code-review-agents",
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
  assert.ok(
    !frontmatter["disable-model-invocation"],
    `${name} must stay model-invocable`,
  );

  // Disclosed contracts may link resources transitively rather than bloating
  // SKILL.md with every helper. Require reachability from its actual links.
  const linked = new Set([skillPath]);
  const documents = [skillPath];
  for (const document of documents) {
    for (const target of localMarkdownTargets(readFileSync(document, "utf8"))) {
      const destination = resolve(
        dirname(document),
        decodeURIComponent(target.split(/[?#]/)[0]),
      );
      assertWithin(skillDir, destination);
      if (linked.has(destination)) continue;
      linked.add(destination);
      if (destination.endsWith(".md")) documents.push(destination);
    }
  }
  for (const reference of references) {
    assert.ok(
      linked.has(join(skillDir, reference)),
      `${name} must reference ${reference} directly or transitively`,
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

function checkSkillNotice(skillsRoot) {
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
  { skip: !process.env.PI_SKILLS_OUTPUT },
  () => checkSkillNotice(process.env.PI_SKILLS_OUTPUT),
);

// --- pr-review-repair contract: capped discovery, verification, records ------

const reportContracts = readFileSync(
  join(repoRoot, "skills/pr-review-repair/references/report-contracts.md"),
  "utf8",
);
const prReviewSkill = readFileSync(
  join(repoRoot, "skills/pr-review-repair/SKILL.md"),
  "utf8",
);
const prReviewPseudocode = readFileSync(
  join(repoRoot, "skills/pr-review-repair/references/pseudocode.md"),
  "utf8",
);
const repairPolicy = readFileSync(
  join(repoRoot, "skills/pr-review-repair/references/policy.md"),
  "utf8",
);
const preparationContract = readFileSync(
  join(repoRoot, "skills/pr-review-repair/references/prepare.md"),
  "utf8",
);
const reviewScope = readFileSync(
  join(repoRoot, "skills/pr-review-repair/references/review-scope.md"),
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
  /<!-- pr-review-repair run=\S+ round=\d+ kind=(?:summary|escalation) -->/;

const auditPreservations = [
  "Complete original Standards report",
  "Complete original Spec report",
  "Complete ledger",
];

for (const [name, kind] of [
  ["clean round", "summary"],
  ["repaired round", "summary"],
  ["capped round", "summary"],
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
    assert.doesNotMatch(
      example.visible,
      /\/tmp\/|\/home\//,
      `${name} visible summary must not expose local paths`,
    );
    assert.match(
      example.visible,
      /Rounds:\*\* \d\/3/,
      `${name} must show the three-round window`,
    );
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
  assert.ok(
    example.visible.includes("Discovery converged in round one"),
    "a converged round must state that no further rounds run",
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
    example.visible.includes("In progress"),
    "a mid-window repair round is in progress",
  );
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
});

test("capped example reports only out-of-scope deferred findings and closed discovery", () => {
  const example = recordExample("capped round");
  assert.match(
    example.visible,
    /## Review complete — limited coverage/,
    "a capped run finishes as limited coverage",
  );
  assert.ok(
    example.visible.includes(
      "Deferred (repair-worthy, outside this PR's scope):",
    ),
    "deferred findings must be listed visibly with their PR-scope test",
  );
  assert.ok(
    example.visible.includes("F-005") && !example.visible.includes("F-006"),
    "only repair-worthy out-of-scope findings are enumerated; report-only findings stay in the audit",
  );
  assert.ok(
    example.visible.includes("no fourth review round"),
    "the visible summary must state the closed-window limitation",
  );
  assert.match(example.visible, /Deferred:\*\* 1/);
  assert.match(example.visible, /Report-only:\*\* 1/);
  assert.ok(
    example.audit.includes("deferred (verification-sourced, never repaired"),
    "the ledger must record deferred dispositions as never repaired",
  );
  assert.ok(
    example.audit.includes("F-006 report-only"),
    "report-only findings stay in the collapsed audit ledger",
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
    /recovery action/i,
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
    "delivery state and receipts",
    "Nothing is replaced by a digest, external storage, or local-file links",
    "only as non-public audit references",
    "never label unknown or unavailable checks as green",
    "never move them into collapsed details",
    "readability target, not a hard cap",
    "kind=<summary|escalation>",
    "report the unrecorded state directly to the user",
    "never invent a receipt or link",
    "`Rounds: n/3`",
    "`Repair cycles: n`",
  ]) {
    assert.ok(
      reportContracts.includes(required),
      `report contract must require: ${required}`,
    );
  }
  for (const retired of [
    "repair-start",
    "scope-amendment",
    "n/10",
    "ten attempts",
    "coverage chain",
  ]) {
    for (const [file, content] of [
      ["SKILL.md", prReviewSkill],
      ["references/report-contracts.md", reportContracts],
      ["references/pseudocode.md", prReviewPseudocode],
      ["references/policy.md", repairPolicy],
      ["references/prepare.md", preparationContract],
      ["references/review-scope.md", reviewScope],
    ]) {
      assert.ok(
        !content.includes(retired),
        `retired accounting must not survive in ${file}: ${retired}`,
      );
    }
  }
});

test("skills keep concise user responses with complete internal handoffs", () => {
  assert.ok(
    prReviewSkill.includes("Preserve complete stage outputs"),
    "pr-review skill must retain complete stage outputs",
  );
  assert.ok(
    prReviewSkill.includes("ledger stays in PR history"),
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
    reportContracts.includes(
      "Keep the full reports/ledger in PR history and the internal handoff",
    ),
    "complete reports must stay in durable history and internal handoffs",
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
        "REPORT missing receipts directly if recording fails",
      ),
    "pseudocode publication gates must be preserved",
  );
  assert.ok(
    prReviewPseudocode.includes("concise escalation summary"),
    "escalation reporting must be concise",
  );
});

// Static documentation guards, not executable proof of agent control flow.
test("discovery is capped at three full review rounds", () => {
  assert.ok(prReviewSkill.includes("./references/review-scope.md"));
  assert.ok(
    prReviewSkill.includes("Discovery is capped at three full review rounds"),
    "skill must state the discovery cap up front",
  );
  assert.ok(
    prReviewPseudocode.includes("window = 3") &&
      prReviewPseudocode.includes("IF rounds < window OR state.roundPending:"),
    "control flow must gate discovery on the round window",
  );
  assert.ok(
    prReviewPseudocode.includes("IF rounds < window OR state.roundPending:") &&
      prReviewPseudocode.includes("no fourth review ever runs"),
    "a converged round must finish rather than start another",
  );
  assert.ok(
    reviewScope.includes("there is no delta or changed-lines-only review"),
    "review scope must drop delta mode explicitly",
  );
  assert.ok(
    reviewScope.includes("the entire PR diff from the pinned merge-base"),
    "every discovery round reviews the full PR diff",
  );
  for (const retired of ["last-reviewed-sha", "Delta eligibility"]) {
    assert.ok(
      !reviewScope.includes(retired),
      `review scope must not retain delta machinery: ${retired}`,
    );
  }
  assert.ok(
    !prReviewPseudocode.includes("mode = DELTA") &&
      !prReviewPseudocode.includes("SCOPE-AMENDMENT"),
    "delta and amendment branches must be gone from the control flow",
  );
});

test("verification fixes recorded IDs and classifies everything else", () => {
  assert.ok(
    prReviewSkill.includes(
      "confirms, denies, or regresses; it never discovers",
    ),
    "skill must state the verification boundary",
  );
  for (const requirement of [
    "Verification **confirms, denies, or regresses; it never discovers.**",
    "does the current head resolve each open ID, keep every resolved ID resolved, and did the fix break what it touched?",
    "**Resolved:**",
    "**Unresolved:**",
    "**Regression:**",
    "**New issue:**",
    "Never repaired after the window",
    "a check failure traceable to a repair commit is a regression, not a deferral",
  ]) {
    assert.ok(reviewScope.includes(requirement), requirement);
  }
  assert.ok(
    prReviewPseudocode.includes(
      "NEW ISSUE  -> never repair; classify under Review scope and Repair policy:",
    ) &&
      prReviewPseudocode.includes(
        "repair-worthy AND out of this PR's scope -> add to deferred",
      ),
    "new work must be classified by importance and scope, not repaired",
  );
  assert.ok(
    prReviewPseudocode.includes("REGRESSION -> keep the ID open"),
    "a fix-induced regression keeps its ID open",
  );
  assert.ok(
    prReviewPseudocode.includes(
      "VERIFY every recorded ID at the current head",
    ) && reviewScope.includes("keep every resolved ID resolved"),
    "verification must re-check resolved IDs so a later fix cannot undo one",
  );
  assert.ok(
    reviewScope.includes("the recorded IDs (open and already resolved)"),
    "the verifier brief must include resolved IDs, or it cannot check that they stayed resolved",
  );
  assert.ok(
    repairPolicy.includes("A previously resolved ID regressed"),
    "reopening a resolved ID belongs to the repair threshold, not deferral",
  );
  for (const requirement of [
    "## Closed discovery",
    "repair only IDs already open and classify everything else",
    "Deferred findings are posted, never silently dropped",
    "Deferral is a recording decision, not a human-input branch",
  ]) {
    assert.ok(repairPolicy.includes(requirement), requirement);
  }
  assert.ok(
    reportContracts.includes("## Deferred findings") &&
      reportContracts.includes("never blocks a `limited coverage` finish"),
    "deferred findings need a recording contract that does not block finishing",
  );
});

test("stalls escalate without reopening discovery", () => {
  assert.ok(
    prReviewPseudocode.includes(
      "stalled >= 2 OR any open ID has failed verification 3 times",
    ),
    "the fix loop needs a progress guard",
  );
  assert.ok(
    prReviewPseudocode.includes(
      "verification_failures = per-ID failed verification counts",
    ),
    "the per-ID failed-verification guard needs a declared counter to evaluate",
  );
  assert.ok(
    prReviewPseudocode.includes("lost at least one ID this cycle"),
    "progress must require a net loss of open IDs so alternating regressions stall",
  );
  assert.ok(
    prReviewPseudocode.includes(
      "Deferred findings never justify another review round or an escalation",
    ),
    "deferral must not become an escalation trigger",
  );
  assert.ok(
    prReviewSkill.includes(
      "never repaired — escalate them before the window closes",
    ),
    "unrelated check failures must escalate inside the window and stay a limitation after it",
  );
  assert.ok(
    prReviewSkill.includes("A resume never restarts the review window"),
    "resumes must not reopen discovery",
  );
  assert.ok(
    prReviewPseudocode.includes(
      "a clean verification is `limited coverage`, not `verified`",
    ),
    "capped runs must not claim verification",
  );
  for (const outcome of [
    "**`verified`**",
    "**`limited coverage`**",
    "**`escalated`**",
  ]) {
    assert.ok(prReviewSkill.includes(outcome), `skill must define ${outcome}`);
  }
  assert.ok(
    !prReviewSkill.includes("ten attempts") &&
      !prReviewSkill.includes("repairs used"),
    "the numeric repair budget must not survive",
  );
});

test("incremental reviews preserve checks and reuse rules", () => {
  assert.ok(
    reviewScope.includes(
      "matching source, configuration, dependencies, and relevant environment",
    ),
  );
  assert.ok(
    reviewScope.includes(
      "Rerun affected checks and every required check without matching evidence",
    ),
  );
  assert.ok(
    reviewScope.includes(
      "Every reviewer and verifier still reads required sources",
    ),
  );
  assert.ok(
    preparationContract.includes("sticky contract") &&
      preparationContract.includes("paginated comments") &&
      preparationContract.includes("Unpublished commits"),
    "preparation contract must keep setup and reconciliation requirements",
  );
  assert.ok(
    preparationContract.includes("per-ID failed-verification counts"),
    "preparation must recover the guard's per-ID verification failures",
  );
  assert.ok(
    preparationContract.includes("coverage limitation"),
    "an authorized missing issue/spec must be reported as a coverage limitation",
  );
  assert.ok(
    preparationContract.includes("[review scope](./review-scope.md)"),
    "preparation must defer reuse and state recovery to review scope",
  );
  assert.ok(
    repairPolicy.includes("## Repair threshold") &&
      repairPolicy.includes("## Human input"),
    "repair policy must keep thresholds and human-input rules",
  );
  assert.ok(
    prReviewSkill.includes("./references/policy.md") &&
      prReviewSkill.includes("./references/prepare.md"),
    "skill must disclose detailed policy and preparation contracts",
  );
});

function seedDefaultSkill(dir, name) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, name, "SKILL.md"),
    `---\nname: ${name}\ndescription: Default-resource isolation canary.\n---\nNot a packaged skill.\n`,
  );
}

test("packaged skills are self-contained, discoverable without defaults, and ship their notice", async (t) => {
  const tempRoot = mkdtempSync(join(tmpdir(), "pi-skills-"));
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
        for (const [name, references] of Object.entries(packagedSkills)) {
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
        checkSkillNotice(join(installedRoot, "skills"));
      },
    );

    for (const [name, references] of Object.entries(packagedSkills)) {
      await t.test(
        `${name}: portable metadata and installed reference links`,
        () => {
          checkInstalledSkill(installedRoot, name, references);
        },
      );
    }

    await t.test("Pi SDK loads only explicit installed skills", () => {
      const cwd = join(tempRoot, "project");
      const agentDir = join(tempRoot, "agent");
      mkdirSync(cwd, { recursive: true });
      mkdirSync(agentDir, { recursive: true });
      // Deliberately valid defaults: excluding them must not depend on an
      // empty machine, the user's home, or this repository's .pi directory.
      seedDefaultSkill(join(agentDir, "skills"), "code-review");
      seedDefaultSkill(join(cwd, ".pi", "skills"), "code-review-project");
      seedDefaultSkill(join(cwd, ".agents", "skills"), "code-review-agents");
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
      for (const [name, references] of Object.entries(packagedSkills)) {
        const skill = byName.get(name);
        assert.ok(skill, `Pi did not discover ${name}`);
        assert.equal(
          skill.filePath,
          join(installedRoot, "skills", name, "SKILL.md"),
        );
        assert.equal(skill.baseDir, dirname(skill.filePath));
        assertWithin(installedRoot, realpathSync(skill.filePath));
        assert.ok(
          !skill.disableModelInvocation,
          `${name} must stay model-invocable`,
        );
        for (const reference of references) {
          assert.ok(lstatSync(join(skill.baseDir, reference)).isFile());
        }
      }
      for (const name of externalSkills) {
        assert.ok(
          !byName.has(name),
          `external/default skill unexpectedly loaded: ${name}`,
        );
      }
      for (const skill of skills)
        assertWithin(installedRoot, realpathSync(skill.filePath));
      const advertised = formatSkillsForPrompt(skills);
      for (const name of Object.keys(packagedSkills)) {
        assert.ok(
          advertised.includes(`<name>${name}</name>`),
          `${name} must be advertised`,
        );
      }
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
