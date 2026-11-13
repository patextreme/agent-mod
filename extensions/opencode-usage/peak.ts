// ─── OpenCode Go pricing multipliers → peak status ──────────────────────────
//
// Pure helpers shared by the extension (index.ts). The gateway publishes a
// model catalog whose `cost.multipliers` describe when a price multiplier
// applies; this module reads the recurring weekday/hour rules, not any
// hardcoded schedule, so a changed catalog changes the tag without a release.

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Scan a little over a week: recurring rules always transition within it. */
const SCAN_DAYS = 8;

const UTC_DAY_INDEX: Readonly<Record<string, number>> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** One multiplier whose `when` is a recurring weekday/hour predicate. */
export interface PricingMultiplier {
  /** Multiplier applied while the predicate matches. */
  readonly factor: number;
  /** Raw `when` predicate from the catalog (recurring clauses only). */
  readonly when: unknown;
}

/** Recurring pricing rules for one catalog model. */
export type PeakSchedule = readonly PricingMultiplier[];

/** Catalog model id → its recurring pricing rules. */
export interface Catalog {
  readonly models: ReadonlyMap<string, PeakSchedule>;
}

/**
 * Parse a `GET /inference/go/v1/models` response body (raw JSON text) into the
 * recurring pricing rules per model. Returns null when the envelope itself is
 * unusable, or when a non-empty model list contains no usable model id (shape
 * drift must not cache as an empty success). Malformed entries are skipped
 * individually. Date-based promo multipliers are intentionally ignored: they
 * do not describe a recurring peak window, so they must never make a model
 * eligible for the tag.
 */
export function parseCatalog(text: string): Catalog | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  const models = new Map<string, PeakSchedule>();
  let sawModelId = false;
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || id.length === 0) continue;
    sawModelId = true;
    const cost = (entry as { cost?: unknown }).cost;
    const rules = recurringRules(cost);
    if (rules.length > 0) models.set(id, rules);
  }
  if (data.length > 0 && !sawModelId) return null;
  return { models };
}

/**
 * Recurring rules for a model id, or null when the model is absent or has no
 * recurring weekday/hour multiplier. Date-only models always return null.
 */
export function scheduleForModel(
  catalog: Catalog,
  modelId: string,
): PeakSchedule | null {
  const schedule = catalog.models.get(modelId);
  return schedule !== undefined && schedule.length > 0 ? schedule : null;
}

/** Product of every rule whose predicate matches the instant. */
export function effectiveMultiplier(
  schedule: PeakSchedule,
  instant: Date,
): number {
  let factor = 1;
  for (const rule of schedule) {
    if (matchesWhen(rule.when, instant)) factor *= rule.factor;
  }
  return factor;
}

/** True when the effective multiplier is greater than one. */
export function isPeakActive(schedule: PeakSchedule, instant: Date): boolean {
  return effectiveMultiplier(schedule, instant) > 1;
}

/**
 * First instant after `instant` at which the peak state changes, or null when
 * no recurring rule is present. Windows are minute-aligned, so the scan is too.
 */
export function nextTransition(
  schedule: PeakSchedule,
  instant: Date,
): Date | null {
  if (schedule.length === 0) return null;
  const now = instant.getTime();
  const current = isPeakActive(schedule, instant);
  const firstMinute = Math.ceil(now / MINUTE_MS) * MINUTE_MS;
  const limit = now + SCAN_DAYS * DAY_MS;
  for (let time = firstMinute; time <= limit; time += MINUTE_MS) {
    if (isPeakActive(schedule, new Date(time)) !== current) {
      return new Date(time);
    }
  }
  return null;
}

interface CountdownStep {
  /** Smallest remaining time this step renders. */
  readonly minimum: number;
  /** Repaint quantum at which the rendered text advances, or 0 at the boundary. */
  readonly quantum: number;
  readonly render: (remaining: number) => string;
}

/**
 * The single countdown ladder: formatCountdown renders through it, and
 * nextRepaintAt derives its repaint quantum from the same step.
 */
const COUNTDOWN_LADDER: readonly CountdownStep[] = [
  { minimum: DAY_MS, quantum: HOUR_MS, render: renderDays },
  { minimum: HOUR_MS, quantum: MINUTE_MS, render: renderHours },
  { minimum: MINUTE_MS, quantum: MINUTE_MS, render: renderMinutes },
  { minimum: 0, quantum: 0, render: () => "under a minute left" },
];

function countdownStep(remaining: number): CountdownStep {
  return (
    COUNTDOWN_LADDER.find((step) => remaining >= step.minimum) ??
    COUNTDOWN_LADDER[COUNTDOWN_LADDER.length - 1]
  );
}

function countdownText(remaining: number): string {
  return countdownStep(remaining).render(remaining);
}

function renderDays(remaining: number): string {
  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS);
  return hours === 0 ? `${days}d left` : `${days}d${hours}h left`;
}

function renderHours(remaining: number): string {
  const hours = Math.floor(remaining / HOUR_MS);
  const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
  return `${hours}h${pad2(minutes)}m left`;
}

function renderMinutes(remaining: number): string {
  return `${Math.floor(remaining / MINUTE_MS)}m left`;
}

/**
 * Countdown text to the next state boundary: `2d15h left`, `1d left`,
 * `3h01m left`, `47m left`, or `under a minute left`.
 */
export function formatCountdown(
  schedule: PeakSchedule,
  instant: Date,
): string | null {
  const next = nextTransition(schedule, instant);
  if (next === null) return null;
  return countdownText(next.getTime() - instant.getTime());
}

/**
 * Earliest instant the slot must repaint: the next state boundary, or the next
 * moment the countdown text changes if that comes first. Never fetches.
 */
