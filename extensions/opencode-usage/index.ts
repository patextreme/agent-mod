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
 * Automatic triggers clear the slot for any other provider. The explicit
 * command always fetches and paints usage for the selected model, adding the
 * peak tag only when that model is eligible. One self-rescheduling timer
 * repaints at the earlier of the next boundary and the next countdown change;
 * it never fetches. The catalog is fetched at most once per process and cached
 * only on success, so a failure retries on the next trigger. Reuses pi's
 * resolved opencode-go provider key (`ctx.modelRegistry`), so no separate
 * configuration is needed.
 *
 * Both endpoints are undocumented and treated as unstable: every failure path
 * is non-throwing. A failed usage read still shows the peak tag; a failed
 * catalog read still shows the meters without a tag. A missing provider key
 * silently clears the slot on automatic triggers. Automatic refreshes never
 * notify; the explicit command reports usage once and adds at most one catalog
 * warning.
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

// ─── Shared request ─────────────────────────────────────────────────────────

interface UsageRead {
  /** Parsed consumed percentages; null per window when unknown. */
  usage: Usage;
  /** Human-readable failure reason. `undefined` (not empty) means opencode-go is absent. */
  error?: string;
}

interface CatalogRead {
  /** Parsed catalog, or null when unavailable. */
  catalog: Catalog | null;
  /** Human-readable failure reason. `undefined` (not empty) means no fetch was needed. */
  error?: string;
}

interface JsonTextResult {
  text: string | null;
  /** Failure reason for a key-resolution, HTTP, or transport failure. */
  error?: string;
  /** The provider has no resolved key; callers stay silent. */
  missingKey?: boolean;
}

/**
 * Resolve the provider key and read one JSON response body as text. One key and
 * error policy for both endpoints: a missing key is silent, everything else
 * returns a reason. Never throws.
 */
