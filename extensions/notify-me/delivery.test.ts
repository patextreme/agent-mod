import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  DELIVERY_WARNING,
  DeliveryJobs,
  type Request,
  rateLimitDelay,
} from "./delivery.js";
import { captureHandback, renderPayload } from "./payload.js";
import { deferred, FakeClock, flush } from "./test-support.js";

const webhookUrl = "https://discord.com/api/webhooks/123/private-token";
const payload = renderPayload(
  captureHandback(
    { message: "Reminder", webhookUrl, session: 1, armedAt: 0 },
    { status: "completed" },
    { cwd: "/original" },
    1000,
  ),
);
const response = (
  status: number,
  body: unknown = undefined,
  headers?: HeadersInit,
) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers,
  });
function harness(request: Request) {
  const clock = new FakeClock();
  const calls: { url: string; init: RequestInit; at: number }[] = [];
  let warnings = 0;
  const jobs = new DeliveryJobs({
    scheduler: clock,
    now: () => clock.now,
    request: async (url, init) => {
      calls.push({ url, init, at: clock.now });
      return request(url, init);
    },
  });
  const dispatch = () =>
    jobs.dispatch(webhookUrl, payload, () => {
      ++warnings;
    });
  return { jobs, clock, calls, dispatch, warnings: () => warnings };
}

for (const status of [200, 201, 204, 299]) {
  test(`any 2xx succeeds once (${status}) with JSON POST and redirect refusal`, async () => {
    const h = harness(async () => response(status));
    assert.equal(h.dispatch(), undefined);
    await flush();
    assert.equal(h.calls.length, 1);
    assert.equal(h.warnings(), 0);
    assert.equal(h.clock.active, 0);
    assert.equal(h.calls[0].url, webhookUrl);
    assert.equal(h.calls[0].init.method, "POST");
    assert.equal(h.calls[0].init.redirect, "manual");
    assert.deepEqual(h.calls[0].init.headers, {
      "Content-Type": "application/json",
    });
    assert.equal(h.calls[0].init.body, JSON.stringify(payload));
  });
}
for (const status of [400, 401, 403, 404, 408, 422, 301, 302, 307, 308]) {
  test(`permanent HTTP ${status} warns once without reading/echoing response or retrying`, async () => {
    let canceled = 0;
    const stream = new ReadableStream({
      cancel() {
        ++canceled;
      },
    });
    const h = harness(
      async () =>
        new Response(stream, {
          status,
          headers: { location: "https://evil.test/private-token" },
        }),
    );
    h.dispatch();
    await flush();
    await h.clock.advance(100_000);
    assert.equal(h.calls.length, 1);
    assert.equal(h.warnings(), 1);
    assert.equal(canceled, 1);
    assert.equal(h.clock.active, 0);
    assert.doesNotMatch(DELIVERY_WARNING, /private-token|evil|webhooks/);
  });
}
for (const failure of ["network", "500", "502", "503", "599"]) {
  test(`${failure} retries after 10s with identical bytes and stops on success`, async () => {
    let count = 0;
    const h = harness(async () => {
      if (++count === 1) {
        if (failure === "network") throw new Error(webhookUrl);
        return response(Number(failure));
      }
      return response(204);
    });
    h.dispatch();
    await h.clock.advance(9999);
    assert.equal(h.calls.length, 1);
    await h.clock.advance(1);
    assert.equal(h.calls.length, 2);
    assert.deepEqual(
      h.calls.map((call) => call.at),
      [0, 10_000],
    );
    assert.equal(h.calls[0].init.body, h.calls[1].init.body);
    assert.equal(h.warnings(), 0);
    assert.equal(h.clock.active, 0);
  });
}

test("five total failed attempts, four delays, one final warning and no future timers", async () => {
  const h = harness(async () => {
    throw new Error(`secret failure ${webhookUrl}`);
  });
  h.dispatch();
  await h.clock.advance(100_000);
  assert.equal(h.calls.length, 5);
  assert.deepEqual(
    h.calls.map((call) => call.at),
    [0, 10_000, 20_000, 30_000, 40_000],
  );
  assert.equal(new Set(h.calls.map((call) => call.init.body)).size, 1);
  assert.equal(h.warnings(), 1);
  assert.equal(h.clock.active, 0);
});

