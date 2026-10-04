import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type TestContext, test } from "node:test";
import type {
  AgentSessionConfig,
  DefaultResourceLoader,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { LocalTarget } from "../shared/local-target.js";
import { type Authorization, type Snapshot, verifyPrompt } from "./helpers.js";

const verifySkill = resolve(
  process.cwd(),
  ".pi/skills/openspec-verify-change/SKILL.md",
);
const verifyCommand = "/skill:openspec-verify-change";
const globalBody =
  "SAME-NAME GLOBAL VERIFIER MUST NOT WIN THE PINNED INVOCATION";
type Agent = AgentSessionConfig["agent"];
type Messages = Agent["state"]["messages"];

// Only the downstream agent/auth boundary is fake. Pi's resource discovery,
// file reading and AgentSession.prompt native expansion are real; no provider
// or model API is available to this capture-only agent.
async function capturingSession(
  t: TestContext,
  cwd: string,
  resourceLoader: DefaultResourceLoader,
  settingsManager: SettingsManager,
) {
  // Pi is ESM-only; dynamic imports work under the repository's CJS tsx tests.
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
  return async (text: string, expandPromptTemplates = true) => {
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
  };
}

async function fixture(t: TestContext) {
  const {
    DefaultResourceLoader,
    loadSkills,
    SettingsManager,
    stripFrontmatter,
  } = await import("@earendil-works/pi-coding-agent");
  const cwd = await mkdtemp(join(tmpdir(), "verify-native-skills-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  assert.notEqual(cwd, process.cwd());
  const agentDir = join(cwd, "agent");
  const globalSkill = join(agentDir, "skills/openspec-verify-change/SKILL.md");
  await mkdir(dirname(globalSkill), { recursive: true });
  await writeFile(
    globalSkill,
    `---\nname: openspec-verify-change\ndescription: Shadowing global skill for regression testing.\n---\n\n${globalBody}\n`,
  );
  // Normal discovery would select the same-named global skill first. The
  // absolute pin must exclude it, rather than depend on discovery precedence.
  const unpinned = loadSkills({
    cwd,
    agentDir,
    skillPaths: [verifySkill],
    includeDefaults: true,
  });
  assert.equal(unpinned.skills[0]?.filePath, globalSkill);
  assert.ok(
    unpinned.diagnostics.some(
      (diagnostic) =>
        diagnostic.type === "collision" &&
        diagnostic.collision?.winnerPath === globalSkill &&
        diagnostic.collision.loserPath === verifySkill,
    ),
  );
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    additionalSkillPaths: [verifySkill],
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  assert.deepEqual(loader.getSkills().diagnostics, []);
  assert.deepEqual(
    loader.getSkills().skills.map((skill) => skill.filePath),
    [verifySkill],
  );
  const original = await readFile(verifySkill, "utf8");
  t.after(async () =>
    assert.equal(await readFile(verifySkill, "utf8"), original),
  );
  const target: LocalTarget = {
    cwd,
    changeId: "example-change",
    changeRoot: join(cwd, "openspec/changes/example-change"),
    status: { schemaName: "spec-driven" },
  };
  const current: Snapshot = {
    status: target.status,
    instructions: {
      state: "all_done",
      contextFiles: {
        tasks: [join(target.changeRoot, "tasks.md")],
        specs: [join(target.changeRoot, "specs/example/spec.md")],
      },
      instruction: 'Preserve "quoted" context.\nUnicode: café.',
    },
    state: "all_done",
    tasks: [{ id: "1.1", description: "Complete implementation", done: true }],
  };
  return {
    prompt: await capturingSession(t, cwd, loader, settingsManager),
    body: stripFrontmatter(original).trim(),
    target,
    current,
  };
}

async function assertSkillExpansion(expanded: string, body: string) {
  const { parseSkillBlock } = await import("@earendil-works/pi-coding-agent");
  const block = parseSkillBlock(expanded);
  assert.ok(
    block,
    "Pi must dispatch a native <skill> block, not a slash command",
  );
  assert.equal(block.name, "openspec-verify-change");
  assert.equal(block.location, verifySkill);
  assert.equal(
    block.content,
    `References are relative to ${dirname(verifySkill)}.\n\n${body}`,
  );
  assert.ok(!expanded.includes(globalBody));
  return block;
}

test("flow verifier natively expands the pinned skill and preserves the full read-only policy/context", async (t) => {
  const f = await fixture(t);
  const steering: Authorization[] = [
    {
      resolution: {
        id: "design-choice",
        findingIds: ["warning-design"],
        issue: "Implementation differs from the approved design",
        recommendation: "Keep the approved contract",
        scope: "Only the named design/implementation mismatch",
        paths: [join(f.target.cwd, "src/example.ts")],
        escalation: true,
        reason: "Materially different design alternatives",
      },
      answer: 'Keep "A".\nPreserve scoped intent: café. Do not choose B.',
    },
  ];
  for (const guidance of [[], steering]) {
    const prompt = verifyPrompt(f.target, f.current, guidance);
    assert.equal(
      prompt.split("\n")[0],
      `${verifyCommand} ${f.target.changeId}`,
    );
    const args = prompt.slice(verifyCommand.length + 1);
    assert.ok(args.startsWith(`${f.target.changeId}\n`));
    assert.match(args, /read[- ]only/i);
    assert.ok(args.includes(f.target.changeRoot));
    assert.ok(args.includes(JSON.stringify(f.current)));
    assert.ok(args.includes(JSON.stringify(guidance)));
    const block = await assertSkillExpansion(await f.prompt(prompt), f.body);
    // This exact comparison catches lost newlines/context, truncation, and policy
    // accidentally inserted into the generated skill instead of its user input.
    assert.equal(block.userMessage, args);
    assert.notEqual(block.userMessage, f.target.changeId);
  }
});

test("ordinary native verification retains the unchanged skill body without flow policy", async (t) => {
  const f = await fixture(t);
  assert.match(f.body, /Ready for archive \(with noted improvements\)/);
  assert.match(f.body, /Always note which checks were skipped and why/);
  for (const args of [
    "",
    f.target.changeId,
    `${f.target.changeId}\n\nReview the existing implementation.\nPreserve "quoted" context: café.`,
  ]) {
    const input = args ? `${verifyCommand} ${args}` : verifyCommand;
    const block = await assertSkillExpansion(await f.prompt(input), f.body);
    assert.equal(block.userMessage, args || undefined);
  }
});

test("disabled native expansion and unknown skills pass through unchanged", async (t) => {
  const { parseSkillBlock } = await import("@earendil-works/pi-coding-agent");
  const f = await fixture(t);
  const input = verifyPrompt(f.target, f.current, []);
  const disabled = await f.prompt(input, false);
  assert.equal(disabled, input);
  assert.equal(parseSkillBlock(disabled), null);
  const unknown =
    "/skill:not-installed example-change\n\nPreserve this request.";
  assert.equal(await f.prompt(unknown), unknown);
});
