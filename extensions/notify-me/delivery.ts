import type { DiscordPayload } from "./payload.js";

export const REQUEST_TIMEOUT_MS = 10_000;
export const RETRY_DELAY_MS = 10_000;
export const MAX_ATTEMPTS = 5;
export const DELIVERY_WARNING =
  "Discord notification delivery failed after bounded attempts. Check your webhook configuration and network; this one-shot will not be retried again.";

export interface Timer {
  cancel(): void;
}
export interface Scheduler {
  schedule(callback: () => void, milliseconds: number): Timer;
}
export const unreferencedScheduler: Scheduler = {
  schedule(callback, milliseconds) {
    const timer = setTimeout(callback, milliseconds);
    timer.unref();
    return { cancel: () => clearTimeout(timer) };
  },
};
export type Request = (url: string, init: RequestInit) => Promise<Response>;
export interface DeliveryDependencies {
  request?: Request;
  scheduler?: Scheduler;
  now?: () => number;
}
interface AttemptResult {
  delivered: boolean;
  retry: boolean;
  delay: number;
}

function seconds(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim()))
    return undefined;
  const ms = Number(value) * 1000;
  return Number.isFinite(ms) && ms >= 0 && ms <= Number.MAX_SAFE_INTEGER
    ? ms
    : undefined;
}

/** Discord JSON and reset-after headers are seconds (including fractions). */
export function rateLimitDelay(
  headers: Headers,
  body: unknown,
  now: number,
): number {
  const retryAfter = headers.get("retry-after");
  const numeric = retryAfter === null ? undefined : seconds(retryAfter);
  const date =
    retryAfter && numeric === undefined && /GMT$/i.test(retryAfter)
      ? Date.parse(retryAfter) - now
      : undefined;
  const reset = seconds(headers.get("x-ratelimit-reset"));
  const json =
    body && typeof body === "object" && "retry_after" in body
      ? seconds(body.retry_after)
      : undefined;
  const values = [
    numeric,
    date,
    seconds(headers.get("x-ratelimit-reset-after")),
    reset === undefined ? undefined : reset - now,
    json,
  ];
  return Math.max(
    RETRY_DELAY_MS,
    ...values.filter(
      (value): value is number =>
        value !== undefined &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= Number.MAX_SAFE_INTEGER,
    ),
  );
}

function discard(response: Response): void {
  // Never read or diagnose untrusted response bodies except bounded 429 metadata.
  void response.body?.cancel().catch(() => {});
}

async function rateLimitBody(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 8192) return undefined;
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

// Pi creates a fresh extension runtime on /new, /resume and /fork. Keep only
// active delivery ownership at process scope so a later runtime's quit can
// release jobs dispatched by an outgoing runtime. This is never persistence.
const processJobsKey = Symbol.for(
  "patextreme.agent-mod.notify-me.active-delivery",
);
interface ProcessJobs {
  readonly owners: Set<DeliveryJobs>;
  readonly cleanup: () => void;
  listening: boolean;
}
const processScope = globalThis as typeof globalThis & {
  [key: symbol]: ProcessJobs | undefined;
};

function processJobs(): ProcessJobs {
  const existing = processScope[processJobsKey];
  if (existing) return existing;
  const owners = new Set<DeliveryJobs>();
  const hub: ProcessJobs = {
    owners,
    listening: false,
    cleanup: () => {
      for (const owner of [...owners]) owner.shutdown();
    },
  };
  processScope[processJobsKey] = hub;
  return hub;
}

function acquire(owner: DeliveryJobs): void {
  const hub = processJobs();
  hub.owners.add(owner);
  if (!hub.listening) {
    hub.listening = true;
    process.on("beforeExit", hub.cleanup);
    process.on("exit", hub.cleanup);
  }
}

function release(owner: DeliveryJobs): void {
  const hub = processJobs();
  hub.owners.delete(owner);
  if (!hub.owners.size && hub.listening) {
    process.off("beforeExit", hub.cleanup);
    process.off("exit", hub.cleanup);
    hub.listening = false;
  }
}

/** True quit/reload cleans current and outgoing runtimes' active jobs. */
export function shutdownDeliveryJobs(): void {
  processScope[processJobsKey]?.cleanup();
}

/** Each job owns a serialized payload and credential, never pending/session state. */
export class DeliveryJobs {
  private readonly jobs = new Set<AbortController>();
  private closed = false;
  private readonly request: Request;
  private readonly scheduler: Scheduler;
  private readonly now: () => number;