test("requests ignoring AbortSignal still time out at 10s and release timers; late rejection is caught", async () => {
  const stalled = deferred<Response>();
  let count = 0;
  const h = harness(async () =>
    ++count === 1 ? stalled.promise : response(204),
  );
  h.dispatch();
  await h.clock.advance(9999);
  assert.equal(h.calls[0].init.signal?.aborted, false);
  await h.clock.advance(1);
  assert.equal(h.calls[0].init.signal?.aborted, true);
  assert.equal(h.calls.length, 1);
  await h.clock.advance(10_000);
  assert.equal(h.calls.length, 2);
  stalled.reject(new Error(webhookUrl));
  await flush();
  assert.equal(h.warnings(), 0);
  assert.equal(h.clock.active, 0);
});

test("five hanging requests exhaust by 90s and every signal is aborted", async () => {
  const h = harness(() => new Promise(() => {}));
  h.dispatch();
  await h.clock.advance(90_000);
  assert.deepEqual(
    h.calls.map((call) => call.at),
    [0, 20_000, 40_000, 60_000, 80_000],
  );
  assert.ok(h.calls.every((call) => call.init.signal?.aborted));
  assert.equal(h.warnings(), 1);
  assert.equal(h.clock.active, 0);
});

const rateCases: [string, unknown, HeadersInit, number][] = [
  ["JSON seconds", { retry_after: 12.5 }, {}, 12_500],
  ["fractional seconds below normal", { retry_after: 0.5 }, {}, 10_000],
  ["retry-after header seconds", undefined, { "retry-after": "14.25" }, 14_250],
  [
    "reset-after seconds",
    undefined,
    { "x-ratelimit-reset-after": "16.5" },
    16_500,
  ],
  [
    "HTTP-date header",
    undefined,
    { "retry-after": new Date(20_000).toUTCString() },
    20_000,
  ],
  ["epoch reset seconds", undefined, { "x-ratelimit-reset": "18.25" }, 18_250],
  [
    "maximum of applicable values",
    { retry_after: 12 },
    { "retry-after": "15", "x-ratelimit-reset-after": "17" },
    17_000,
  ],
  [
    "invalid metadata fallback",
    { retry_after: "garbage" },
    { "retry-after": "garbage", "x-ratelimit-reset-after": "-4" },
    10_000,
  ],
  ["negative body fallback", { retry_after: -1 }, {}, 10_000],
  ["infinite body fallback", { retry_after: "Infinity" }, {}, 10_000],
  ["boolean body fallback", { retry_after: true }, {}, 10_000],
  ["empty header fallback", undefined, { "retry-after": "" }, 10_000],
  [
    "negative numeric header fallback",
    undefined,
    { "retry-after": "-1" },
    10_000,
  ],
  ["exponent header fallback", undefined, { "retry-after": "1e2" }, 10_000],
  ["overflow body fallback", { retry_after: 1e100 }, {}, 10_000],
];
for (const [name, body, headers, delay] of rateCases) {
  test(`429 ${name} waits correct interval and counts an attempt`, async () => {
    let count = 0;
    const h = harness(async () =>
      ++count === 1 ? response(429, body, headers) : response(204),
    );
    h.dispatch();
    await h.clock.advance(delay - 1);
    assert.equal(h.calls.length, 1);
    await h.clock.advance(1);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].at, delay);
    assert.equal(h.warnings(), 0);
    assert.equal(h.clock.active, 0);
  });
}

test("header date/reset values are relative to receipt time and stale values fall back", () => {
  assert.equal(
    rateLimitDelay(
      new Headers({
        "retry-after": new Date(30_000).toUTCString(),
        "x-ratelimit-reset": "40",
      }),
      null,
      5000,
    ),
    35_000,
  );
  assert.equal(
    rateLimitDelay(
      new Headers({
        "retry-after": new Date(0).toUTCString(),
        "x-ratelimit-reset": "0",
      }),
      { retry_after: null },
      50_000,
    ),
    10_000,
  );
});

test("repeated 429s stop after five attempts, not an unlimited rate-limit loop", async () => {
  const h = harness(async () => response(429, { retry_after: 11 }));
  h.dispatch();
  await h.clock.advance(50_000);
  assert.equal(h.calls.length, 5);
  assert.equal(h.warnings(), 1);
  assert.equal(h.clock.active, 0);
});

