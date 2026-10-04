import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { type TestContext, test } from "node:test";
import type {
  AgentSessionConfig,
  DefaultResourceLoader,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { type Assessment, type Target, updatePrompt } from "./groom.js";

const reviewSkill = resolve(process.cwd(), "skills/openspec-review/SKILL.md");
const ordinaryUpdateSkill = resolve(
  process.cwd(),
  ".pi/skills/openspec-update-change/SKILL.md",
);
const reviewCommand = "/skill:openspec-review";
const ordinaryUpdateCommand = "/skill:openspec-update-change";
const authorizationHeader =
  "OPENSpec GROOMING AUTHORIZATION (current cycle only)";
const globalBody = "SAME-NAME GLOBAL SKILL MUST NOT WIN THE PINNED INVOCATION";
type Agent = AgentSessionConfig["agent"];
type Messages = Agent["state"]["messages"];

// Only the downstream agent and auth boundary are fake. AgentSession.prompt,
// DefaultResourceLoader, skill-file reading, and native expansion are real.
// Capture the dispatched messages before any model/provider can be invoked.
async function capturingSession(
  t: TestContext,
  cwd: string,
  resourceLoader: DefaultResourceLoader,
  settingsManager: SettingsManager,
) {
  // Pi is ESM-only; dynamic import also works under this repo's CJS tsx tests.
  const { AgentSession, SessionManager } = await import(
    "@earendil-works/pi-coding-agent"
  );
  const dispatched: Messages[] = [];
  const agent = {
    state: {
      model: { provider: "model-free-test", id: "capture-only" },
      thinkingLevel: "off",
      messages: [],
      tools: [],
      isStreaming: false,
    },
    subscribe: () => () => {},
    abort: () => {},
    hasQueuedMessages: () => false,
    prompt: async (messages: Messages) => {
      assert.ok(Array.isArray(messages));
      dispatched.push(messages);
    },
    continue: async () => {
      assert.fail("Skill expansion must not start a continuation");
    },
  };
  const session = new AgentSession({
    cwd,
    agent: agent as unknown as Agent,
    // Satisfy prompt preflight locally; this object has no provider/stream API.
    modelRuntime: {
      hasConfiguredAuth: () => true,
    } as unknown as AgentSessionConfig["modelRuntime"],
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    initialActiveToolNames: [],
    baseToolsOverride: {},
  });
  t.after(() => session.dispose());
  return {
    session,
    async prompt(text: string, expandPromptTemplates = true) {
      const previous = dispatched.length;
      await session.prompt(text, { expandPromptTemplates, source: "rpc" });
      assert.equal(dispatched.length, previous + 1);
      const users = dispatched
        .at(-1)
        ?.filter((message) => message.role === "user");
      assert.equal(users?.length, 1);
      const user = users?.[0];
      assert.ok(user?.role === "user");
      assert.ok(Array.isArray(user.content));
      assert.equal(user.content.length, 1);
      const content = user.content[0];
      assert.equal(content.type, "text");
      assert.ok(content.type === "text");
      return content.text;
    },
  };
}

async function fixture(t: TestContext, skill = reviewSkill) {
  const {
    DefaultResourceLoader,
    loadSkills,
    SettingsManager,
    stripFrontmatter,
  } = await import("@earendil-works/pi-coding-agent");
  const cwd = await mkdtemp(join(tmpdir(), "groom-native-skills-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const agentDir = join(cwd, "agent");
  if (skill === reviewSkill) {
    const globalSkill = join(agentDir, "skills/openspec-review/SKILL.md");
    await mkdir(dirname(globalSkill), { recursive: true });
    await writeFile(
      globalSkill,
      `---\nname: openspec-review\ndescription: Shadowing global skill for regression testing.\n---\n\n${globalBody}\n`,
    );
    // Only review is pinned by grooming. Normal discovery would select the
    // global skill first; the pin must exclude it, not rely on precedence.
    const unpinned = loadSkills({
      cwd,
      agentDir,
      skillPaths: [reviewSkill],
      includeDefaults: true,
    });
    assert.equal(unpinned.skills[0]?.filePath, globalSkill);
    assert.ok(
      unpinned.diagnostics.some(
        (diagnostic) =>
          diagnostic.type === "collision" &&
          diagnostic.collision?.winnerPath === globalSkill &&
          diagnostic.collision.loserPath === reviewSkill,
      ),
    );
  }
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  // Grooming loads only review; ordinary update gets a separate loader.
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    additionalSkillPaths: [skill],
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  assert.deepEqual(loader.getSkills().diagnostics, []);
  assert.deepEqual(
    loader.getSkills().skills.map((skill) => skill.filePath),
    [skill],
  );
  const body = stripFrontmatter(await readFile(skill, "utf8")).trim();
  const target: Target = {
    cwd,
    changeId: "example",
    changeRoot: join(cwd, "openspec/changes/example"),
    artifacts: [join(cwd, "openspec/changes/example/custom.md")],
  };
  return {
    ...(await capturingSession(t, cwd, loader, settingsManager)),
    body,
    target,
  };
}

async function assertSkillExpansion(
  expanded: string,
  body: string,
  skill = reviewSkill,
) {
  const { parseSkillBlock } = await import("@earendil-works/pi-coding-agent");
  const block = parseSkillBlock(expanded);
  assert.ok(
    block,
    "Pi must dispatch a native <skill> block, not a slash command",
  );
  assert.equal(block.name, basename(dirname(skill)));
  assert.equal(block.location, skill);
  assert.equal(
    block.content,
    `References are relative to ${dirname(skill)}.\n\n${body}`,
  );
  assert.ok(!expanded.includes(globalBody));
  return block;
}

test("native review expansion keeps the pinned project body and only the change ID", async (t) => {
  const f = await fixture(t);
  const block = await assertSkillExpansion(
    await f.prompt(`${reviewCommand} ${f.target.changeId}`),
    f.body,
  );
  assert.equal(block.userMessage, f.target.changeId);
  assert.ok(!block.userMessage.includes(authorizationHeader));
});

test("standalone updater passes through the full current-cycle authorization without skill expansion", async (t) => {
  const { parseSkillBlock } = await import("@earendil-works/pi-coding-agent");
  const f = await fixture(t);
  // Two invocations exercise autonomous structural repairs and mixed Critical
  // repairs requiring steering, with distinct JSON so stale-cycle leakage fails.
  for (const route of ["autonomous", "steering"] as const) {
    const assessment: Assessment = {
      route,
      missingArtifacts: [],
      resolutions: [
        {
          id: `${route}-structural`,
          issue: "Existing scenario heading is malformed",
          recommendation: "Repair only the heading;\npreserve dirty edits",
          escalation: false,
          paths: f.target.artifacts,
        },
        ...(route === "steering"
          ? [
              {
                id: "critical-choice",
                issue: "Critical contradiction with established product intent",
                recommendation:
                  'Keep the existing "A" contract\nDo not choose B',
                escalation: true,
                paths: f.target.artifacts,
              },
            ]
          : []),
      ],
    };
    const steering: Record<string, string> =
      route === "steering"
        ? {
            "critical-choice":
              'Keep A.\nPreserve "quoted" intent and Unicode: café.',
          }
        : {};
    const prompt = updatePrompt(f.target, assessment, steering);
    const dispatched = await f.prompt(prompt);
    assert.equal(dispatched, prompt);
    assert.equal(parseSkillBlock(dispatched), null);
    assert.ok(!dispatched.includes("<skill"));
    assert.ok(!dispatched.includes(ordinaryUpdateCommand));
    assert.ok(!dispatched.includes(globalBody));
    const lines = dispatched.split("\n");
    assert.equal(lines[0], "OpenSpec grooming updater for example");
    assert.equal(lines[1], "");
    assert.equal(lines[2], authorizationHeader);
    assert.deepEqual(JSON.parse(lines[3]), {
      changeId: f.target.changeId,
      resolutions: assessment.resolutions,
      steering,
      existingArtifactAllowlist: f.target.artifacts,
    });
    assert.match(
      dispatched,
      /Apply only these assessed structural or Critical repairs together/,
    );
    assert.match(
      dispatched,
      /No new files, unrelated edits, implementation changes/,
    );
    assert.match(dispatched, /tool permission overrides/);
    assert.match(dispatched, /Preserve existing dirty edits/);
    assert.match(dispatched, /Stop if a required artifact is missing/);
    assert.match(dispatched, /schema-resolved artifactPaths/);
    assert.match(dispatched, /openspec instructions <artifact-id>/);
    assert.match(dispatched, /Reject invalid scope, incomplete steering/);
    assert.match(dispatched, /without additional per-artifact confirmations/);
  }
});

test("ordinary native skill invocations retain confirmations without injecting grooming authorization", async (t) => {
  const f = await fixture(t, ordinaryUpdateSkill);
  assert.match(f.body, /Confirm and apply, one artifact at a time/);
  assert.match(f.body, /Write only after the user confirms/);
  for (const args of [
    "",
    "example",
    "example\n\nReconcile the existing plan.\nAsk before writing.",
  ]) {
    const prompt = args
      ? `${ordinaryUpdateCommand} ${args}`
      : ordinaryUpdateCommand;
    const block = await assertSkillExpansion(
      await f.prompt(prompt),
      f.body,
      ordinaryUpdateSkill,
    );
    assert.match(block.content, /Confirm and apply, one artifact at a time/);
    assert.match(block.content, /Write only after the user confirms/);
    assert.ok(!block.content.includes(authorizationHeader));
    assert.equal(block.userMessage, args || undefined);
    assert.ok(!block.userMessage?.includes(authorizationHeader));
  }
});

test("native prompt passthrough remains available for disabled expansion and unknown skills", async (t) => {
  const f = await fixture(t);
  const ordinary = `${reviewCommand} example\n\nPreserve this request.`;
  assert.equal(await f.prompt(ordinary, false), ordinary);
  const unknown = "/skill:not-installed example\n\nPreserve this request.";
  assert.equal(await f.prompt(unknown), unknown);
});