async function getJsonText(
  ctx: ExtensionContext,
  url: string,
): Promise<JsonTextResult> {
  let key: string | undefined;
  try {
    key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID);
  } catch (err) {
    return { text: null, error: errorMessage(err) };
  }
  if (key === undefined) return { text: null, missingKey: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        text: null,
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }
    return { text: await response.text() };
  } catch (err) {
    return { text: null, error: errorMessage(err) };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the current rolling/weekly/monthly usage. Never throws: every failure
 * path yields null windows plus a reason when something was actually attempted.
 */
async function fetchUsage(ctx: ExtensionContext): Promise<UsageRead> {
  const result = await getJsonText(ctx, USAGE_API_URL);
  if (result.missingKey) return { usage: UNKNOWN_USAGE };
  if (result.text === null) {
    return { usage: UNKNOWN_USAGE, error: result.error };
  }
  const usage = parseUsage(result.text);
  if (isUnknownUsage(usage)) {
    return { usage: UNKNOWN_USAGE, error: "malformed response body" };
  }
  return { usage };
}

/**
 * Fetch the model catalog with the same resolved key. Never throws: a missing
 * key is silent, and every other failure yields null plus a reason.
 */
async function fetchCatalog(ctx: ExtensionContext): Promise<CatalogRead> {
  const result = await getJsonText(ctx, CATALOG_API_URL);
  if (result.missingKey) return { catalog: null };
  if (result.text === null) {
    return { catalog: null, error: result.error };
  }
  const catalog = parseCatalog(result.text);
  if (catalog === null) {
    return { catalog: null, error: "malformed response body" };
  }
  return { catalog };
}

// ─── Extension ──────────────────────────────────────────────────────────────

type NotificationLevel = "info" | "warning" | "error";

interface Notification {
  message: string;
  level: NotificationLevel;
}

/** Flattened result of one refresh, for the explicit command. */
interface RefreshOutcome {
  usage: Usage;
  usageError?: string;
  catalog: Catalog | null;
  catalogError?: string;
}

/** Everything tied to the current selection; reset together on every trigger. */
interface SelectionState {
  modelId: string | undefined;
  usage: Usage;
  usageError: string | undefined;
  usageSettled: boolean;
  catalog: Catalog | null;
}

interface PeakStatus {
  schedule: PeakSchedule;
  peak: boolean;
  countdown: string;
}

function emptySelection(): SelectionState {
  return {
    modelId: undefined,
    usage: UNKNOWN_USAGE,
    usageError: undefined,
    usageSettled: false,
    catalog: null,
  };
}

/** Derive the catalog tag once for both footer rendering and refresh output. */
function peakStatus(
  catalog: Catalog | null,
  modelId: string | undefined,
  instant: Date,
): PeakStatus | null {
  if (catalog === null || modelId === undefined) return null;
  const schedule = scheduleForModel(catalog, modelId);
  if (schedule === null) return null;
  const countdown = formatCountdown(schedule, instant);
  if (countdown === null) return null;
  return {
    schedule,
    peak: isPeakActive(schedule, instant),
    countdown,
  };
}

export default function opencodeUsageExtension(pi: ExtensionAPI): void {
  // Bumped on every trigger so in-flight fetches from a previous selection can
  // never clobber a newer state (e.g. switching away from opencode-go while its
  // fetch is still running).
  let refreshGeneration = 0;

  // Latest state of the current selection, used by timer repaints.
  let selection = emptySelection();

  // One success-only process cache plus a shared in-flight request. Failures
  // are never cached, so the next trigger retries.
  let catalogCache: Catalog | undefined;
  let catalogInFlight: Promise<CatalogRead> | undefined;

  // One self-rescheduling repaint timer. It only redraws cached state.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerCtx: ExtensionContext | undefined;

  function resetSelection(): void {
    selection = emptySelection();
  }

  /** Idempotently stop the repaint timer. */
  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  /**
   * Resolve the catalog, sharing one request and caching only success. A
   * failure leaves the cache empty and is retried by the next trigger.
   */
  function ensureCatalog(ctx: ExtensionContext): Promise<CatalogRead> {
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
        error: errorMessage(err),
      }));
    catalogInFlight = request;
    void request.finally(() => {
      if (catalogInFlight === request) catalogInFlight = undefined;
    });
    return request;
  }

  /** Repaint from cached state; the timer calls only this. */
  function render(ctx: ExtensionContext): void {
    if (!selection.usageSettled) return;

    if (isUnknownUsage(selection.usage) && selection.usageError === undefined) {
      // No opencode-go key configured: clear the slot silently.
      clearTimer();
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    const meters = ctx.ui.theme.fg("dim", formatUsage(selection.usage));
    const status = peakStatus(selection.catalog, selection.modelId, new Date());
    if (status === null) {
      ctx.ui.setStatus(STATUS_KEY, meters);
      clearTimer();
      return;
    }

    const tag = `${status.peak ? "peak" : "off-peak"} · ${status.countdown}`;
    const coloredTag = ctx.ui.theme.fg(status.peak ? "warning" : "dim", tag);
    ctx.ui.setStatus(STATUS_KEY, `${meters} · ${coloredTag}`);
    scheduleTimer(ctx, status.schedule);
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
   * One sync path for every trigger. Automatic triggers clear the slot for
   * non-opencode-go models; an explicit refresh instead fetches and paints
   * usage for whatever model is selected, and only adds the catalog tag when
   * the model is eligible.
   */
  function sync(
    ctx: ExtensionContext,
    model: ExtensionContext["model"],
    explicit = false,
  ): Promise<RefreshOutcome | null> {
    if (!ctx.hasUI) return Promise.resolve(null);
    clearTimer();

    const eligible = model?.provider === PROVIDER_ID;
    if (!eligible && !explicit) {
      refreshGeneration++; // invalidate any in-flight fetch
      resetSelection();
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return Promise.resolve(null);
    }

    const generation = ++refreshGeneration;
    selection = {
      ...emptySelection(),
      modelId: model?.id,
      catalog: eligible ? (catalogCache ?? null) : null,
    };

    const usagePromise = fetchUsage(ctx).then((result) => {
      if (generation === refreshGeneration) {
        selection.usage = result.usage;
        selection.usageError = result.error;
        selection.usageSettled = true;
        render(ctx);
      }
      return result;
    });

    const catalogPromise: Promise<CatalogRead> = eligible
      ? ensureCatalog(ctx).then((result) => {
          if (generation === refreshGeneration) {
            selection.catalog = result.catalog;
            render(ctx);
          }
          return result;
        })
      : Promise.resolve({ catalog: null });

    return Promise.all([usagePromise, catalogPromise]).then(
      ([usage, catalog]) => ({
        usage: usage.usage,
        usageError: usage.error,
        catalog: catalog.catalog,
        catalogError: catalog.error,
      }),
    );
  }

  // Re-seed on session start when the session's model is already opencode-go:
  // the slot is rebuilt on /new, /resume, and /fork, and model_select may not
  // fire for the default model at plain startup. Fire-and-forget: a slow or
  // unreachable endpoint must not block startup.
  pi.on("session_start", (_event, ctx) => {
    void sync(ctx, ctx.model).catch(() => {});
  });

  // Primary automatic trigger: selection of an opencode-go model (via /model,
  // cycling, or session restore). Selecting anything else clears the slot.
  pi.on("model_select", (event, ctx) => {
    void sync(ctx, event.model).catch(() => {});
  });

  // Stop the self-rescheduling timer when the runtime is torn down for quit,
  // reload, or session replacement.
  pi.on("session_shutdown", () => {
    refreshGeneration++;
    clearTimer();
    timerCtx = undefined;
    resetSelection();
  });

  // Manual refresh. The user asked explicitly, so this always refreshes usage
  // for the selected model even when it is not opencode-go; the peak tag and
  // absolute window appear only when that model is eligible. Report usage once
  // and add at most one catalog warning. Automatic refreshes stay silent.
  pi.registerCommand("opencode-usage-refresh", {
    description:
      "Refresh the OpenCode Go usage shown in the footer status slot",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const model = ctx.model;
      const outcome = await sync(ctx, model, true).catch(() => null);
      if (outcome === null) return;

      const now = new Date();
      const status = peakStatus(outcome.catalog, model?.id, now);
      const window =
        status === null ? null : formatWindow(status.schedule, now);

      const report = usageReport(outcome, window);
      ctx.ui.notify(report.message, report.level);

      const warning = catalogNotification(outcome);
      if (warning !== null) ctx.ui.notify(warning.message, warning.level);
    },
  });
}

/** One usage-window report, using `?` meters when only the window is known. */
function usageReport(
  outcome: RefreshOutcome,
  window: string | null,
): Notification {
  const meters = formatUsage(outcome.usage);
  if (!isUnknownUsage(outcome.usage) || window !== null) {
    return {
      message: window === null ? meters : `${meters} · ${window}`,
      level: "info",
    };
  }
  if (outcome.usageError === undefined) {
    return {
      message: "opencode-go provider is not configured.",
      level: "warning",
    };
  }
  return {
    message: `Failed to fetch OpenCode usage (${outcome.usageError}).`,
    level: "error",
  };
}

function catalogNotification(outcome: RefreshOutcome): Notification | null {
  if (outcome.catalog !== null || outcome.catalogError === undefined) {
    return null;
  }
  return {
    message: `OpenCode peak schedule unavailable (${outcome.catalogError}).`,
    level: "warning",
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
