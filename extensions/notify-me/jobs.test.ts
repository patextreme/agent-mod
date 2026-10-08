import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionEvent,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import { DELIVERY_WARNING, type Request } from "./delivery.js";
import { installNotifyMe } from "./index.js";
import { deferred, FakeClock, flush } from "./test-support.js";

const webhookUrl = "https://discord.com/api/webhooks/123/private-token";
function harness(request: Request) {
  const clock = new FakeClock();
  const handlers = new Map<
    string,
    ((event: ExtensionEvent, ctx: ExtensionCommandContext) => unknown)[]
  >();
  let commandHandler!: Omit<RegisteredCommand, "name" | "sourceInfo">;
  let name: string | undefined = "Original session";
  let credential = webhookUrl;
  const notices: { message: string; type?: string }[] = [];
  const calls: { url: string; init: RequestInit; at: number }[] = [];
  const ctx = {
    cwd: "/origin/full/path",
    hasUI: true,
    ui: {
      notify(message: string, type?: string) {
        notices.push({ message, type });
      },
    },
  } as ExtensionCommandContext;
  const pi = {
    on(event: string, handler: unknown) {
      const list = handlers.get(event) ?? [];
      list.push(
        handler as (
          event: ExtensionEvent,
          ctx: ExtensionCommandContext,
        ) => unknown,
      );
      handlers.set(event, list);
      return () => {};
    },
    registerCommand(
      _name: string,
      command: Omit<RegisteredCommand, "name" | "sourceInfo">,
    ) {
      commandHandler = command;
    },
    getSessionName() {
      return name;
    },
  } as Pick<ExtensionAPI, "on" | "registerCommand" | "getSessionName">;
  installNotifyMe(pi, {
    loadConfiguration: async () => ({ ok: true, webhookUrl: credential }),
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
  return {
    clock,
    calls,
    ctx,
    notices,
    emit,
    command: (args: string) => commandHandler.handler(args, ctx),
    settle: (aborted = false) => emit({ type: "agent_settled", aborted }),
    name: (value: string | undefined) => {
      name = value;
    },
    credential: (value: string) => {
      credential = value;
    },
    failures: () =>
      notices.filter((notice) => notice.message === DELIVERY_WARNING),
  };
}

test("settlement snapshots synchronously and returns while network is unresolved", async () => {
  const stalled = deferred<Response>();
  const h = harness(() => stalled.promise);
  await h.command("Explicit reminder");
  h.clock.now = 61_000;
  await h.settle();
  assert.equal(h.calls.length, 1);
  // Interactive commands remain usable even though no response has arrived.
  await h.command("Later pending reminder");
  await h.command("cancel");
  h.ctx.cwd = "/later/path";
  h.name("Later session");
  const embed = JSON.parse(String(h.calls[0].init.body)).embeds[0];
  assert.equal(embed.title, "Agent finished");
  assert.equal(embed.description, "Explicit reminder");
  assert.equal(
    embed.fields.find(
      (field: { name: string }) => field.name === "Working directory",
    ).value,
    "/origin/full/path",
  );
  assert.equal(
    embed.fields.find((field: { name: string }) => field.name === "Session")
      .value,
    "Original session",
  );
  assert.equal(
    embed.fields.find(
      (field: { name: string }) => field.name === "Elapsed since arming",
    ).value,
    "1m 1s",
  );
  stalled.resolve(new Response(null, { status: 204 }));
  await flush();
  await h.settle();
  assert.equal(h.calls.length, 1);
  assert.equal(h.clock.active, 0);
});

test("later arming/destination/cancel cannot alter independent retry bytes or credential", async () => {
  const h = harness(async () => new Response(null, { status: 503 }));
  await h.command("First");
  await h.settle();
  await flush();
  const body = h.calls[0].init.body;
  h.ctx.cwd = "/new/cwd";
  h.name("New name");
  const laterCredential = "https://discord.com/api/webhooks/456/later-token";
  h.credential(laterCredential);
  await h.command("Second");
  await h.settle();
  await h.command("Third pending");
  await h.command("cancel");
  await h.clock.advance(10_000);
  assert.equal(h.calls.length, 4);
  assert.deepEqual(
    h.calls.map((call) => call.url),
    [webhookUrl, laterCredential, webhookUrl, laterCredential],
  );
  assert.equal(h.calls[2].init.body, body);
  assert.equal(h.calls[3].init.body, h.calls[1].init.body);
  assert.notEqual(h.calls[0].init.body, h.calls[1].init.body);
  await h.emit({ type: "session_shutdown", reason: "quit" });
  await flush();
  assert.equal(h.clock.active, 0);
});

for (const reason of ["new", "resume", "fork"] as const) {
  for (const phase of ["request", "retry"] as const) {
    test(`${reason} replacement during ${phase} preserves dispatched work and suppresses obsolete warning`, async () => {
      const stalled = deferred<Response>();
      let count = 0;
      const h = harness(async () =>
        ++count === 1 && phase === "request"
          ? stalled.promise
          : new Response(null, { status: 503 }),
      );
      await h.command("Outgoing reminder");
      await h.settle();
      await flush();
      const body = h.calls[0].init.body;
      await h.command("Outgoing pending");
      await h.emit({ type: "session_shutdown", reason });
      await h.emit({ type: "session_start", reason });
      h.ctx.cwd = "/new/session";
      h.name("New session");
      assert.equal(h.calls[0].init.signal?.aborted, phase === "retry");
      await h.settle();
      assert.equal(h.calls.length, 1);
      if (phase === "request")
        stalled.resolve(new Response(null, { status: 503 }));
      await h.clock.advance(50_000);
      assert.equal(h.calls.length, 5);
      assert.ok(
        h.calls.every(
          (call) => call.init.body === body && call.url === webhookUrl,
        ),
      );
      assert.equal(h.failures().length, 0);
      assert.equal(h.clock.active, 0);
    });
  }
}

for (const reason of ["quit", "reload"] as const) {
  for (const phase of ["request", "retry"] as const) {
    test(`${reason} during ${phase} aborts resource ownership and cleans all timers`, async () => {
      const h = harness(
        phase === "request"
          ? () => new Promise(() => {})
          : async () => new Response(null, { status: 503 }),
      );
      await h.command("Reminder");
      await h.settle();
      await flush();
      assert.equal(h.clock.active, 1);
      await h.emit({ type: "session_shutdown", reason });
      await flush();
      assert.equal(h.clock.active, 0);
      assert.equal(h.calls[0].init.signal?.aborted, true);
      await h.clock.advance(100_000);
      assert.equal(h.calls.length, 1);
      assert.equal(h.failures().length, 0);
    });
  }
}

for (const reason of ["quit", "reload"] as const) {
  test(`a fresh replacement runtime's ${reason} cleans jobs owned by discarded runtimes`, async () => {
    const outgoing = harness(() => new Promise(() => {}));
    await outgoing.command("Original");
    await outgoing.settle();
    await outgoing.emit({ type: "session_shutdown", reason: "new" });
    assert.equal(outgoing.calls[0].init.signal?.aborted, false);
    // SDK replacement recreates registrations, not just context on old handlers.
    const replacement = harness(
      async () => new Response(null, { status: 503 }),
    );
    await replacement.emit({ type: "session_start", reason: "new" });
    await replacement.command("Replacement");
    await replacement.settle();
    await flush();
    assert.equal(outgoing.clock.active, 1);
    assert.equal(replacement.clock.active, 1);
    await replacement.emit({ type: "session_shutdown", reason });
    await flush();
    assert.equal(outgoing.calls[0].init.signal?.aborted, true);
    assert.equal(outgoing.clock.active, 0);
    assert.equal(replacement.clock.active, 0);
    assert.equal(outgoing.failures().length, 0);
    assert.equal(replacement.failures().length, 0);
  });
}

test("final permanent failure warns only the still-current UI, never response secrets", async () => {
  const h = harness(async () => new Response(webhookUrl, { status: 401 }));
  await h.command("Reminder");
  await h.settle();
  await flush();
  assert.deepEqual(h.failures(), [
    { message: DELIVERY_WARNING, type: "warning" },
  ]);
  assert.doesNotMatch(JSON.stringify(h.notices), /private-token|webhooks/);
  assert.equal(h.calls.length, 1);
});

test("headless permanent failure is caught without UI notification", async () => {
  const h = harness(async () => {
    throw new Error(webhookUrl);
  });
  h.ctx.hasUI = false;
  await h.command("Reminder");
  await h.settle();
  await h.clock.advance(100_000);
  assert.equal(h.calls.length, 5);
  assert.equal(h.failures().length, 0);
  assert.equal(h.clock.active, 0);
});

test("error reason is sanitized before payload and recovery never leaks stale error", async () => {
  const h = harness(async () => new Response(null, { status: 204 }));
  await h.command("Reminder");
  await h.emit({
    type: "message_end",
    message: {
      role: "assistant",
      stopReason: "error",
      errorMessage: `Failed ${webhookUrl}\n at stacktrace`,
      content: [{ type: "text", text: "NEVER RESPONSE" }],
    },
  } as ExtensionEvent);
  await h.settle();
  await flush();
  const errored = String(h.calls[0].init.body);
  assert.match(errored, /Agent errored/);
  assert.match(errored, /\[redacted\]/);
  assert.doesNotMatch(
    errored,
    /private-token|webhooks|stacktrace|NEVER RESPONSE/,
  );
  await h.command("Later");
  await h.emit({ type: "agent_start" });
  await h.settle();
  await flush();
  assert.match(String(h.calls[1].init.body), /Agent finished/);
  assert.doesNotMatch(String(h.calls[1].init.body), /Error reason|Failed/);
});
