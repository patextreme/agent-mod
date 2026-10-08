import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  AgentActivityOutcome,
  AgentSession,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionEvent,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { registerNotifyMe, type SettledOutcome } from "./adapter.js";
import type { ConfigurationResult } from "./config.js";
import type { PendingNotification } from "./pending.js";

const webhookUrl = "https://discord.com/api/webhooks/123/private-token";
const valid: ConfigurationResult = { ok: true, webhookUrl };
const invalid: ConfigurationResult = {
  ok: false,
  diagnostic: "Check the private credential file.",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness(
  readConfiguration: () => Promise<ConfigurationResult> = async () => valid,
  onHandbackEffect?: () => void,
) {
  const handlers = new Map<
    string,
    (event: ExtensionEvent, ctx: ExtensionCommandContext) => unknown
  >();
  const commands = new Map<
    string,
    Omit<RegisteredCommand, "name" | "sourceInfo">
  >();
  const notices: { message: string; type?: string }[] = [];
  const handbacks: { pending: PendingNotification; outcome: SettledOutcome }[] =
    [];
  let clock = 1000;
  let streaming = false;
  let reads = 0;
  const ctx = {
    cwd: "/original/cwd",
    hasUI: true,
    mode: "tui",
    isIdle: () => !streaming,
    ui: {
      notify: (message: string, type?: string) => {
        notices.push({ message, type });
      },
    },
  } as ExtensionCommandContext;
  // These are the production registrations. The narrow fake only implements
  // on/registerCommand: accidental model work or persistence fails immediately.
  const pi = {
    on(name: string, handler: unknown) {
      assert.ok(!handlers.has(name));
      handlers.set(
        name,
        handler as (
          event: ExtensionEvent,
          ctx: ExtensionCommandContext,
        ) => unknown,
      );
      return () => handlers.delete(name);
    },
    registerCommand(
      name: string,
      command: Omit<RegisteredCommand, "name" | "sourceInfo">,
    ) {
      commands.set(name, command);
    },
  } as Pick<ExtensionAPI, "on" | "registerCommand">;
  registerNotifyMe(pi, {
    loadConfiguration: () => {
      ++reads;
      return readConfiguration();
    },
    now: () => clock,
    onHandback: (pending, outcome) => {
      handbacks.push({ pending, outcome });
      onHandbackEffect?.();
    },
  });
  const emit = async (event: ExtensionEvent) => {
    return await handlers.get(event.type)?.(event, ctx);
  };
  const command = (args: string) => {
    const registered = commands.get("notify-me");
    assert.ok(registered);
    return registered.handler(args, ctx);
  };
  const boundary = (outcome: AgentActivityOutcome) =>
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
    });
  const assistant = (
    stopReason: AssistantMessage["stopReason"],
    errorMessage?: string,
  ) =>
    emit({
      type: "message_end",
      message: {
        role: "assistant",
        stopReason,
        errorMessage,
        content: [],
        api: "openai-responses",
        provider: "fixture",
        model: "fixture",
        timestamp: clock,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      },
    });
  const start = () => emit({ type: "agent_start" });
  const settle = (aborted = false) => emit({ type: "agent_settled", aborted });
  const reset = (
    reason: "startup" | "reload" | "new" | "resume" | "fork" = "new",
  ) => emit({ type: "session_start", reason });
  return {
    handlers,
    commands,
    notices,
    handbacks,
    ctx,
    pi,
    emit,
    command,
    boundary,
    assistant,
    start,
    settle,
    reset,
    setClock: (value: number) => {
      clock = value;
    },
    setStreaming: (value: boolean) => {
      streaming = value;
    },
    reads: () => reads,
  };
}

test("registers only the command and notification lifecycle observers, never agent_end", () => {
  const h = harness();
  assert.deepEqual([...h.commands.keys()], ["notify-me"]);
  assert.deepEqual(
    [...h.handlers.keys()],
    [
      "session_start",
      "session_shutdown",
      "agent_start",
      "message_end",
      "agent_before_settle",
      "agent_settled",
    ],
  );
});

for (const streaming of [false, true]) {
  test(`arming ${streaming ? "during streaming" : "while idle"} is local and waits for actual settlement`, async () => {
    const h = harness();
    await h.reset("startup");
    if (streaming) await h.start();
    h.setStreaming(streaming);
    await h.command("  take a break  ");
    assert.equal(h.reads(), 1);
    assert.deepEqual(h.notices, [
      {
        message: "Notification armed for the next final handback.",
        type: "info",
      },
    ]);
    assert.equal(h.handbacks.length, 0);
    if (!streaming) await h.start();
    await h.assistant("stop");
    await h.boundary("completed");
    assert.equal(h.handbacks.length, 0);
    await h.settle();
    assert.equal(h.handbacks.length, 1);
    assert.deepEqual(h.handbacks[0], {
      pending: {
        message: "take a break",
        armedAt: 1000,
        webhookUrl,
        session: 1,
      },
      outcome: { status: "completed", errorReason: undefined },
    });
    await h.settle();
    assert.equal(h.handbacks.length, 1);
    assert.ok(Object.isFrozen(h.handbacks[0].pending));
    assert.ok(Object.isFrozen(h.handbacks[0].outcome));
  });
}

