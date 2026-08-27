/**
 * pi-ollama-usage — Ollama Cloud session/weekly usage in the pi status bar
 *
 * Polls ollama.com's undocumented `GET /api/usage` endpoint (the one backing
 * the ollama.com dashboard; it may change or disappear without notice) and
 * shows the consumed fraction of the ~5h session limit and the weekly limit
 * as a footer status slot: `ollama: 2.6% / 0.8%` (session / weekly).
 *
 * Refreshes whenever an ollama-cloud model is selected — `model_select` fires
 * on /model, Ctrl+P cycling, and session restore, which covers new sessions
 * that already use ollama-cloud — and via `/ollama-usage-refresh`. Switching
 * to a non-ollama-cloud model clears the slot. Reuses pi's resolved
 * ollama-cloud provider key (`ctx.modelRegistry`), so no separate
 * configuration is needed beyond the existing ollama-cloud entry in
 * models.json.
 *
 * The endpoint is undocumented and treated as unstable: every failure path is
 * non-throwing and stateless. A failed fetch renders the dim placeholder
 * (`ollama: ? / ?`); a missing provider key silently clears the slot. Nothing
 * is cached and automatic refreshes never notify — only the explicit
 * `/ollama-usage-refresh` command reports failures, mirroring the crof
 * extension.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { formatUsage, parseUsage } from "./parse.js";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Footer status slot key. */
const STATUS_KEY = "ollama-usage";

/** Exact pi provider id for Ollama Cloud. No fuzzy matching. */
const PROVIDER_ID = "ollama-cloud";

/** Undocumented account-usage endpoint backing the ollama.com dashboard. */
const USAGE_API_URL = "https://ollama.com/api/usage";

/** Abort a hung fetch after this many milliseconds (don't block selection). */
const FETCH_TIMEOUT_MS = 8_000;

// ─── Usage fetch ────────────────────────────────────────────────────────────

interface FetchResult {
  /** Parsed usage fractions; null per window when unknown. */
  session: number | null;
  weekly: number | null;
  /** Human-readable failure reason. `undefined` (not empty) means ollama-cloud is absent. */
  error?: string;
}

/** Optional outcome for callers that asked explicitly (null = success, nothing to say). */
type Notification = { message: string; level: "warning" | "error" };

/**
 * Fetch the current session/weekly usage. Never throws: every failure path
 * returns null windows plus a reason when something was actually attempted.
 */
async function fetchUsage(ctx: ExtensionContext): Promise<FetchResult> {
  const key = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID);
  if (key === undefined) {
    // Provider not configured: no key, no fetch, no error message.
    return { session: null, weekly: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(USAGE_API_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        session: null,
        weekly: null,
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }
    const usage = parseUsage(await response.text());
    if (usage.session === null && usage.weekly === null) {
      return { session: null, weekly: null, error: "malformed response body" };
    }
    return usage;
  } catch (err) {
    return {
      session: null,
      weekly: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function ollamaUsageExtension(pi: ExtensionAPI): void {
  // Bumped on every trigger so an in-flight fetch from a previous selection
  // can never clobber a newer state (e.g. switching away from ollama-cloud
  // while its fetch is still running).
  let refreshGeneration = 0;

  /**
   * Apply a fetch result to the status slot. Success renders the percentages;
   * a missing key clears the slot; any other failure renders the dim
   * placeholder. Returns an optional notification for callers that asked
   * explicitly (automatic refreshes ignore it).
   */
  function applyResult(
    ctx: ExtensionContext,
    result: FetchResult,
  ): Notification | null {
    if (result.session !== null || result.weekly !== null) {
      ctx.ui.setStatus(
        STATUS_KEY,
        ctx.ui.theme.fg("dim", formatUsage(result.session, result.weekly)),
      );
      return null;
    }

    if (result.error === undefined) {
      // No ollama-cloud key configured: clear the slot silently.
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return {
        message: "ollama-cloud provider is not configured.",
        level: "warning",
      };
    }

    // A fetch/parse failure: show the placeholder, stay silent here.
    ctx.ui.setStatus(
      STATUS_KEY,
      ctx.ui.theme.fg("dim", formatUsage(null, null)),
    );
    return {
      message: `Failed to fetch Ollama usage (${result.error}).`,
      level: "error",
    };
  }

  /**
   * Fetch usage and apply it to the status slot, unless a newer trigger
   * (or a switch away from ollama-cloud) superseded this one mid-flight.
   */
  function refresh(ctx: ExtensionContext): Promise<Notification | null> {
    const generation = ++refreshGeneration;
    return fetchUsage(ctx).then((result) => {
      if (generation !== refreshGeneration) return null;
      return applyResult(ctx, result);
    });
  }

  // Re-seed on session start when the session's model is already
  // ollama-cloud: the slot is rebuilt on /new, /resume, and /fork, and
  // model_select may not fire for the default model at plain startup.
  // Fire-and-forget: a slow or unreachable endpoint must not block session
  // startup, so the slot simply fills in whenever the fetch resolves.
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    if (ctx.model?.provider !== PROVIDER_ID) return;
    void refresh(ctx).catch(() => {});
  });

  // Primary trigger: selection of an ollama-cloud model (via /model, cycling,
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
  pi.registerCommand("ollama-usage-refresh", {
    description: "Refresh the Ollama Cloud usage shown in the status bar",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const outcome = await refresh(ctx).catch(() => null);
      if (outcome !== null) {
        ctx.ui.notify(outcome.message, outcome.level);
      }
    },
  });
}
