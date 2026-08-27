// ─── ollama.com /api/usage parsing ──────────────────────────────────────────
//
// Pure helpers split out for unit testing (see parse.test.ts). The extension
// (index.ts) is the only intended runtime consumer.

/** Session/weekly usage fractions extracted from a `/api/usage` response. */
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
 * Parse an ollama.com `GET /api/usage` response body (raw JSON text) and
 * extract the session/weekly usage fractions. Each value independently
 * becomes null when absent or not a finite number, so callers can treat every
 * parse failure uniformly as "unknown for this window" and render `?`.
 *
 * Example payload:
 *   {"limits": {"session": {"usage": 0.026, "models": [...]},
 *               "weekly":  {"usage": 0.008, "models": [...]}}}
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
  const limits = (body as { limits?: unknown }).limits;
  if (typeof limits !== "object" || limits === null)
    return { session: null, weekly: null };
  const windows = limits as { session?: unknown; weekly?: unknown };
  return {
    session: parseWindow(windows.session),
    weekly: parseWindow(windows.weekly),
  };
}

function parseWindow(window: unknown): number | null {
  if (typeof window !== "object" || window === null) return null;
  const usage = (window as { usage?: unknown }).usage;
  if (typeof usage !== "number" || !Number.isFinite(usage)) return null;
  return usage;
}
