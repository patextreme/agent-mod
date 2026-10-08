import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import type {
  AgentActivityOutcome,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionEvent,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { loadConfiguration } from "./config.js";
import { DELIVERY_WARNING, type Request } from "./delivery.js";
import { installNotifyMe } from "./index.js";
import type { DiscordPayload } from "./payload.js";
import { deferred, FakeClock, flush } from "./test-support.js";

// Complete production pipeline with real isolated configuration, fake HTTP/time,
// and the actual entrypoint's registrations. No model or personal credentials.
const webhookUrl =
  "https://discord.com/api/webhooks/123/integration-private-token";
const laterUrl = "https://discord.com/api/webhooks/456/later-private-token";
async function fixture(t: TestContext, request: Request) {
  const homeDir = await mkdtemp(join(tmpdir(), "notify-me-integration-"));
  t.after(() => rm(homeDir, { recursive: true, force: true }));
  const configDir = join(homeDir, ".pi");
  await mkdir(configDir);
  const configPath = join(configDir, "notify-me.json");
  const keyPath = join(configDir, "secret");
  await writeFile(configPath, JSON.stringify({ keyFile: " secret " }));
  await writeFile(keyPath, ` \n${webhookUrl}\n`, { mode: 0o600 });
  const clock = new FakeClock();
  const handlers = new Map<
    string,
    ((event: ExtensionEvent, ctx: ExtensionCommandContext) => unknown)[]
  >();
  const commands = new Map<
    string,
    Omit<RegisteredCommand, "name" | "sourceInfo">
  >();
  const notices: { message: string; type?: string }[] = [];
  const calls: { url: string; init: RequestInit; at: number }[] = [];
  let sessionName: string | undefined = "Originating session";
  let streaming = false;
  const ctx = {
    cwd: "/origin/full/path",
    hasUI: true,
    mode: "tui",
    isIdle: () => !streaming,
    ui: {
      notify(message: string, type?: string) {
        notices.push({ message, type });
      },
    },
    sessionManager: {
      getBranch() {
        throw new Error("Must not read a transcript");
      },
    },
  } as unknown as ExtensionCommandContext;
  // Absent model/persistence methods fail immediately if accidentally invoked.
  const pi = {
    on(name: string, handler: unknown) {
      const list = handlers.get(name) ?? [];
      list.push(
        handler as (
          event: ExtensionEvent,
          ctx: ExtensionCommandContext,
        ) => unknown,
      );
      handlers.set(name, list);
      return () => {};
    },
    registerCommand(
      name: string,
      command: Omit<RegisteredCommand, "name" | "sourceInfo">,
    ) {
      commands.set(name, command);
    },
    getSessionName: () => sessionName,
  } as Pick<ExtensionAPI, "on" | "registerCommand" | "getSessionName">;
  installNotifyMe(pi, {
    loadConfiguration: () => loadConfiguration({ homeDir }),
    now: () => clock.now,
    scheduler: clock,
    request: async (url, init) => {
      calls.push({ url, init, at: clock.now });
      return request(url, init);
    },
  });
  const emit = async (event: ExtensionEvent) => {
    for (const handler of handlers.get(event.type) ?? [])
      await handler(event, ctx);
  };
  t.after(async () => {
    await emit({ type: "session_shutdown", reason: "quit" });
    await flush();
    assert.equal(clock.active, 0);
  });
  assert.deepEqual([...commands.keys()], ["notify-me"]);
  const command = commands.get("notify-me");
  assert.ok(command);
  assert.ok(!handlers.has("agent_end"));
  return {
    clock,
    calls,
    ctx,
    notices,
    emit,
    hasHandlers: (name: string) => handlers.has(name),
    configPath,
    keyPath,
    command: (message: string) => command.handler(message, ctx),
    observe: (outcome: AgentActivityOutcome) =>
      emit({
        type: "agent_before_settle",
        outcome,
        entries: [],
        continue: false,
        context: {
          contextEntries: [],
          contextMessages: [],
          llmMessages: [],
          pendingMessages: [],
          canContinue: true,
        },
      }),
    settle: (aborted = false) => emit({ type: "agent_settled", aborted }),
    name: (value: string | undefined) => {
      sessionName = value;
    },
    streaming: () => {
      streaming = true;
    },
    payload: (index = 0): DiscordPayload =>
      JSON.parse(String(calls[index].init.body)),
  };
}
test("unsafe real credential refuses arming and sends no HTTP request", async (t) => {
  const h = await fixture(t, async () => new Response(null, { status: 204 }));
  await writeFile(
    h.keyPath,
    "https://attacker.invalid/api/webhooks/123/private-token",
  );
  await h.command("Must not arm");
  await h.settle();
  assert.equal(h.calls.length, 0);
  assert.match(h.notices[0].message, /Invalid notify-me credential/);
  assert.doesNotMatch(JSON.stringify(h.notices), /attacker|private-token/);
});

test("oversized real command/context remains bounded and mention-disabled in transmitted JSON", async (t) => {
  const h = await fixture(t, async () => new Response(null, { status: 204 }));
  h.ctx.cwd = `/full/${"😀".repeat(2000)}`;
  h.name("@everyone ".repeat(500));
  await h.command(`<@123> ${"😀".repeat(3000)}`);
  await h.settle();
  await flush();
  const payload = h.payload();
  const embed = payload.embeds[0];
  assert.ok(embed.description.length <= 3000);
  assert.ok(embed.description.endsWith("…"));
  assert.equal(embed.title, "Agent finished");
  let aggregate = embed.title.length + embed.description.length;
  for (const entry of embed.fields) {
    assert.ok(entry.value.length <= 1024);
    aggregate += entry.name.length + entry.value.length;
  }
  assert.ok(aggregate <= 6000);
  assert.ok(field(payload, "Working directory")?.endsWith("…"));
  assert.ok(field(payload, "Session")?.endsWith("…"));
  assert.ok(field(payload, "Elapsed since arming"));
  assert.ok(embed.timestamp);
  assert.deepEqual(payload.allowed_mentions, {
    parse: [],
    users: [],
    roles: [],
    replied_user: false,
  });
});

function field(payload: DiscordPayload, name: string) {
  return payload.embeds[0].fields.find((entry) => entry.name === name)?.value;
}

for (const aborted of [false, true]) {
  test(`locked SDK retry to real-config installed entrypoint ${aborted ? "aborts without HTTP" : "recovers and delivers once"}`, async (t) => {
    const h = await fixture(t, async () => new Response(null, { status: 204 }));
    await h.command("Runtime composed reminder");
    const { AgentSession } = await import("@earendil-works/pi-coding-agent");
    type RuntimeMethods = {
      _runAgentPrompt: (messages: unknown[]) => Promise<void>;
      _handlePostAgentRun: () => Promise<boolean>;
      _runBeforeSettleBoundary: () => Promise<boolean>;
      _emitAgentSettled: () => Promise<void>;
    };
    const runtime = AgentSession.prototype as unknown as RuntimeMethods;
    let stage = 0;
    const boundaryContext = {
      contextEntries: [],
      contextMessages: [],
      llmMessages: [],
      pendingMessages: [],
      canContinue: true,
    };
    const facade: Record<string, unknown> = {
      _pendingToolNames: new Set(),
      _deferredSettledActions: [],
      _retryAttempt: 0,
      _recordSelection: () => {},
      _finishCancelledRetry: () => {},
      _flushPendingBashMessages: () => {},
      _flushPendingCustomMessages: () => {},
      _resolveIdleWaitIfIdle: () => {},
      _emit: () => {},
      _handlePostAgentRun: runtime._handlePostAgentRun,
      _runBeforeSettleBoundary: runtime._runBeforeSettleBoundary,
      _emitAgentSettled: runtime._emitAgentSettled,
      _buildBoundaryContext: () => boundaryContext,
      _commitBoundaryDrafts: () => {},
      _extensionRunner: {
        hasHandlers: h.hasHandlers,
        emit: h.emit,
        emitBoundary: async (event: { type: string; outcome: string }) => {
          await h.emit({
            ...event,
            entries: [],
            continue: false,
            context: boundaryContext,
          } as ExtensionEvent);
          assert.equal(h.calls.length, 0);
          return { entries: [], continue: false };
        },
      },
      _isRetryableError: () => stage === 0,
      _prepareRetry: async () => {
        assert.equal(h.calls.length, 0);
        if (aborted) facade._agentRunAbortRequested = true;
        return true;
      },
      _checkCompaction: async () => false,
    };
    const run = async () => {
      await h.emit({ type: "agent_start" });
      const message = {
        role: "assistant",
        stopReason: stage === 0 ? "error" : "stop",
        errorMessage: stage === 0 ? `Recoverable ${webhookUrl}` : undefined,
      };
      await h.emit({ type: "message_end", message } as ExtensionEvent);
      facade._lastActivityOutcome = stage === 0 ? "error" : "completed";
      facade._lastAssistantMessage = message;
      facade._lastAssistantToolResults = [];
      await h.emit({ type: "agent_end", messages: [] });
      assert.equal(h.calls.length, 0);
    };
    facade.agent = {
      prompt: run,
      continue: async () => {
        ++stage;
        await run();
      },
      hasQueuedMessages: () => false,
    };
    await runtime._runAgentPrompt.call(facade, []);
    await flush();
    assert.equal(stage, aborted ? 0 : 1);
    assert.equal(h.calls.length, aborted ? 0 : 1);
    if (!aborted) {
      assert.equal(h.payload().embeds[0].title, "Agent finished");
      assert.equal(
        h.payload().embeds[0].description,
        "Runtime composed reminder",
      );
      assert.equal(field(h.payload(), "Error reason"), undefined);
      assert.doesNotMatch(
        String(h.calls[0].init.body),
        /Recoverable|private-token/,
      );
    }
    await h.settle(aborted);
    assert.equal(h.calls.length, aborted ? 0 : 1);
    assert.equal(h.clock.active, 0);
  });
}

for (const state of ["idle", "working"] as const) {
  test(`real configuration through final completion and HTTP success while ${state}`, async (t) => {
    const h = await fixture(t, async () => new Response(null, { status: 204 }));
    if (state === "working") h.streaming();
    await h.command("  Explicit @everyone reminder  ");
    assert.equal(h.calls.length, 0);
    assert.match(h.notices[0].message, /armed/);
    await h.command("");
    assert.match(h.notices[1].message, /Usage/);
    await h.emit({ type: "agent_start" });
    // Permission pauses and recoverable intermediate runs are observations only.
    await h.emit({
      type: "ui_prompt_start",
      reason: "ui_prompt",
      kind: "confirm",
    });
    assert.equal(h.calls.length, 0);
    await h.emit({
      type: "ui_prompt_end",
      reason: "ui_prompt",
      kind: "confirm",
    });
    await h.emit({ type: "agent_end", messages: [] });
    await h.observe("error");
    assert.equal(h.calls.length, 0);
    await h.observe("completed");
    h.clock.now = 61_000;
    await h.settle();
    await flush();
    const payload = h.payload();
    assert.equal(h.calls[0].url, webhookUrl);
    assert.equal(h.calls[0].init.method, "POST");
    assert.equal(h.calls[0].init.redirect, "manual");
    assert.equal(payload.embeds[0].title, "Agent finished");
    assert.equal(payload.embeds[0].description, "Explicit @everyone reminder");
    assert.equal(field(payload, "Working directory"), "/origin/full/path");
    assert.equal(field(payload, "Session"), "Originating session");
    assert.equal(field(payload, "Elapsed since arming"), "1m 1s");
    assert.equal(payload.embeds[0].timestamp, new Date(61_000).toISOString());
    assert.deepEqual(payload.allowed_mentions, {
      parse: [],
      users: [],
      roles: [],
      replied_user: false,
    });
    await h.settle();
    assert.equal(h.calls.length, 1);
    assert.equal(h.clock.active, 0);
  });
}

test("real config rereads replace only after validation; invalid replacement retains message and elapsed time", async (t) => {
  const h = await fixture(t, async () => new Response(null, { status: 204 }));
  await h.command("First");
  h.clock.now = 10_000;
  await writeFile(h.keyPath, laterUrl);
  await h.command("Replacement");
  h.clock.now = 20_000;
  await writeFile(h.configPath, `invalid ${laterUrl}`);
  await h.command("Must not replace");
  assert.equal(h.calls.length, 0);
  assert.match(h.notices.at(-1)?.message ?? "", /Invalid JSON/);
  h.clock.now = 40_000;
  await h.settle();
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, laterUrl);
  assert.equal(h.payload().embeds[0].description, "Replacement");
  assert.equal(field(h.payload(), "Elapsed since arming"), "30s");
  assert.doesNotMatch(JSON.stringify(h.notices), /private-token|webhooks/);
});

