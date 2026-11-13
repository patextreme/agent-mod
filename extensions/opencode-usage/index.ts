/**
 * pi-opencode-usage — OpenCode Go allowance usage and peak state in the footer
 *
 * Reads OpenCode Go's undocumented `GET /inference/go/v1/usage` endpoint (the
 * inference-gateway meters behind the Go plan; it may change or disappear
 * without notice) and shows the consumed percentage of the rolling (five-hour),
 * weekly, and monthly allowances as a footer status slot:
 * `opencode-go: 3.0% / 1.0% / 0.0%` (rolling / weekly / monthly).
 *
 * While an opencode-go model with recurring weekday/hour pricing multipliers is
 * selected, the slot also reports the current side of the published peak
 * schedule and the time to its next boundary:
 * `opencode-go: 3.0% / 1.0% / 0.0% · peak · 3h01m left`. The schedule comes
 * from the undocumented `GET /inference/go/v1/models` catalog rather than a
 * hardcoded table; date-only promo multipliers never produce a tag.
 *
 * Refreshes on `session_start` when the current model is already opencode-go,
 * on `model_select` for opencode-go, and via `/opencode-usage-refresh`.
 * Switching to any other provider clears the slot and cancels the timer. One
 * self-rescheduling timer repaints at the earlier of the next boundary and the
 * next countdown change; it never fetches. The catalog is fetched at most once
 * per process and cached only on success, so a failure retries on the next
 * trigger. Reuses pi's resolved opencode-go provider key (`ctx.modelRegistry`),
 * so no separate configuration is needed.
 *
 * Both endpoints are undocumented and treated as unstable: every failure path
 * is non-throwing. A failed usage read still shows the peak tag; a failed
 * catalog read still shows the meters without a tag. A missing provider key
 * silently clears the slot. Automatic refreshes never notify — only the
 * explicit `/opencode-usage-refresh` command reports outcomes.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  formatUsage,
  isUnknownUsage,
  parseUsage,
  UNKNOWN_USAGE,
  type Usage,
} from "./parse.js";
import {
  type Catalog,
  formatCountdown,
  formatWindow,
  isPeakActive,
  nextRepaintAt,
  type PeakSchedule,
  parseCatalog,
  scheduleForModel,
} from "./peak.js";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Footer status slot key. */
const STATUS_KEY = "opencode-usage";

/** Exact pi provider id for OpenCode Go. No fuzzy matching. */
const PROVIDER_ID = "opencode-go";

/** Undocumented OpenCode Go allowance endpoint on the inference gateway. */
const USAGE_API_URL = "https://opencode.ai/inference/go/v1/usage";

/** Undocumented model catalog carrying pricing multipliers. */
const CATALOG_API_URL = "https://opencode.ai/inference/go/v1/models";

/** Identify this client; OpenCode Go asks integrations not to use a generic UA. */
const USER_AGENT = "pi-opencode-usage/1.0";

/** Abort a hung fetch after this many milliseconds (don't block selection). */
const FETCH_TIMEOUT_MS = 8_000;

// ─── Usage fetch ────────────────────────────────────────────────────────────

interface FetchResult {
  /** Parsed consumed percentages; null per window when unknown. */
  usage: Usage;
  /** Human-readable failure reason. `undefined` (not empty) means opencode-go is absent. */
  error?: string;
}

interface CatalogResult {
  /** Parsed catalog, or null when unavailable. */
  catalog: Catalog | null;
  /** Human-readable failure reason. `undefined` (not empty) means no fetch was needed. */
  error?: string;
}

type NotificationLevel = "info" | "warning" | "error";

/** Outcome for callers that asked explicitly (null = nothing to say). */
type Notification = { message: string; level: NotificationLevel };

interface RefreshOutcome {
  usage: FetchResult;
  catalog: CatalogResult;
}

/**
 * Fetch the current rolling/weekly/monthly usage. Never throws: every failure
 * path returns null windows plus a reason when something was actually
 * attempted.
 */