  constructor(dependencies: DeliveryDependencies = {}) {
    this.request = dependencies.request ?? fetch;
    this.scheduler = dependencies.scheduler ?? unreferencedScheduler;
    this.now = dependencies.now ?? Date.now;
  }

  dispatch(
    webhookUrl: string,
    payload: DiscordPayload,
    warn: () => void,
  ): void {
    if (this.closed) return;
    const controller = new AbortController();
    this.jobs.add(controller);
    acquire(this);
    const safeWarn = () => {
      if (!controller.signal.aborted) {
        try {
          warn();
        } catch {
          /* UI may have shut down. */
        }
      }
    };
    // Serialization happens once, before any await. No mutable input is retained.
    try {
      const body = JSON.stringify(payload);
      void this.run(webhookUrl, body, controller.signal, safeWarn)
        .catch(safeWarn)
        .finally(() => {
          this.jobs.delete(controller);
          if (!this.jobs.size) release(this);
        });
    } catch {
      this.jobs.delete(controller);
      if (!this.jobs.size) release(this);
      safeWarn();
    }
  }

  shutdown(): void {
    this.closed = true;
    for (const controller of this.jobs) controller.abort();
    this.jobs.clear();
    release(this);
  }

  private async run(
    url: string,
    body: string,
    signal: AbortSignal,
    warn: () => void,
  ): Promise<void> {
    for (
      let attempt = 1;
      attempt <= MAX_ATTEMPTS && !signal.aborted;
      ++attempt
    ) {
      const result = await this.attempt(url, body, signal);
      if (signal.aborted || result.delivered) return;
      if (!result.retry || attempt === MAX_ATTEMPTS) {
        warn();
        return;
      }
      if (!(await this.wait(result.delay, signal))) return;
    }
  }

  private async attempt(
    url: string,
    body: string,
    signal: AbortSignal,
  ): Promise<AttemptResult> {
    const controller = new AbortController();
    let timer: Timer | undefined;
    let failureDelay = RETRY_DELAY_MS;
    let abort: () => void = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => {
      abort = () => {
        controller.abort();
        reject(new Error("Request interrupted"));
      };
      signal.addEventListener("abort", abort, { once: true });
      timer = this.scheduler.schedule(abort, REQUEST_TIMEOUT_MS);
    });
    try {
      if (signal.aborted) abort();
      const operation = async (): Promise<AttemptResult> => {
        const response = await this.request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
          redirect: "manual",
        });
        if (controller.signal.aborted) {
          discard(response);
          return { delivered: false, retry: true, delay: RETRY_DELAY_MS };
        }
        if (response.status === 429) {
          // Retain known header intervals even if the response body times out.
          failureDelay = rateLimitDelay(
            response.headers,
            undefined,
            this.now(),
          );
          const metadata = await rateLimitBody(response, controller.signal);
          return {
            delivered: false,
            retry: true,
            delay: rateLimitDelay(response.headers, metadata, this.now()),
          };
        }
        discard(response);
        return {
          delivered: response.status >= 200 && response.status < 300,
          retry: response.status >= 500 && response.status < 600,
          delay: RETRY_DELAY_MS,
        };
      };
      return await Promise.race([operation(), interrupted]);
    } catch {
      // Never interpolate network errors, URLs, response bodies or credentials.
      return { delivered: false, retry: true, delay: failureDelay };
    } finally {
      timer?.cancel();
      signal.removeEventListener("abort", abort);
      controller.abort();
    }
  }

  private async wait(
    milliseconds: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    // Node clamps oversized setTimeout values to 1ms; chunk them instead.
    let remaining = milliseconds;
    while (remaining > 0 && !signal.aborted) {
      const chunk = Math.min(remaining, 2_147_483_647);
      const completed = await new Promise<boolean>((resolve) => {
        let timer: Timer | undefined;
        const finish = (value: boolean) => {
          timer?.cancel();
          signal.removeEventListener("abort", abort);
          resolve(value);
        };
        const abort = () => finish(false);
        signal.addEventListener("abort", abort, { once: true });
        timer = this.scheduler.schedule(() => finish(true), chunk);
        if (signal.aborted) finish(false);
      });
      if (!completed) return false;
      remaining -= chunk;
    }
    return !signal.aborted;
  }
}