for (const reason of ["available", "unavailable"] as const) {
  test(`real validated terminal error with ${reason} reason produces secret-safe HTTP payload`, async (t) => {
    const h = await fixture(t, async () => new Response(null, { status: 204 }));
    await h.command("Explicit error reminder");
    h.name(undefined);
    await h.emit({ type: "agent_start" });
    if (reason === "available") {
      await h.emit({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "error",
          errorMessage: `Provider failed ${webhookUrl}\n at SECRET STACK`,
          content: [{ type: "text", text: "SECRET RESPONSE" }],
        },
      } as ExtensionEvent);
    }
    await h.observe("error");
    assert.equal(h.calls.length, 0);
    await h.settle();
    await flush();
    assert.equal(h.payload().embeds[0].title, "Agent errored");
    assert.equal(field(h.payload(), "Session"), undefined);
    assert.equal(
      field(h.payload(), "Error reason"),
      reason === "available"
        ? "Provider failed [redacted]"
        : "Reason unavailable.",
    );
    assert.doesNotMatch(
      String(h.calls[0].init.body),
      /private-token|webhooks|SECRET STACK|SECRET RESPONSE|Task succeeded/,
    );
    await h.settle();
    assert.equal(h.calls.length, 1);
  });
}

test("validated arming clears without HTTP on cancellation, session replacement, and authoritative abort", async (t) => {
  const h = await fixture(t, async () => new Response(null, { status: 204 }));
  await h.command("Cancel this");
  await h.command("cancel");
  await h.settle();
  await h.command("Outgoing pending");
  await h.emit({ type: "session_shutdown", reason: "new" });
  await h.emit({ type: "session_start", reason: "new" });
  await h.settle();
  await h.command("Abort this");
  await h.observe("completed");
  await h.settle(true);
  await h.settle();
  assert.equal(h.calls.length, 0);
  await h.command("After abort");
  await h.emit({ type: "agent_start" });
  await h.settle();
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.payload().embeds[0].description, "After abort");
});

