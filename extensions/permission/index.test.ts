import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { PERMISSION_RULES } from "./rules.js";

// The bell is silent when PI_NO_BELL is set; it is read once at module load.
// Set it before importing so no test ever spawns pw-play. The import lives in
// a `before` hook because this package's CommonJS output cannot use
// top-level await.
process.env.PI_NO_BELL = "1";

let permissionExtension: (pi: ExtensionAPI) => void;

before(async () => {
  ({ default: permissionExtension } = await import("./index.js"));
});

const BLOCKED = "herdr:blocked";

interface Emitted {
  channel: string;
  data: unknown;
}

interface SelectCall {
  message: string;
  choices: string[];
  emittedAtCall: number;
}

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type CommandHandler = (args: string, ctx: ExtensionContext) => unknown;

interface Harness {
  emitted: Emitted[];
  handlers: Map<string, Handler[]>;
  selectCalls: SelectCall[];
  ctx: ExtensionContext;
  runTool(command: string): Promise<unknown>;
  runCommand(name: string, args?: string): Promise<unknown>;
}

function handlerFor(harness: Harness, name: string): Handler {
  const handler = harness.handlers.get(name)?.[0];
  assert.ok(handler, `expected a ${name} handler to be registered`);
  return handler;
}

function createHarness(options: {
  select?: (message: string, choices: string[]) => string | undefined;
  hasUI?: boolean;
  yoloPinned?: boolean;
  sandbox?: boolean;
}): Harness {
  const emitted: Emitted[] = [];
  const selectCalls: SelectCall[] = [];
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, CommandHandler>();

  const ctx = {
    hasUI: options.hasUI ?? true,
    ui: {
      select: async (message: string, choices: string[]) => {
        selectCalls.push({
          message,
          choices,
          emittedAtCall: emitted.length,
        });
        return options.select?.(message, choices);
      },
      setStatus: () => {},
      notify: () => {},
      theme: { fg: (_color: string, text: string) => text },
    },
  } as unknown as ExtensionContext;

  const pi = {
    events: {
      emit(channel: string, data: unknown) {
        emitted.push({ channel, data });
      },
      on: () => () => {},
    },
    registerFlag: () => {},
    getFlag: (name: string) =>
      name === "yolo" ? (options.yoloPinned ?? false) : undefined,
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerCommand(
      name: string,
      definition: { handler: CommandHandler },
    ): void {
      commands.set(name, definition.handler);
    },
  };

  const previousSandbox = process.env.PI_SANDBOX;
  process.env.PI_SANDBOX = options.sandbox ? "true" : "false";
  try {
    permissionExtension(pi as unknown as ExtensionAPI);
  } finally {
    if (previousSandbox === undefined) {
      delete process.env.PI_SANDBOX;
    } else {
      process.env.PI_SANDBOX = previousSandbox;
    }
  }

  const harness: Harness = {
    emitted,
    handlers,
    selectCalls,
    ctx,
    async runTool(command: string) {
      return handlerFor(harness, "tool_call")(
        { type: "tool_call", toolName: "bash", input: { command } },
        ctx,
      );
    },
    async runCommand(name: string, args = "") {
      const handler = commands.get(name);
      assert.ok(handler, `expected command ${name} to be registered`);
      return handler(args, ctx);
    },
  };
  return harness;
}

function blockedPair(label: string): Emitted[] {
  return [
    { channel: BLOCKED, data: { active: true, label } },
    { channel: BLOCKED, data: { active: false } },
  ];
}

function activeLabel(harness: Harness): unknown {
  const active = harness.emitted[0];
  assert.ok(active, "expected an active blocked event");
  assert.equal(active.channel, BLOCKED);
  const data = active.data as { active?: unknown; label?: unknown };
  assert.equal(data.active, true);
  return data.label;
}

