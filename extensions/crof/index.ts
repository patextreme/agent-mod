/**
 * pi-crof — CrofAI account balance in the pi status bar
 *
 * Fetches your live credits balance from crof.ai's `/usage_api/` endpoint and
 * shows it as a footer status slot (`crof: $<balance>`). Refreshes on session
 * start and via the `/crof-refresh` command. Reuses pi's resolved crofai
 * provider key (`ctx.modelRegistry`), so no separate configuration is needed
 * beyond the existing crofai entry in models.json.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { formatCredits, parseCredits } from "./parse.js";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Footer status slot key. */
const STATUS_KEY = "crof";

/** crof.ai balance endpoint. The trailing slash is required: a bare path 308-redirects. */
const USAGE_API_URL = "https://crof.ai/usage_api/";

/** Abort a hung fetch after this many milliseconds (don't block session start). */
const FETCH_TIMEOUT_MS = 8_000;

/** Dim placeholder shown when a fetch fails before any balance is known. */
const UNKNOWN_TEXT = "crof: ?";

// ─── Balance fetch ──────────────────────────────────────────────────────────

interface FetchResult {
  /** Parsed balance, or null on any failure. */
  credits: number | null;
  /** Human-readable failure reason. `undefined` (not empty) means crofai is absent. */
  error?: string;
}

/** Optional outcome for callers that asked explicitly (null = success, nothing to say). */
type Notification = { message: string; level: "warning" | "error" };

/**
 * Fetch the current credits balance. Never throws: every failure path returns
 * `{ credits: null }` plus a reason when something was actually attempted.
 */
async function fetchCredits(ctx: ExtensionContext): Promise<FetchResult> {
  const key = await ctx.modelRegistry.getApiKeyForProvider("crofai");
  if (key === undefined) {
    // Provider not configured: no key, no fetch, no error message.
    return { credits: null };
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
        credits: null,
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }
    const credits = parseCredits(await response.text());
    if (credits === null) {
      return { credits: null, error: "malformed response body" };
    }
    return { credits };
  } catch (err) {
    return {
      credits: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function crofExtension(pi: ExtensionAPI): void {
  // Last known good balance, kept across refreshes so a transient failure
  // never clobbers a previously-displayed value with the placeholder.
  let lastCredits: number | null = null;

  /**
   * Apply a fetch result to the status slot, honoring the keep-last-good rule:
   * a failure leaves a known balance in place and only falls back to the dim
   * placeholder (or a silent clear, when crofai is absent) when nothing is
   * known. Returns an optional notification for callers that asked explicitly.
   */
  function applyResult(
    ctx: ExtensionContext,
    result: FetchResult,
  ): Notification | null {
    if (result.credits !== null) {
      lastCredits = result.credits;
      ctx.ui.setStatus(STATUS_KEY, formatCredits(result.credits));
      return null;
    }

    if (result.error === undefined) {
      // No crofai key configured: clear the slot silently.
      ctx.ui.setStatus(STATUS_KEY, undefined);
      lastCredits = null;
      return {
        message: "CrofAI provider is not configured.",
        level: "warning",
      };
    }

    // A fetch/parse failure was attempted.
    if (lastCredits !== null) {
      // Keep the last good balance in the slot; surface the failure separately.
      return {
        message: `Failed to refresh CrofAI balance (${result.error}); showing last known value.`,
        level: "error",
      };
    }

    ctx.ui.setStatus(STATUS_KEY, UNKNOWN_TEXT);
    return {
      message: `Failed to fetch CrofAI balance: ${result.error}`,
      level: "error",
    };
  }

  // Initial balance on session start. The slot is rebuilt on /new, /resume,
  // and /fork, so this re-seeds it each time.
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    await applyResult(ctx, await fetchCredits(ctx));
  });

  // Manual refresh. Since the user asked explicitly, always report the outcome
  // (including why a failure left the value unchanged).
  pi.registerCommand("crof-refresh", {
    description: "Refresh the CrofAI balance shown in the status bar",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const outcome = applyResult(ctx, await fetchCredits(ctx));
      if (outcome !== null) {
        ctx.ui.notify(outcome.message, outcome.level);
      }
    },
  });
}