test("real credential changes, later cancellation, and session switching cannot mutate retry context", async (t) => {
  const firstRequest = deferred<Response>();
  let count = 0;
  const h = await fixture(t, async () =>
    ++count === 1 ? firstRequest.promise : new Response(null, { status: 204 }),
  );
  await h.command("Originating reminder");
  await h.settle();
  assert.equal(h.calls.length, 1);
  const originalBody = h.calls[0].init.body;
  await writeFile(h.keyPath, laterUrl);
  await h.command("Later pending");
  await h.command("cancel");
  await h.emit({ type: "session_shutdown", reason: "resume" });
  await h.emit({ type: "session_start", reason: "resume" });
  h.ctx.cwd = "/other/session/path";
  h.name("Other session");
  await h.settle();
  firstRequest.resolve(
    new Response(JSON.stringify({ retry_after: 12.5 }), { status: 429 }),
  );
  await flush();
  await h.clock.advance(12_499);
  assert.equal(h.calls.length, 1);
  await h.clock.advance(1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].at, 12_500);
  assert.equal(h.calls[1].url, webhookUrl);
  assert.equal(h.calls[1].init.body, originalBody);
  assert.equal(field(h.payload(1), "Working directory"), "/origin/full/path");
  assert.equal(field(h.payload(1), "Session"), "Originating session");
  await h.clock.advance(100_000);
  assert.equal(h.calls.length, 2);
  assert.ok(h.notices.every((notice) => notice.message !== DELIVERY_WARNING));
  assert.equal(h.clock.active, 0);
});
