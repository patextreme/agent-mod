import assert from "node:assert/strict";
import { describe, it, type TestContext } from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import opencodeUsageExtension from "./index.js";

const DEEPSEEK_RULE = {
  when: {
    utc_days: { in: ["mon", "tue", "wed", "thu", "fri"] },
    any: [
      {
        all: [{ utc_hours: { gte: "01:00" } }, { utc_hours: { lt: "04:00" } }],
      },
      {
        all: [{ utc_hours: { gte: "06:00" } }, { utc_hours: { lt: "10:00" } }],
      },
    ],
  },
  factor: 2,
};

const USAGE_BODY = JSON.stringify({
  usage: {
    rolling: { status: "ok", percent: 3 },
    weekly: { status: "ok", percent: 1 },
    monthly: { status: "ok", percent: 0 },
  },
});

const CATALOG_BODY = JSON.stringify({
  object: "list",
  data: [
    { id: "deepseek-v4.1-flash", cost: { multipliers: [DEEPSEEK_RULE] } },
    { id: "tagless-go", cost: { multipliers: [] } },
  ],
});

const NOW = "2026-11-16T09:13:30Z";
const METERS = "opencode-go: 3.0% / 1.0% / 0.0%";
const PEAK_STATUS = `${METERS} · peak · 46m left`;

interface ModelLike {
  id: string;
  provider: string;
}

const GO_MODEL: ModelLike = {
  id: "deepseek-v4.1-flash",
  provider: "opencode-go",
};
const TAGLESS_GO_MODEL: ModelLike = {
  id: "tagless-go",
  provider: "opencode-go",
};
const NON_GO_MODEL: ModelLike = { id: "plain-model", provider: "openai" };

interface FetchState {
  usageStatus: number;
  catalogStatus: number;
  key: string | undefined;
  keyError: Error | undefined;
}

interface StatusWrite {
  text: string | undefined;
  at: number;
}

interface Notice {
  message: string;
  level: string | undefined;
}

interface ColorCall {
  color: string;
  text: string;
}

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type CommandHandler = (args: string, ctx: ExtensionContext) => unknown;

function jsonResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Internal Server Error",
    text: async () => body,
  } as Response;
}

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function createHarness(
  t: TestContext,
  options: {
    now?: string;
    model?: ModelLike;
    usageStatus?: number;
    catalogStatus?: number;
  } = {},
) {
  t.mock.timers.enable({
    apis: ["Date", "setTimeout"],
    now: Date.parse(options.now ?? NOW),
  });

  let model = options.model ?? GO_MODEL;
  const state: FetchState = {
    usageStatus: options.usageStatus ?? 200,
    catalogStatus: options.catalogStatus ?? 200,
    key: "test-provider-key",
    keyError: undefined,
  };

  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, CommandHandler>();
  const statuses: StatusWrite[] = [];
  const notices: Notice[] = [];
  const colors: ColorCall[] = [];
  const fetchCalls: string[] = [];

  const ctx = {
    hasUI: true,
    get model() {
      return model;
    },
    ui: {
      setStatus(_key: string, text: string | undefined) {
        statuses.push({ text, at: Date.now() });
      },
      notify(message: string, level?: string) {
        notices.push({ message, level });
      },
      theme: {
        fg(color: string, text: string) {
          colors.push({ color, text });
          return text;
        },
      },
    },
    modelRegistry: {
      async getApiKeyForProvider(provider: string) {
        if (provider !== "opencode-go") return undefined;
        if (state.keyError !== undefined) throw state.keyError;
        return state.key;
      },
    },
  } as unknown as ExtensionContext;

  const pi = {
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      return () => {};
    },
    registerCommand(
      name: string,
      definition: { handler: CommandHandler },
    ): void {
      commands.set(name, definition.handler);
    },
  } as unknown as ExtensionAPI;

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    fetchCalls.push(url);
    return url.endsWith("/usage")
      ? jsonResponse(USAGE_BODY, state.usageStatus)
      : jsonResponse(CATALOG_BODY, state.catalogStatus);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
    t.mock.timers.reset();
  });

  opencodeUsageExtension(pi);

  async function emit(name: string, event: unknown): Promise<void> {
    if (name === "model_select") {
      model = (event as { model: ModelLike }).model;
    }
    for (const handler of handlers.get(name) ?? []) {
      await handler(event, ctx);
    }
    await flush();
  }

  async function select(next: ModelLike): Promise<void> {
    const previousModel = model;
    await emit("model_select", {
      type: "model_select",
      model: next,
      previousModel,
      source: "set",
    });
  }

  async function runCommand(): Promise<void> {
    const handler = commands.get("opencode-usage-refresh");
    assert.ok(handler, "expected /opencode-usage-refresh to be registered");
    await handler("", ctx);
    await flush();
  }

  return {
    state,
    select,
    emit,
    runCommand,
    fetchCalls,
    statuses,
    notices,
    colors,
    statusCount: () => statuses.length,
    lastStatus: () => statuses.at(-1)?.text,
    catalogRequests: () =>
      fetchCalls.filter((url) => url.endsWith("/models")).length,
    usageRequests: () =>
      fetchCalls.filter((url) => url.endsWith("/usage")).length,
  };
}

