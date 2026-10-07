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

// Distribution coverage only: no sessions, model calls, workflow dispatch,
// GitHub access, signing, or cleanup execution.
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const factorySkills = {
  "orc-openspec-groom": ["references/pseudocode.md"],
  "orc-openspec-implement": ["references/pseudocode.md"],
  "orc-openspec-verify": ["references/pseudocode.md"],
  "orc-pr-review-repair": [
    "references/pseudocode.md",
    "references/report-contracts.md",
  ],
  "orc-issue-to-pr": ["references/pseudocode.md"],
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
  const provenancePath = join(skillsRoot, "FACTORY-PROVENANCE.md");
  const provenance = readFileSync(provenancePath, "utf8");
  const licenseLinks = [...provenance.matchAll(/\[LICENSE\]\(([^)]+)\)/g)];
  assert.equal(
    licenseLinks.length,
    1,
    "provenance must link the bundled notice",
  );
  const target = licenseLinks[0][1];
  assert.ok(!isAbsolute(target), "license link must be relative");
  const licensePath = resolve(dirname(provenancePath), target);
  assertWithin(skillsRoot, licensePath);
  assertWithin(skillsRoot, realpathSync(licensePath));
  assert.equal(
    readFileSync(licensePath, "utf8"),
    readFileSync(join(repoRoot, "LICENSE"), "utf8"),
    "distributed notice must match the complete root MIT notice",
  );
}

test(
  "standalone Nix skills output contains the complete linked MIT notice",
  { skip: !process.env.PI_FACTORY_SKILLS_OUTPUT },
  () => checkFactoryNotice(process.env.PI_FACTORY_SKILLS_OUTPUT),
);

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
      "npm dry-run includes all six definitions and every bundled file",
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
      "npm ships the complete MIT notice with a resolving provenance link",
      () => {
        for (const path of ["skills/FACTORY-PROVENANCE.md", "skills/LICENSE"]) {
          assert.ok(packedPaths.has(path), `not packed: ${path}`);
        }
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

function implementationInstructions() {
  const dir = join(repoRoot, "skills", "orc-openspec-implement");
  return {
    skill: readFileSync(join(dir, "SKILL.md"), "utf8"),
    pseudocode: readFileSync(join(dir, "references", "pseudocode.md"), "utf8"),
  };
}

test("implementation instructions retain sequential task-scoped delegation", () => {
  const { skill, pseudocode } = implementationInstructions();
  assert.match(skill, /Run one task group at a time/);
  assert.match(skill, /task-scoped repository access[^\n]*not file whitelists/);
  assert.match(
    skill,
    /Resolve `openspec-apply-change` from the invoking environment/,
  );
  assert.match(
    skill,
    /immediate checkbox updates, and pause-on-technical-error rules/,
  );
  assert.match(
    pseudocode,
    /RELEASE a group only after its prerequisites are verified and bookkept/,
  );
  assert.doesNotMatch(
    pseudocode,
    /file-ownership plan|RUN independent groups concurrently|IF ownership expands/,
  );
});

test("implementation recovery and final acceptance guards remain explicit", () => {
  const { pseudocode } = implementationInstructions();
  const recovery = pseudocode.split("preparation = DELEGATE")[0];
  assert.match(
    recovery,
    /genuine design\/product\/architecture decision or external authorization/,
  );
  assert.match(recovery, /findings recur without edits or new evidence/);
  assert.match(
    recovery,
    /RETURN control and saved evidence to the main orchestrator/,
  );
  assert.match(recovery, /REQUIRE a revised brief supported by new evidence/);
  assert.match(recovery, /STOP instead of redispatching unchanged work/);
  const final = pseudocode.split("\nFinish:\n")[1];
  assert.ok(final, "final acceptance flow must be documented");
  assert.match(final, /INVALIDATE affected prior evidence/);
  assert.match(
    final,
    /IF verification failed, is incomplete, or has unresolved findings:[\s\S]*CONTINUE with repair, then fresh independent verification/,
  );
  assert.match(
    final,
    /ACCEPT replacement evidence only after complete independent verification/,
  );
  assert.match(final, /CONFIRM bookkeeping before leaving this repair loop/);
});