test("valid replacement retains only the later message, timestamp, and credential", async () => {
  let configuration: ConfigurationResult = valid;
  const h = harness(async () => configuration);
  await h.command("first");
  h.setClock(2000);
  configuration = {
    ok: true,
    webhookUrl: webhookUrl.replace("private-token", "new-token"),
  };
  await h.command("replacement");
  await h.start();
  await h.boundary("completed");
  await h.settle();
  assert.equal(h.handbacks.length, 1);
  assert.deepEqual(h.handbacks[0].pending, {
    message: "replacement",
    armedAt: 2000,
    webhookUrl: configuration.webhookUrl,
    session: 0,
  });
});

test("failed replacement preserves the previous arming exactly", async () => {
  let configuration: ConfigurationResult = valid;
  const h = harness(async () => configuration);
  await h.command("original");
  h.setClock(3000);
  configuration = invalid;
  await h.command("invalid replacement");
  assert.deepEqual(h.notices.at(-1), {
    message: invalid.diagnostic,
    type: "warning",
  });
  await h.start();
  await h.boundary("completed");
  await h.settle();
  assert.deepEqual(h.handbacks[0].pending, {
    message: "original",
    armedAt: 1000,
    webhookUrl,
    session: 0,
  });
});

test("invalid first arming and unexpected loader rejection never arm or disclose exceptions", async () => {
  let fail = false;
  const h = harness(async () => {
    if (fail) throw new Error(webhookUrl);
    return invalid;
  });
  await h.command("invalid");
  await h.settle();
  fail = true;
  await h.command("throwing loader");
  await h.settle();
  assert.equal(h.handbacks.length, 0);
  assert.equal(h.notices.length, 2);
  assert.ok(!JSON.stringify(h.notices).includes(webhookUrl));
});

test("bare usage preserves arming and performs no config read", async () => {
  const h = harness();
  await h.command("original");
  await h.command("   ");
  assert.equal(h.reads(), 1);
  assert.match(h.notices.at(-1)?.message ?? "", /Usage/);
  await h.settle();
  assert.equal(h.handbacks[0].pending.message, "original");
});

test("only the exact trimmed lower-case cancel argument is reserved", async () => {
  const h = harness();
  for (const message of ["Cancel", "cancel later", "please cancel"]) {
    await h.command(message);
    await h.settle();
    assert.equal(h.handbacks.at(-1)?.pending.message, message);
  }
  await h.command("original");
  await h.command(" cancel ");
  await h.settle();
  assert.equal(h.handbacks.length, 3);
  assert.equal(h.reads(), 4);
  await h.command("cancel");
  assert.match(h.notices.at(-1)?.message ?? "", /canceled/);
});

test("latest arm attempt wins even when reads finish out of order", async () => {
  const first = deferred<ConfigurationResult>();
  const second = deferred<ConfigurationResult>();
  let reads = 0;
  const h = harness(() => (++reads === 1 ? first.promise : second.promise));
  const one = h.command("one");
  const two = h.command("two");
  h.setClock(5000);
  second.resolve(valid);
  await two;
  h.setClock(6000);
  first.resolve(valid);
  await one;
  assert.equal(h.notices.length, 1);
  await h.settle();
  assert.equal(h.handbacks[0].pending.message, "two");
  assert.equal(h.handbacks[0].pending.armedAt, 5000);
});

test("newer invalid attempt preserves existing arming but supersedes an older read", async () => {
  const delayed = deferred<ConfigurationResult>();
  let reads = 0;
  const h = harness(() => {
    ++reads;
    return reads === 2
      ? delayed.promise
      : Promise.resolve(reads === 3 ? invalid : valid);
  });
  await h.command("existing");
  const old = h.command("slow replacement");
  await h.command("bad replacement");
  delayed.resolve(valid);
  await old;
  await h.settle();
  assert.equal(h.handbacks[0].pending.message, "existing");
  assert.equal(h.notices.length, 2);
});

for (const interruption of [
  "cancel",
  "session_start",
  "session_shutdown",
  "settlement",
  "abort",
] as const) {
  test(`${interruption} invalidates an outstanding configuration read without stale UI confirmation`, async () => {
    const read = deferred<ConfigurationResult>();
    const h = harness(() => read.promise);
    const arm = h.command("late");
    if (interruption === "cancel") await h.command("cancel");
    else if (interruption === "session_start") await h.reset();
    else if (interruption === "session_shutdown")
      await h.emit({ type: "session_shutdown", reason: "new" });
    else await h.settle(interruption === "abort");
    const noticesBefore = h.notices.length;
    read.resolve(valid);
    await arm;
    assert.equal(h.notices.length, noticesBefore);
    await h.settle();
    assert.equal(h.handbacks.length, 0);
  });
}