describe("permission blocked signal", () => {
  it("brackets an ask-rule prompt with the Herdr blocked event pair", async () => {
    const harness = createHarness({ select: () => "Yes" });

    const result = await harness.runTool("git push origin main");

    assert.equal(result, undefined);
    assert.deepEqual(
      harness.emitted,
      blockedPair("permission: git push origin main"),
    );
    assert.equal(harness.selectCalls.length, 1);
    assert.equal(
      harness.selectCalls[0]?.emittedAtCall,
      1,
      "the active event must be emitted before the prompt opens",
    );
  });

  it("releases the blocked signal when the user picks Always allow", async () => {
    const harness = createHarness({ select: () => "Always allow" });

    const result = await harness.runTool("git push origin main");

    assert.equal(result, undefined);
    assert.deepEqual(
      harness.emitted,
      blockedPair("permission: git push origin main"),
    );
  });

  it("does not prompt or emit again for an always-allowed rule", async () => {
    const harness = createHarness({ select: () => "Always allow" });
    await harness.runTool("git push origin main");
    harness.emitted.length = 0;

    const result = await harness.runTool("git push origin main");

    assert.equal(result, undefined);
    assert.deepEqual(harness.emitted, []);
    assert.equal(harness.selectCalls.length, 1);
  });

  it("releases the blocked signal before returning a denial", async () => {
    const harness = createHarness({ select: () => "No" });

    const result = await harness.runTool("git push origin main");

    assert.deepEqual(result, {
      block: true,
      reason: "User denied command: git push origin main",
    });
    assert.deepEqual(
      harness.emitted,
      blockedPair("permission: git push origin main"),
    );
  });

  it("releases the blocked signal when the prompt throws", async () => {
    const harness = createHarness({
      select: () => {
        throw new Error("prompt aborted");
      },
    });

    await assert.rejects(
      harness.runTool("git push origin main"),
      /prompt aborted/,
    );
    assert.deepEqual(
      harness.emitted,
      blockedPair("permission: git push origin main"),
    );
  });

  it("brackets the unmatched-command prompt", async () => {
    const harness = createHarness({ select: () => "Yes" });

    const result = await harness.runTool("echo hello");

    assert.equal(result, undefined);
    assert.deepEqual(harness.emitted, blockedPair("permission: echo hello"));
  });

  it("releases the blocked signal when the unmatched prompt is denied", async () => {
    const harness = createHarness({ select: () => "No" });

    const result = await harness.runTool("echo hello");

    assert.deepEqual(result, {
      block: true,
      reason: "User denied command: echo hello",
    });
    assert.deepEqual(harness.emitted, blockedPair("permission: echo hello"));
  });

  it("does not emit for an allow rule", async () => {
    const harness = createHarness({ select: () => "Yes" });

    await harness.runTool("gh pr view 42");

    assert.deepEqual(harness.emitted, []);
    assert.equal(harness.selectCalls.length, 0);
  });

  it("does not emit for a deny rule", async () => {
    PERMISSION_RULES.unshift({
      id: -1,
      regex: /\bblocked-cmd\b/,
      action: "deny",
    });
    try {
      const harness = createHarness({ select: () => "Yes" });

      const result = await harness.runTool("blocked-cmd");

      assert.deepEqual(result, {
        block: true,
        reason: "Command matches deny rule /\\bblocked-cmd\\b/: blocked-cmd",
      });
      assert.deepEqual(harness.emitted, []);
    } finally {
      PERMISSION_RULES.shift();
    }
  });

  it("does not emit while YOLO mode is enabled", async () => {
    const harness = createHarness({ select: () => "Yes" });
    await harness.runCommand("permission-yolo", "on");

    await harness.runTool("git push origin main");

    assert.deepEqual(harness.emitted, []);
    assert.equal(harness.selectCalls.length, 0);
  });

  it("does not emit while the --yolo flag pins YOLO mode", async () => {
    const harness = createHarness({ select: () => "Yes", yoloPinned: true });

    await harness.runTool("git push origin main");

    assert.deepEqual(harness.emitted, []);
    assert.equal(harness.selectCalls.length, 0);
  });

  it("does not emit when a sandbox auto-allows an unmatched command", async () => {
    const harness = createHarness({ select: () => "Yes", sandbox: true });

    const result = await harness.runTool("echo hello");

    assert.equal(result, undefined);
    assert.deepEqual(harness.emitted, []);
    assert.equal(harness.selectCalls.length, 0);
  });

  it("does not emit when an ask rule denies immediately without UI", async () => {
    const harness = createHarness({ hasUI: false });

    const result = await harness.runTool("git push origin main");

    assert.deepEqual(result, {
      block: true,
      reason:
        "Command matches permission rule /\\bgit push/ - no UI for confirmation",
    });
    assert.deepEqual(harness.emitted, []);
  });

  it("does not emit when an unmatched command denies immediately without UI", async () => {
    const harness = createHarness({ hasUI: false });

    const result = await harness.runTool("echo hello");

    assert.deepEqual(result, {
      block: true,
      reason: "No permission rule matches command - no UI for confirmation",
    });
    assert.deepEqual(harness.emitted, []);
  });

  it("collapses whitespace and keeps only the first command line in the label", async () => {
    const harness = createHarness({ select: () => "Yes" });

    await harness.runTool("git push   origin\n  --force");

    assert.equal(activeLabel(harness), "permission: git push origin");
  });

  it("caps the command excerpt at 80 characters", async () => {
    const command = `git push ${"x".repeat(120)}`;
    const harness = createHarness({ select: () => "Yes" });

    await harness.runTool(command);

    assert.equal(activeLabel(harness), `permission: ${command.slice(0, 79)}…`);
  });

  it("labels an empty command", async () => {
    const harness = createHarness({ select: () => "Yes" });

    await harness.runTool("");

    assert.equal(activeLabel(harness), "permission: (empty command)");
  });
});

describe("registration surface", () => {
  it("registers the blocked emission only through the bash tool handler", () => {
    const harness = createHarness({ select: () => "Yes" });

    assert.deepEqual(
      [...harness.handlers.keys()],
      ["tool_call", "session_start", "agent_end"],
    );
  });

  it("does not emit from the agent_end bell", async () => {
    const harness = createHarness({ select: () => "Yes" });

    handlerFor(harness, "agent_end")(
      { messages: [{ role: "assistant", stopReason: "stop" }] },
      harness.ctx,
    );

    assert.deepEqual(harness.emitted, []);
  });
});