test("malformed or oversized 429 body uses header interval safely", async () => {
  for (const body of ["not JSON private-token", "x".repeat(8193)]) {
    let count = 0;
    const h = harness(async () =>
      ++count === 1
        ? new Response(body, { status: 429, headers: { "retry-after": "12" } })
        : response(204),
    );
    h.dispatch();
    await h.clock.advance(12_000);
    assert.equal(h.calls.length, 2);
    assert.equal(h.warnings(), 0);
    assert.equal(h.clock.active, 0);
  }
});

test("429 body stall is inside the finite request timeout and cancels its reader", async () => {
  let canceled = 0;
  let count = 0;
  const stream = new ReadableStream({
    cancel() {
      ++canceled;
    },
  });
  const h = harness(async () =>
    ++count === 1 ? new Response(stream, { status: 429 }) : response(204),
  );
  h.dispatch();
  await h.clock.advance(10_000);
  assert.equal(canceled, 1);
  await h.clock.advance(10_000);
  assert.equal(h.calls.length, 2);
  assert.equal(h.clock.active, 0);
});

test("429 body timeout retains a known header rate-limit interval", async () => {
  let count = 0;
  const h = harness(async () =>
    ++count === 1
      ? new Response(new ReadableStream({}), {
          status: 429,
          headers: { "retry-after": "60" },
        })
      : response(204),
  );
  h.dispatch();
  await h.clock.advance(69_999);
  assert.equal(h.calls.length, 1);
  await h.clock.advance(1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].at, 70_000);
  assert.equal(h.clock.active, 0);
});

test("large valid intervals are chunked rather than overflowing Node timers", async () => {
  let count = 0;
  const interval = 2_147_483_647 + 5000;
  const h = harness(async () =>
    ++count === 1
      ? response(429, { retry_after: interval / 1000 })
      : response(204),
  );
  h.dispatch();
  await h.clock.advance(interval - 1);
  assert.equal(h.calls.length, 1);
  await h.clock.advance(1);
  assert.equal(h.calls.length, 2);
  assert.ok(h.clock.scheduled.every((ms) => ms <= 2_147_483_647));
});

test("shutdown aborts outstanding requests and retry timers, is idempotent and rejects later dispatch", async () => {
  for (const request of [
    () => new Promise<Response>(() => {}),
    async () => response(503),
  ]) {
    const h = harness(request);
    h.dispatch();
    await flush();
    assert.equal(h.clock.active, 1);
    h.jobs.shutdown();
    h.jobs.shutdown();
    await flush();
    assert.equal(h.clock.active, 0);
    assert.equal(h.calls[0].init.signal?.aborted, true);
    h.dispatch();
    await h.clock.advance(100_000);
    assert.equal(h.calls.length, 1);
    assert.equal(h.warnings(), 0);
  }
});

test("unexpected async port errors and throwing final UI never cause unhandled rejection", async () => {
  const unhandled: unknown[] = [];
  const listener = (error: unknown) => {
    unhandled.push(error);
  };
  process.on("unhandledRejection", listener);
  try {
    const clock = new FakeClock();
    const jobs = new DeliveryJobs({
      request: async () => response(400),
      scheduler: clock,
    });
    jobs.dispatch(webhookUrl, payload, () => {
      throw new Error(webhookUrl);
    });
    const broken = new DeliveryJobs({
      request: async () => response(503),
      scheduler: {
        schedule() {
          throw new Error(webhookUrl);
        },
      },
    });
    broken.dispatch(webhookUrl, payload, () => {
      throw new Error(webhookUrl);
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
    assert.equal(clock.active, 0);
  } finally {
    process.off("unhandledRejection", listener);
  }
});

test("true process beforeExit aborts jobs even without a surviving session handler", () => {
  const modulePath = new URL("./delivery.ts", import.meta.url).href;
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `const {DeliveryJobs} = await import(${JSON.stringify(modulePath)});
    const jobs = new DeliveryJobs({ request: (_url, init) => {
      init.signal.addEventListener('abort', () => console.log('aborted'));
      return new Promise(() => {});
    } });
    jobs.dispatch('https://discord.com/api/webhooks/123/synthetic-token', {}, () => { throw Error('unexpected warning'); });
    console.log('ready');`,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /ready/);
  assert.match(child.stdout, /aborted/);
});

test("production timeout/delay scheduler does not keep a standalone process alive", () => {
  const modulePath = new URL("./delivery.ts", import.meta.url).href;
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `const {unreferencedScheduler} = await import(${JSON.stringify(modulePath)}); unreferencedScheduler.schedule(() => {throw Error('timer fired')},60000); console.log('ready');`,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /ready/);
});