for (const reason of ["startup", "reload", "new", "resume", "fork"] as const) {
  test(`session_start ${reason} clears pending state and stale error observations`, async () => {
    const h = harness();
    await h.command("old");
    await h.start();
    await h.assistant("error", "old error");
    await h.reset(reason);
    await h.settle();
    assert.equal(h.handbacks.length, 0);
    await h.command("new");
    await h.settle();
    assert.deepEqual(h.handbacks[0].outcome, {
      status: "completed",
      errorReason: undefined,
    });
    assert.equal(h.handbacks[0].pending.session, 1);
  });
}

test("a fresh adapter restores nothing from a previous process", async () => {
  const first = harness();
  await first.command("old process");
  const restarted = harness();
  await restarted.start();
  await restarted.settle();
  assert.equal(restarted.handbacks.length, 0);
});

for (const continuation of [
  "automatic continuation",
  "recovery",
  "compaction",
  "queued work",
  "pre-settle continuation",
]) {
  test(`${continuation} keeps arming through intermediate events and uses only the final outcome`, async () => {
    const h = harness();
    await h.command("notify");
    await h.start();
    await h.assistant("error", "recoverable error");
    await h.emit({ type: "agent_end", messages: [] });
    if (continuation === "compaction") {
      await h.emit({
        type: "session_before_compact",
        preparation: {},
      } as ExtensionEvent);
      await h.emit({
        type: "session_compact",
        compactionEntry: {},
        fromExtension: false,
      } as ExtensionEvent);
    }
    if (continuation === "pre-settle continuation") await h.boundary("error");
    assert.equal(h.handbacks.length, 0);
    await h.start();
    await h.assistant("stop");
    await h.emit({ type: "agent_end", messages: [] });
    await h.boundary("completed");
    assert.equal(h.handbacks.length, 0);
    await h.settle();
    await h.settle();
    assert.equal(h.handbacks.length, 1);
    assert.deepEqual(h.handbacks[0].outcome, {
      status: "completed",
      errorReason: undefined,
    });
  });
}

test("tool failures and assistant prose are not terminal errors", async () => {
  const h = harness();
  await h.command("notify");
  await h.start();
  await h.emit({
    type: "message_end",
    message: {
      role: "toolResult",
      toolCallId: "test",
      toolName: "bash",
      content: [{ type: "text", text: "failed" }],
      details: {},
      isError: true,
      timestamp: 1000,
    },
  });
  await h.emit({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Task failed; error" }],
      stopReason: "stop",
    },
  } as ExtensionEvent);
  await h.boundary("completed");
  await h.settle();
  assert.deepEqual(h.handbacks[0].outcome, {
    status: "completed",
    errorReason: undefined,
  });
});

test("recovery within the same agent loop clears the old terminal reason", async () => {
  const h = harness();
  await h.command("notify");
  await h.start();
  await h.assistant("error", "stale");
  await h.assistant("stop");
  await h.boundary("completed");
  await h.settle();
  assert.deepEqual(h.handbacks[0].outcome, {
    status: "completed",
    errorReason: undefined,
  });
});

for (const reason of [
  undefined,
  "upstream unavailable",
  `credential ${webhookUrl} and private-token`,
]) {
  test(`terminal error captures ${reason === undefined ? "missing reason" : "reason"} without exposing the credential`, async () => {
    const h = harness();
    await h.command("notify");
    await h.start();
    await h.assistant("error", reason);
    await h.boundary("error");
    assert.equal(h.handbacks.length, 0);
    await h.settle();
    await h.settle();
    assert.equal(h.handbacks.length, 1);
    assert.equal(h.handbacks[0].outcome.status, "error");
    assert.ok(
      !JSON.stringify(h.handbacks[0].outcome).includes("private-token"),
    );
    if (reason === undefined)
      assert.equal(h.handbacks[0].outcome.errorReason, undefined);
    else if (!reason.includes("private-token"))
      assert.equal(h.handbacks[0].outcome.errorReason, reason);
    else assert.match(h.handbacks[0].outcome.errorReason ?? "", /redacted/);
  });
}

test("new work clears a previous error even if the next run supplies no reason", async () => {
  const h = harness();
  await h.start();
  await h.assistant("error", "old reason");
  await h.boundary("error");
  await h.settle();
  await h.command("later");
  await h.start();
  await h.boundary("error");
  await h.settle();
  assert.deepEqual(h.handbacks[0].outcome, {
    status: "error",
    errorReason: undefined,
  });
});