async function fetchUsage(ctx: ExtensionContext): Promise<FetchResult> {
  const key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID);
  if (key === undefined) {
    // Provider not configured: no key, no fetch, no error message.
    return { usage: UNKNOWN_USAGE };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(USAGE_API_URL, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        usage: UNKNOWN_USAGE,
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }
    const usage = parseUsage(await response.text());
    if (isUnknownUsage(usage)) {
      return { usage: UNKNOWN_USAGE, error: "malformed response body" };
    }
    return { usage };
  } catch (err) {
    return {
      usage: UNKNOWN_USAGE,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Catalog fetch ──────────────────────────────────────────────────────────

/**
 * Fetch the model catalog with the same resolved opencode-go key. Never
 * throws: a missing key is silent, and every other failure returns null plus
 * a reason.
 */
async function fetchCatalog(ctx: ExtensionContext): Promise<CatalogResult> {
  let key: string | undefined;
  try {
    key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID);
  } catch (err) {
    return {
      catalog: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (key === undefined) return { catalog: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(CATALOG_API_URL, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        catalog: null,
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }
    const catalog = parseCatalog(await response.text());
    if (catalog === null) {
      return { catalog: null, error: "malformed response body" };
    }
    return { catalog };
  } catch (err) {
    return {
      catalog: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function opencodeUsageExtension(pi: ExtensionAPI): void {
  // Bumped on every trigger so an in-flight fetches from a previous selection
  // can never clobber a newer state (e.g. switching away from opencode-go
  // while its fetch is still running).
  let refreshGeneration = 0;

  // Latest state of the current selection, used by timer repaints.
  let activeModelId: string | undefined;
  let lastUsage: Usage = UNKNOWN_USAGE;
  let usageError: string | undefined;
  let usageSettled = false;
  let catalog: Catalog | null = null;

  // One success-only process cache plus a shared in-flight request. Failures
  // are never cached, so the next trigger retries.
  let catalogCache: Catalog | undefined;
  let catalogInFlight: Promise<CatalogResult> | undefined;

  // One self-rescheduling repaint timer. It only redraws cached state.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerCtx: ExtensionContext | undefined;

  /** Idempotently stop the repaint timer. */
  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function forgetUsage(): void {
    lastUsage = UNKNOWN_USAGE;
    usageError = undefined;
    usageSettled = false;
  }

  /**
   * Resolve the catalog, sharing one request and caching only success. A
   * failure leaves the cache empty and is retried by the next trigger.
   */
  function ensureCatalog(ctx: ExtensionContext): Promise<CatalogResult> {
    if (catalogCache !== undefined) {
      return Promise.resolve({ catalog: catalogCache });
    }
    if (catalogInFlight !== undefined) return catalogInFlight;

    const request = fetchCatalog(ctx)
      .then((result) => {
        if (result.catalog !== null) catalogCache = result.catalog;
        return result;
      })
      .catch((err: unknown) => ({
        catalog: null,
        error: err instanceof Error ? err.message : String(err),
      }));
    catalogInFlight = request;
    void request.finally(() => {
      if (catalogInFlight === request) catalogInFlight = undefined;
    });
    return request;
  }

  /** Repaint from cached state; the timer calls only this. */
  function render(ctx: ExtensionContext): void {
    if (activeModelId === undefined || !usageSettled) return;

    if (isUnknownUsage(lastUsage) && usageError === undefined) {
      // No opencode-go key configured: clear the slot silently.
      clearTimer();
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    const schedule =
      catalog === null ? null : scheduleForModel(catalog, activeModelId);
    let text = formatUsage(lastUsage);
    let peak = false;
    if (schedule !== null) {
      const now = new Date();
      const countdown = formatCountdown(schedule, now);
      if (countdown !== null) {
        peak = isPeakActive(schedule, now);
        text += ` · ${peak ? "peak" : "off-peak"} · ${countdown}`;
      }
    }

    ctx.ui.setStatus(
      STATUS_KEY,
      ctx.ui.theme.fg(peak ? "warning" : "dim", text),
    );
    if (schedule === null) clearTimer();
    else scheduleTimer(ctx, schedule);
  }

  /** Arm the one repaint timer at the next visual change. Never fetches. */
  function scheduleTimer(ctx: ExtensionContext, schedule: PeakSchedule): void {
    clearTimer();
    const now = new Date();
    const next = nextRepaintAt(schedule, now);
    if (next === null) return;
    timerCtx = ctx;
    timer = setTimeout(
      () => {
        timer = undefined;
        if (timerCtx !== undefined) render(timerCtx);
      },
      Math.max(1, next.getTime() - now.getTime()),
    );
  }

  /**
   * One sync path for every model trigger: fetch usage and the catalog for
   * opencode-go, or clear the slot (and timer) for anything else.
   */
  function sync(
    ctx: ExtensionContext,
    model: ExtensionContext["model"],
  ): Promise<RefreshOutcome | null> {
    if (!ctx.hasUI) return Promise.resolve(null);
    clearTimer();

    if (model?.provider !== PROVIDER_ID) {
      refreshGeneration++; // invalidate any in-flight fetch
      activeModelId = undefined;
      catalog = null;
      forgetUsage();
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return Promise.resolve(null);
    }

    activeModelId = model.id;
    catalog = catalogCache ?? null;
    const generation = ++refreshGeneration;

    const usagePromise = fetchUsage(ctx)
      .catch((err: unknown) => ({
        usage: UNKNOWN_USAGE,
        error: err instanceof Error ? err.message : String(err),
      }))
      .then((result) => {
        if (generation === refreshGeneration) {
          lastUsage = result.usage;
          usageError = result.error;
          usageSettled = true;
          render(ctx);
        }
        return result;
      });

    const catalogPromise = ensureCatalog(ctx).then((result) => {
      if (generation === refreshGeneration) {
        catalog = result.catalog;
        render(ctx);
      }
      return result;
    });

    return Promise.all([usagePromise, catalogPromise]).then(
      ([usage, catalog]) => ({ usage, catalog }),
    );
  }

  // Re-seed on session start when the session's model is already opencode-go:
  // the slot is rebuilt on /new, /resume, and /fork, and model_select may not
  // fire for the default model at plain startup. Fire-and-forget: a slow or
  // unreachable endpoint must not block startup.
  pi.on("session_start", (_event, ctx) => {
    void sync(ctx, ctx.model).catch(() => {});
  });

  // Primary trigger: selection of an opencode-go model (via /model, cycling,
  // or session restore). Selecting anything else clears the slot.
  pi.on("model_select", (event, ctx) => {
    void sync(ctx, event.model).catch(() => {});
  });

  // Stop the self-rescheduling timer when the runtime is torn down for quit,
  // reload, or session replacement.
  pi.on("session_shutdown", () => {
    refreshGeneration++;
    clearTimer();
    timerCtx = undefined;
    activeModelId = undefined;
    catalog = null;
    forgetUsage();
  });

  // Manual refresh. Since the user asked explicitly, report the absolute
  // window when the meters are available, then any failures. Automatic
  // refreshes above stay silent.
  pi.registerCommand("opencode-usage-refresh", {
    description: "Refresh the OpenCode Go usage shown in the status bar",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const model = ctx.model;
      const outcome = await sync(ctx, model).catch(() => null);
      if (outcome === null) return;

      const modelId = model?.id;
      const schedule =
        modelId !== undefined && outcome.catalog.catalog !== null
          ? scheduleForModel(outcome.catalog.catalog, modelId)
          : null;
      const window =
        schedule === null ? null : formatWindow(schedule, new Date());

      if (!isUnknownUsage(outcome.usage.usage) || window !== null) {
        let message = formatUsage(outcome.usage.usage);
        if (window !== null) message += ` · ${window}`;
        ctx.ui.notify(message, "info");
      }

      for (const notification of [
        usageNotification(outcome.usage),
        catalogNotification(outcome.catalog),
      ]) {
        if (notification !== null) {
          ctx.ui.notify(notification.message, notification.level);
        }
      }
    },
  });
}

function usageNotification(result: FetchResult): Notification | null {
  if (!isUnknownUsage(result.usage)) return null;
  if (result.error === undefined) {
    return {
      message: "opencode-go provider is not configured.",
      level: "warning",
    };
  }
  return {
    message: `Failed to fetch OpenCode usage (${result.error}).`,
    level: "error",
  };
}

function catalogNotification(result: CatalogResult): Notification | null {
  if (result.catalog !== null || result.error === undefined) return null;
  return {
    message: `OpenCode peak schedule unavailable (${result.error}).`,
    level: "warning",
  };
}
