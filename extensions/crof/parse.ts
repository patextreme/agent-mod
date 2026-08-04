// ─── crof.ai /usage_api/ parsing ────────────────────────────────────────────
//
// Pure helpers split out for unit testing (see parse.test.ts). The extension
// (index.ts) is the only intended runtime consumer.

/**
 * Status-slot text shown in the footer for a known balance, always padded to
 * exactly 4 decimal places (e.g. `crof: $5.0000`), so the column width stays
 * stable regardless of the balance's native precision.
 *
 * @internal Exported for testing only.
 */
export function formatCredits(credits: number): string {
  return `crof: $${credits.toFixed(4)}`;
}

/**
 * Parse a crof.ai `GET /usage_api/` response body (raw JSON text) and extract
 * the `credits` balance. Returns `null` for malformed JSON or a missing /
 * non-finite `credits` field, so callers can treat every parse failure
 * uniformly as "no usable balance this round".
 *
 * Example payload:
 *   {"credits": 12.3456, "usable_requests": null, "usage": { ... }}
 *
 * @internal Exported for testing only.
 */
export function parseCredits(text: string): number | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const credits = (body as { credits?: unknown }).credits;
  if (typeof credits !== "number" || !Number.isFinite(credits)) return null;
  return credits;
}