for (const phase of [
  "ordinary run",
  "retry wait",
  "compaction",
  "before-settle",
  "assistant abort",
] as const) {
  test(`abort during ${phase} clears pending without delivery and cannot contaminate later work`, async () => {
    const h = harness();
    await h.command("aborted");
    await h.start();
    if (phase === "retry wait") await h.assistant("error", "retrying");
    if (phase === "compaction")
      await h.emit({
        type: "session_before_compact",
        preparation: {},
      } as ExtensionEvent);
    if (phase === "before-settle") await h.boundary("completed");
    if (phase === "assistant abort") {
      await h.assistant("aborted");
      await h.boundary("aborted");
    }
    await h.settle(phase !== "assistant abort");
    await h.settle();
    assert.equal(h.handbacks.length, 0);
    await h.command("later");
    await h.start();
    await h.boundary("completed");
    await h.settle();
    assert.deepEqual(h.handbacks[0].outcome, {
      status: "completed",
      errorReason: undefined,
    });
    assert.equal(h.handbacks[0].pending.message, "later");
  });
}

test("permission and other blocking prompts retain pending state, including arming during a pause", async () => {
  const h = harness();
  await h.start();
  for (const kind of ["confirm", "input", "select"] as const) {
    await h.emit({
      type: "ui_prompt_start",
      reason: "ui_prompt",
      kind,
      title: "Permission",
    });
    if (kind === "confirm") await h.command("paused");
    assert.equal(h.handbacks.length, 0);
    await h.emit({
      type: "ui_prompt_end",
      reason: "ui_prompt",
      kind,
      title: "Permission",
    });
  }
  await h.assistant("stop");
  await h.boundary("completed");
  await h.settle();
  assert.equal(h.handbacks.length, 1);
  assert.equal(h.handbacks[0].pending.message, "paused");
});

for (const failure of ["missing-model", "missing-auth"] as const) {
  test(`${failure} actual locked-runtime preflight sends nothing, preserves arming, and later settles once with the actual outcome`, async () => {
    const h = harness();
    await h.reset("startup");
    await h.command("retained");
    const events: string[] = [];
    // Exercise the installed SDK's actual prompt preflight, not a synthetic UI
    // error event. No constructor, config files, auth store, or model/network is used.
    const facade = {
      isStreaming: false,
      model:
        failure === "missing-model"
          ? undefined
          : { provider: "fixture-provider" },
      _runInputHandlers: async (text: string) => {
        events.push("input");
        return { text, images: undefined };
      },
      _flushPendingBashMessages: () => {},
      _flushPendingCustomMessages: () => {},
      _modelRuntime: {
        hasConfiguredAuth: () => false,
        checkAuth: async () => undefined,
        isUsingOAuth: () => false,
      },
      _runAgentPrompt: () => {
        throw new Error("Preflight incorrectly started a run");
      },
    };
    await assert.rejects(
      (
        await import("@earendil-works/pi-coding-agent")
      ).AgentSession.prototype.prompt.call(
        facade as unknown as AgentSession,
        "actual preflight",
        { expandPromptTemplates: false },
      ),
      failure === "missing-model" ? /No model selected/ : /No API key found/,
    );
    assert.deepEqual(events, ["input"]);
    assert.equal(h.handbacks.length, 0);
    assert.equal(h.notices.length, 1);
    h.setClock(10000);
    await h.start();
    // Distinct subsequent outcomes prove the preflight error is not inherited.
    if (failure === "missing-model") {
      await h.assistant("stop");
      await h.boundary("completed");
    } else {
      await h.assistant("error", "actual later terminal failure");
      await h.boundary("error");
    }
    await h.settle();
    await h.settle();
    assert.equal(h.handbacks.length, 1);
    assert.deepEqual(h.handbacks[0].pending, {
      message: "retained",
      armedAt: 1000,
      webhookUrl,
      session: 1,
    });
    assert.deepEqual(
      h.handbacks[0].outcome,
      failure === "missing-model"
        ? { status: "completed", errorReason: undefined }
        : { status: "error", errorReason: "actual later terminal failure" },
    );
  });
}

test("pending state is consumed before even a reentrant settlement callback", async () => {
  let repeated: Promise<unknown> | undefined;
  const h = harness(undefined, () => {
    repeated = h.settle();
  });
  await h.command("once");
  await h.settle();
  await repeated;
  assert.equal(h.handbacks.length, 1);
});

test("later cancel/session reset cannot mutate detached pending state", async () => {
  const h = harness();
  await h.command("detached");
  await h.settle();
  const detached = h.handbacks[0];
  await h.command("next");
  await h.command("cancel");
  await h.reset();
  await h.settle();
  assert.equal(h.handbacks.length, 1);
  assert.equal(detached.pending.message, "detached");
});