describe("opencode-usage extension", () => {
  it("renders meters and a peak tag from one catalog request", async (t) => {
    const harness = createHarness(t);

    await harness.select(GO_MODEL);

    assert.strictEqual(harness.lastStatus(), PEAK_STATUS);
    assert.strictEqual(harness.usageRequests(), 1);
    assert.strictEqual(harness.catalogRequests(), 1);
    assert.ok(
      harness.colors.some(
        (call) => call.color === "dim" && call.text === METERS,
      ),
      "the meters use the dim colour",
    );
    assert.ok(
      harness.colors.some(
        (call) => call.color === "warning" && call.text === "peak · 46m left",
      ),
      "only the peak state tag uses the warning colour",
    );
  });

  it("clears and cancels the timer on tagless and non-go switches", async (t) => {
    const harness = createHarness(t);
    await harness.select(GO_MODEL);

    await harness.select(TAGLESS_GO_MODEL);
    assert.strictEqual(harness.lastStatus(), METERS);
    const afterTagless = harness.statusCount();
    t.mock.timers.tick(2 * 60 * 60 * 1000);
    assert.strictEqual(harness.statusCount(), afterTagless);

    await harness.select(NON_GO_MODEL);
    assert.strictEqual(harness.lastStatus(), undefined);
    const afterNonGo = harness.statusCount();
    t.mock.timers.tick(2 * 60 * 60 * 1000);
    assert.strictEqual(harness.statusCount(), afterNonGo);
  });

  it("does not cache a failed catalog and retries on the next trigger", async (t) => {
    const harness = createHarness(t, { catalogStatus: 500 });

    await harness.select(GO_MODEL);
    assert.strictEqual(harness.lastStatus(), METERS);
    assert.strictEqual(harness.catalogRequests(), 1);

    harness.state.catalogStatus = 200;
    await harness.select(GO_MODEL);
    assert.strictEqual(harness.lastStatus(), PEAK_STATUS);
    assert.strictEqual(harness.catalogRequests(), 2);
  });

  it("shows the peak tag with ? meters when the usage read fails", async (t) => {
    const harness = createHarness(t, { usageStatus: 500 });

    await harness.select(GO_MODEL);

    assert.strictEqual(
      harness.lastStatus(),
      "opencode-go: ? / ? / ? · peak · 46m left",
    );
    assert.ok(
      harness.colors.some(
        (call) =>
          call.color === "dim" && call.text === "opencode-go: ? / ? / ?",
      ),
    );
    assert.ok(
      harness.colors.some(
        (call) => call.color === "warning" && call.text === "peak · 46m left",
      ),
    );
  });

  it("repaints at the next countdown change without fetching", async (t) => {
    const harness = createHarness(t);
    await harness.select(GO_MODEL);
    const fetches = harness.fetchCalls.length;
    const writes = harness.statusCount();

    t.mock.timers.tick(30_000);
    assert.strictEqual(harness.statusCount(), writes);
    assert.strictEqual(harness.lastStatus(), PEAK_STATUS);

    t.mock.timers.tick(1);
    assert.strictEqual(harness.statusCount(), writes + 1);
    assert.strictEqual(harness.lastStatus(), `${METERS} · peak · 45m left`);
    assert.strictEqual(harness.fetchCalls.length, fetches);
  });

  it("repaints at the boundary and switches to off-peak without fetching", async (t) => {
    const harness = createHarness(t, { now: "2026-11-16T09:59:30Z" });
    await harness.select(GO_MODEL);
    assert.strictEqual(
      harness.lastStatus(),
      `${METERS} · peak · under a minute left`,
    );
    const fetches = harness.fetchCalls.length;

    t.mock.timers.tick(30_000);

    assert.strictEqual(
      harness.lastStatus(),
      `${METERS} · off-peak · 15h00m left`,
    );
    assert.strictEqual(harness.fetchCalls.length, fetches);
  });

  it("clears idempotently on tagless switches and session shutdown", async (t) => {
    const harness = createHarness(t);
    await harness.select(GO_MODEL);
    await harness.select(TAGLESS_GO_MODEL);
    await harness.select(TAGLESS_GO_MODEL);
    assert.strictEqual(harness.lastStatus(), METERS);
    const writes = harness.statusCount();

    await harness.emit("session_shutdown", {
      type: "session_shutdown",
      reason: "quit",
    });
    await harness.emit("session_shutdown", {
      type: "session_shutdown",
      reason: "quit",
    });
    assert.strictEqual(harness.lastStatus(), METERS);

    t.mock.timers.tick(3 * 60 * 60 * 1000);
    assert.strictEqual(harness.statusCount(), writes);
  });

  it("manual refresh paints and reports usage for a non-go model", async (t) => {
    const harness = createHarness(t, { model: NON_GO_MODEL });
    await harness.select(NON_GO_MODEL);
    assert.strictEqual(harness.lastStatus(), undefined);

    await harness.runCommand();

    assert.strictEqual(harness.lastStatus(), METERS);
    assert.deepStrictEqual(harness.notices, [
      { message: METERS, level: "info" },
    ]);
    assert.strictEqual(harness.catalogRequests(), 0);
  });

  it("manual refresh adds one warning when the catalog is unavailable", async (t) => {
    const harness = createHarness(t, { catalogStatus: 500 });

    await harness.runCommand();

    assert.strictEqual(harness.lastStatus(), METERS);
    assert.strictEqual(harness.notices.length, 2);
    assert.deepStrictEqual(harness.notices[0], {
      message: METERS,
      level: "info",
    });
    assert.strictEqual(harness.notices[1]?.level, "warning");
    assert.match(
      harness.notices[1]?.message ?? "",
      /^OpenCode peak schedule unavailable \(HTTP 500 Internal Server Error\)\.$/,
    );
  });

  it("reports a failed usage window once when the catalog is available", async (t) => {
    const harness = createHarness(t, { usageStatus: 500 });

    await harness.runCommand();

    assert.strictEqual(harness.notices.length, 1);
    assert.strictEqual(harness.notices[0]?.level, "info");
    assert.match(
      harness.notices[0]?.message ?? "",
      /^opencode-go: \? \/ \? \/ \? · peak until 10:00 UTC \(/,
    );
    assert.strictEqual(
      harness.lastStatus(),
      "opencode-go: ? / ? / ? · peak · 46m left",
    );
  });
});