export function nextRepaintAt(
  schedule: PeakSchedule,
  instant: Date,
): Date | null {
  const next = nextTransition(schedule, instant);
  if (next === null) return null;
  const now = instant.getTime();
  const remaining = next.getTime() - now;
  const quantum = countdownStep(remaining).quantum;
  if (quantum === 0) return next;
  // The displayed component drops just after the quantum boundary where the
  // remaining time becomes an exact multiple; at the boundary itself the text
  // still shows the previous unit.
  const boundary = next.getTime() - Math.floor(remaining / quantum) * quantum;
  return new Date(boundary + 1);
}

/**
 * Absolute window description for the explicit refresh command, e.g.
 * `peak until 10:00 UTC (17:00 +07)`. A weekday prefix marks a boundary
 * outside today's UTC or local date, or a local date that differs from its UTC
 * date, so a Friday-to-Monday gap cannot read as same-day.
 */
export function formatWindow(
  schedule: PeakSchedule,
  instant: Date,
): string | null {
  const next = nextTransition(schedule, instant);
  if (next === null) return null;
  const state = isPeakActive(schedule, instant) ? "peak" : "off-peak";
  const utcDay = sameUtcDate(instant, next)
    ? ""
    : `${WEEKDAYS[next.getUTCDay()]} `;
  const localDay =
    sameLocalDate(instant, next) && sameLocalDateAsUtc(next)
      ? ""
      : `${WEEKDAYS[next.getDay()]} `;
  return `${state} until ${utcDay}${formatClock(next, false)} UTC (${localDay}${formatClock(next, true)} ${formatOffset(next)})`;
}

function recurringRules(cost: unknown): PeakSchedule {
  if (typeof cost !== "object" || cost === null || Array.isArray(cost)) {
    return [];
  }
  const multipliers = (cost as { multipliers?: unknown }).multipliers;
  if (!Array.isArray(multipliers)) return [];
  const rules: PricingMultiplier[] = [];
  for (const multiplier of multipliers) {
    const rule = parseRule(multiplier);
    if (rule !== null) rules.push(rule);
  }
  return rules;
}

function parseRule(value: unknown): PricingMultiplier | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { factor, when } = value as { factor?: unknown; when?: unknown };
  if (typeof factor !== "number" || !Number.isFinite(factor)) return null;
  if (typeof when !== "object" || when === null || Array.isArray(when)) {
    return null;
  }
  const recurring = hasClause(when, "utc_days") || hasClause(when, "utc_hours");
  if (!recurring || hasClause(when, "date")) return null;
  return { factor, when };
}

function hasClause(value: unknown, key: string): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (key in record) return true;
  return nestedConditions(record).some((clause) => hasClause(clause, key));
}

function nestedConditions(record: Record<string, unknown>): unknown[] {
  const nested: unknown[] = [];
  for (const key of ["any", "all"]) {
    const clauses = record[key];
    if (Array.isArray(clauses)) nested.push(...clauses);
  }
  return nested;
}

function matchesWhen(when: unknown, instant: Date): boolean {
  if (typeof when !== "object" || when === null || Array.isArray(when)) {
    return false;
  }
  const record = when as Record<string, unknown>;
  let matched = true;
  let constrained = false;

  if ("utc_days" in record) {
    constrained = true;
    matched = matched && matchesDays(record.utc_days, instant);
  }
  if ("utc_hours" in record) {
    constrained = true;
    matched = matched && matchesHours(record.utc_hours, instant);
  }
  if ("any" in record) {
    constrained = true;
    matched =
      matched &&
      Array.isArray(record.any) &&
      record.any.some((clause) => matchesWhen(clause, instant));
  }
  if ("all" in record) {
    constrained = true;
    matched =
      matched &&
      Array.isArray(record.all) &&
      record.all.every((clause) => matchesWhen(clause, instant));
  }
  return constrained && matched;
}

function matchesDays(value: unknown, instant: Date): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const days = (value as { in?: unknown }).in;
  if (!Array.isArray(days)) return false;
  const today = instant.getUTCDay();
  return days.some(
    (day) =>
      typeof day === "string" &&
      UTC_DAY_INDEX[day.slice(0, 3).toLowerCase()] === today,
  );
}

function matchesHours(value: unknown, instant: Date): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const hasGte = "gte" in record;
  const hasLt = "lt" in record;
  if (!hasGte && !hasLt) return false;
  const gte = hasGte ? parseClock(record.gte) : null;
  const lt = hasLt ? parseClock(record.lt) : null;
  if ((hasGte && gte === null) || (hasLt && lt === null)) return false;
  if (gte === null && lt === null) return false;

  const minutes = instant.getUTCHours() * 60 + instant.getUTCMinutes();
  if (gte !== null && lt !== null) {
    return gte <= lt
      ? minutes >= gte && minutes < lt
      : minutes >= gte || minutes < lt;
  }
  return gte !== null ? minutes >= gte : minutes < (lt as number);
}

function parseClock(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatClock(date: Date, local: boolean): string {
  const hours = local ? date.getHours() : date.getUTCHours();
  const minutes = local ? date.getMinutes() : date.getUTCMinutes();
  return `${pad2(hours)}:${pad2(minutes)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function sameUtcDate(left: Date, right: Date): boolean {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function sameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function sameLocalDateAsUtc(date: Date): boolean {
  return (
    date.getFullYear() === date.getUTCFullYear() &&
    date.getMonth() === date.getUTCMonth() &&
    date.getDate() === date.getUTCDate()
  );
}

function formatOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const rest = absolute % 60;
  return rest === 0
    ? `${sign}${pad2(hours)}`
    : `${sign}${pad2(hours)}:${pad2(rest)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
