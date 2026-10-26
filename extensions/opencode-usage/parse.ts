// ─── opencode.ai/inference/go/v1/usage parsing ──────────────────────────────
//
// Pure helpers split out for unit testing (see parse.test.ts). The extension
// (index.ts) is the only intended runtime consumer.

/** Consumed percentages (0..100) of the OpenCode Go allowance windows. */
export interface Usage {
  /** Consumed percent of the rolling (five-hour) allowance, or null if unknown. */
  rolling: number | null;
  /** Consumed percent of the weekly allowance, or null if unknown. */
  weekly: number | null;
  /** Consumed percent of the monthly allowance, or null if unknown. */
  monthly: number | null;
}

/**
 * Status-slot text shown in the footer, e.g. `opencode-go: 3.0% / 1.0% / 0.0%`
 * (rolling / weekly / monthly). Every known value renders with exactly one
 * decimal place. Unknown windows render as `?` so a partial or failed response
 * keeps the slot visible (e.g. `opencode-go: 3.0% / ? / 0.0%`, or
 * `opencode-go: ? / ? / ?` on failure).
 *
 * @internal Exported for testing only.
 */
export function formatUsage(usage: Usage): string {
  return `opencode-go: ${formatPercent(usage.rolling)} / ${formatPercent(usage.weekly)} / ${formatPercent(usage.monthly)}`;
}

function formatPercent(percent: number | null): string {
  if (percent === null) return "?";
  return `${percent.toFixed(1)}%`;
}

/** No meter has a usable percentage. */
export const UNKNOWN_USAGE: Usage = Object.freeze({
  rolling: null,
  weekly: null,
  monthly: null,
});

/** True when no meter has a usable percentage (an absent, failed, or empty read). */
export function isUnknownUsage(usage: Usage): boolean {
  return (
    usage.rolling === null && usage.weekly === null && usage.monthly === null
  );
}

/**
 * Parse an OpenCode Go `GET /inference/go/v1/usage` response body (raw JSON
 * text). Each window reports its `status` and consumed `percent` (0..100, not
 * remaining); a window contributes a value only when its status is `ok` and
 * its percent is a finite number, clamped to 0..100 and rounded to one decimal
 * place.
 * Every other shape becomes null for that window so callers can treat all
 * failure modes uniformly as "unknown".
 *
 * Example payload:
 *   {"usage": {"rolling": {"status": "ok", "percent": 3, "resetsAt": "..."},
 *              "weekly":  {"status": "ok", "percent": 1, "resetsAt": "..."},
 *              "monthly": {"status": "ok", "percent": 0, "resetsAt": "..."}}}
 *
 * The endpoint is undocumented and unstable; anything unexpected degrades to
 * null rather than throwing. Reset timestamps are ignored.
 *
 * @internal Exported for testing only.
 */
export function parseUsage(text: string): Usage {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return UNKNOWN_USAGE;
  }
  if (typeof body !== "object" || body === null) return UNKNOWN_USAGE;
  const usage = (body as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return UNKNOWN_USAGE;
  const meters = usage as {
    rolling?: unknown;
    weekly?: unknown;
    monthly?: unknown;
  };
  return {
    rolling: parseMeter(meters.rolling),
    weekly: parseMeter(meters.weekly),
    monthly: parseMeter(meters.monthly),
  };
}

function parseMeter(meter: unknown): number | null {
  if (typeof meter !== "object" || meter === null) return null;
  const { status, percent } = meter as {
    status?: unknown;
    percent?: unknown;
  };
  if (status !== "ok") return null;
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
  return Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10;
}
