/**
 * pi-opencode-usage — OpenCode Go allowance usage in the pi status bar
 *
 * Reads OpenCode Go's undocumented `GET /inference/go/v1/usage` endpoint (the
 * inference-gateway meters behind the Go plan; it may change or disappear
 * without notice) and shows the consumed percentage of the rolling (five-hour),
 * weekly, and monthly allowances as a footer status slot:
 * `opencode-go: 3% / 1% / 0%` (rolling / weekly / monthly).
 *
 * Refreshes on `session_start` when the current model is already opencode-go,
 * on `model_select` for opencode-go, and via `/opencode-usage-refresh`.
 * Switching to any other provider clears the slot and invalidates an in-flight
 * fetch. There is no polling and no timer. Reuses pi's resolved opencode-go
 * provider key (`ctx.modelRegistry`), so no separate configuration is needed.
 *
 * The endpoint is undocumented and treated as unstable: every failure path is
 * non-throwing and stateless. A failed fetch renders the dim placeholder
 * (`opencode-go: ? / ? / ?`); a missing provider key silently clears the slot.
 * Nothing is cached and automatic refreshes never notify — only the explicit
 * `/opencode-usage-refresh` command reports failures, mirroring the ollama-usage
 * extension.
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

// ─── Constants ──────────────────────────────────────────────────────────────

/** Footer status slot key. */
const STATUS_KEY = "opencode-usage";

/** Exact pi provider id for OpenCode Go. No fuzzy matching. */
const PROVIDER_ID = "opencode-go";

/** Undocumented OpenCode Go allowance endpoint on the inference gateway. */
const USAGE_API_URL = "https://opencode.ai/inference/go/v1/usage";

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

/** Optional outcome for callers that asked explicitly (null = success, nothing to say). */
type Notification = { message: string; level: "warning" | "error" };

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

// ─── Extension ──────────────────────────────────────────────────────────────

export default function opencodeUsageExtension(pi: ExtensionAPI): void {
  // Bumped on every trigger so an in-flight fetch from a previous selection
  // can never clobber a newer state (e.g. switching away from opencode-go
  // while its fetch is still running).
  let refreshGeneration = 0;

  /**
   * Apply a fetch result to the status slot. Success renders the percentages
   * (a partial result counts as success); a missing key clears the slot; any
   * other failure renders the dim placeholder. Returns an optional
   * notification for callers that asked explicitly (automatic refreshes
   * ignore it).
   */
  function applyResult(
    ctx: ExtensionContext,
    result: FetchResult,
  ): Notification | null {
    const { usage } = result;
    if (!isUnknownUsage(usage)) {
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", formatUsage(usage)));
      return null;
    }

    if (result.error === undefined) {
      // No opencode-go key configured: clear the slot silently.
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return {
        message: "opencode-go provider is not configured.",
        level: "warning",
      };
    }

    // A fetch/parse failure: show the placeholder, report to explicit callers.
    ctx.ui.setStatus(
      STATUS_KEY,
      ctx.ui.theme.fg("dim", formatUsage(UNKNOWN_USAGE)),
    );
    return {
      message: `Failed to fetch OpenCode usage (${result.error}).`,
      level: "error",
    };
  }

  /**
   * Fetch usage and apply it to the status slot, unless a newer trigger
   * (or a switch away from opencode-go) superseded this one mid-flight.
   */
  function refresh(ctx: ExtensionContext): Promise<Notification | null> {
    const generation = ++refreshGeneration;
    return fetchUsage(ctx).then((result) => {
      if (generation !== refreshGeneration) return null;
      return applyResult(ctx, result);
    });
  }

  // Re-seed on session start when the session's model is already opencode-go:
  // the slot is rebuilt on /new, /resume, and /fork, and model_select may not
  // fire for the default model at plain startup. Fire-and-forget: a slow or
  // unreachable endpoint must not block session startup, so the slot simply
  // fills in whenever the fetch resolves.
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (ctx.model?.provider !== PROVIDER_ID) {
      refreshGeneration++; // invalidate any in-flight fetch
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    void refresh(ctx).catch(() => {});
  });

  // Primary trigger: selection of an opencode-go model (via /model, cycling,
  // or session restore). Selecting anything else clears the slot.
  pi.on("model_select", (event, ctx) => {
    if (!ctx.hasUI) return;
    if (event.model.provider !== PROVIDER_ID) {
      refreshGeneration++; // invalidate any in-flight fetch
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    void refresh(ctx).catch(() => {});
  });

  // Manual refresh. Since the user asked explicitly, always report the outcome
  // (including why the placeholder is showing).
  pi.registerCommand("opencode-usage-refresh", {
    description: "Refresh the OpenCode Go usage shown in the status bar",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const outcome = await refresh(ctx).catch(() => null);
      if (outcome !== null) {
        ctx.ui.notify(outcome.message, outcome.level);
      }
    },
  });
}
