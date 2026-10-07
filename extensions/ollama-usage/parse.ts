// ─── ollama.com /api/balance parsing ────────────────────────────────────────
//
// Pure helpers split out for unit testing (see parse.test.ts). The extension
// (index.ts) is the only intended runtime consumer.

/** Session/weekly usage fractions extracted from an `/api/balance` response. */
export interface Usage {
  /** Fraction (0..1) of the ~5h session limit consumed, or null if unknown. */
  session: number | null;
  /** Fraction (0..1) of the weekly limit consumed, or null if unknown. */
  weekly: number | null;
}

/**
 * Status-slot text shown in the footer, e.g. `ollama: 2.6% / 0.8%` (session /
 * weekly). Percentages are fixed to 1 decimal place so the slot width stays
 * stable; unknown values render as `?` so a partial or failed response keeps
 * the slot visible (e.g. `ollama: 2.6% / ?`, or `ollama: ? / ?` on failure).
 *
 * @internal Exported for testing only.
 */
export function formatUsage(
  session: number | null,
  weekly: number | null,
): string {
  return `ollama: ${formatFraction(session)} / ${formatFraction(weekly)}`;
}

function formatFraction(fraction: number | null): string {
  if (fraction === null) return "?";
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Parse an ollama.com `GET /api/balance` response body (raw JSON text) and
 * extract the session/weekly usage fractions. The endpoint reports each
 * window's `remaining_percent` (0..100); the status slot shows consumed
 * usage, so each value is converted to `(100 - remaining_percent) / 100` and
 * clamped to 0..1. Each window independently becomes null when absent or not
 * a finite number, so callers can treat every parse failure uniformly as
 * "unknown for this window" and render `?`.
 *
 * Example payload:
 *   {"included": {"session": {"remaining_percent": 96.68, "resets_at": "..."},
 *                 "weekly":  {"remaining_percent": 96.37, "resets_at": "..."}},
 *    "purchased": {"balance_usd": 0}}
 *
 * The endpoint is undocumented; anything unexpected degrades to null rather
 * than throwing.
 *
 * @internal Exported for testing only.
 */
export function parseUsage(text: string): Usage {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { session: null, weekly: null };
  }
  if (typeof body !== "object" || body === null)
    return { session: null, weekly: null };
  const included = (body as { included?: unknown }).included;
  if (typeof included !== "object" || included === null)
    return { session: null, weekly: null };
  const windows = included as { session?: unknown; weekly?: unknown };
  return {
    session: parseWindow(windows.session),
    weekly: parseWindow(windows.weekly),
  };
}

function parseWindow(window: unknown): number | null {
  if (typeof window !== "object" || window === null) return null;
  const remaining = (window as { remaining_percent?: unknown })
    .remaining_percent;
  if (typeof remaining !== "number" || !Number.isFinite(remaining)) {
    return null;
  }
  const consumed = (100 - remaining) / 100;
  return Math.min(1, Math.max(0, consumed));
}
