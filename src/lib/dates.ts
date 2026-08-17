/**
 * Timezone-aware date rendering, and the one rule this app applies to dates.
 *
 * Two different things share these DateTime columns. An *instant* is a moment
 * (`now`, a form's end-of-day) and must render in the user's IANA timezone
 * (`UserPreference.timezone`), because the deployment's wall clock is UTC and
 * is not the user's. A *calendar date* is a day a human typed or a posting
 * printed ("apply by Nov 15") and carries no time at all, so we anchor it at
 * 12:00:00 UTC. Every date-only write therefore goes through `anchorDateOnly` /
 * `dateOnlyToUtcNoon` — never `new Date("YYYY-MM-DD")`, which lands on UTC
 * midnight and reads a day early anywhere west of Greenwich. Rows written
 * before this rule existed do sit at exactly 00:00:00.000 UTC, so the
 * formatters below treat that exact value as a floating calendar date and
 * render its UTC day; keep that branch until `scripts/normalize-date-only.ts`
 * has been run everywhere, and do not add new midnight-anchored writes.
 *
 * How far the noon anchor actually carries: noon is twelve hours from either
 * midnight, so a noon-anchored day renders as that same day in every zone
 * whose UTC offset falls in [-12:00, +12:00). It is not universal. At +12:00
 * and beyond the anchor lands on the following day — 2026-11-15T12:00:00Z
 * prints as Nov 16 in Pacific/Auckland (+13 in November), Pacific/Fiji and
 * Pacific/Kiritimati — and the settings validator accepts any IANA name, so
 * those zones are reachable. Every US zone (-10:00 … -04:00) sits well inside
 * the safe range, which is what this deployment targets; bound the accepted
 * zone set before that stops being true. `tests/unit/dates.test.ts` pins the
 * behavior at +13 so the limit stays documented rather than assumed.
 *
 * Comparison and grouping follow the same rule as rendering: use `dayKeyTz`
 * (or `isDayBeforeTz`) so a row can never sit in a bucket that contradicts
 * its own printed date. Comparing raw instants is what produced a deadline
 * that read "overdue" on one page and "today" on another.
 */

/** Mirrors the UserPreference.timezone schema default. */
export const DEFAULT_TIMEZONE = "America/Los_Angeles";

type DateInput = Date | string | null | undefined;

const EM_DASH = "—";

/** A bare calendar date: no time, no zone. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "2026-11-15" → the instant this app stores for that calendar day (noon UTC).
 * Returns null for anything that is not a real bare calendar date, so callers
 * and zod can reject "2026-02-31" instead of silently rolling it into March.
 */
export function dateOnlyToUtcNoon(day: string): Date | null {
  if (!DATE_ONLY.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const anchored = new Date(Date.UTC(y, m - 1, d, 12));
  const roundTrips = anchored.getUTCFullYear() === y && anchored.getUTCMonth() === m - 1 && anchored.getUTCDate() === d;
  return roundTrips ? anchored : null;
}

/**
 * Zod `preprocess` step: anchor bare "YYYY-MM-DD" input at noon UTC and pass
 * everything else (Date, full ISO timestamp, garbage) straight through to the
 * validator behind it. Put this in front of every `z.coerce.date()` that can
 * receive a date-only string.
 */
export function anchorDateOnly(value: unknown): unknown {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return value;
  // Shaped like a calendar date, so it is one or it is nothing: hand the
  // validator an invalid Date rather than let `new Date("2026-02-31")` roll
  // into March at the very midnight this rule exists to avoid.
  return dateOnlyToUtcNoon(value) ?? new Date(NaN);
}

/**
 * Floating date-only shape: exactly 00:00:00.000 UTC, rendered as its UTC day.
 * Two things land here. Rows written before the noon rule (`z.coerce.date()`
 * on "YYYY-MM-DD") mean a calendar day, not an instant. So does every Postgres
 * `@db.Date` column — `AgentRun.runDate` — which Prisma always hydrates at
 * exactly this millisecond and which has no time component to lose.
 *
 * A genuine timestamp can also land here, by coincidence or from a
 * local-midnight write (no path in this app performs one), and would then be
 * read a day early west of Greenwich. That is the cost of the compatibility
 * branch, not a proof it cannot happen; `scripts/normalize-date-only.ts`
 * retires the legacy rows, and `@db.Date` columns keep it in use after that.
 */
export const isFloatingCalendarDate = (d: Date): boolean =>
  d.getUTCHours() === 0 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0;

const zoneFor = (d: Date, timeZone: string): string =>
  isFloatingCalendarDate(d) ? "UTC" : timeZone;

// Intl.DateTimeFormat construction is expensive; the tracker table calls
// these per row. Cache one formatter per (timezone, style) pair.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

type Style = "date" | "short" | "key" | "time" | "datetime";

const STYLE_OPTS: Record<Style, Intl.DateTimeFormatOptions> = {
  date: { month: "short", day: "numeric", year: "numeric" },
  short: { month: "short", day: "numeric" },
  key: { year: "numeric", month: "2-digit", day: "2-digit" },
  time: { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" },
  datetime: {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  },
};

function formatter(timeZone: string, style: Style): Intl.DateTimeFormat {
  const key = `${timeZone}|${style}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    const opts = STYLE_OPTS[style];
    try {
      fmt = new Intl.DateTimeFormat("en-US", { ...opts, timeZone });
    } catch {
      // An invalid stored timezone must never crash a page or the agent run.
      fmt = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: DEFAULT_TIMEZONE });
    }
    formatterCache.set(key, fmt);
  }
  return fmt;
}

/** Parsed input, or null for nullish and unparseable values. */
function toDate(d: DateInput): Date | null {
  if (!d) return null;
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Aug 10, 2026" in the given timezone — the tz-aware fmtDate. */
export const fmtDateTz = (d: DateInput, timeZone: string): string => {
  const date = toDate(d);
  return date ? formatter(zoneFor(date, timeZone), "date").format(date) : EM_DASH;
};

/** "Aug 10" in the given timezone — the tz-aware fmtDateShort. */
export const fmtDateShortTz = (d: DateInput, timeZone: string): string => {
  const date = toDate(d);
  return date ? formatter(zoneFor(date, timeZone), "short").format(date) : EM_DASH;
};

/**
 * "Aug 10, 14:32:05" in the given timezone. For timestamps only: unlike the
 * date formatters this never takes the floating-calendar-date branch, because
 * a value whose clock time is being printed is an instant by definition, and
 * reading the day in UTC while reading the clock in the user's zone would
 * print a date and a time that disagree.
 */
export const fmtDateTimeTz = (d: DateInput, timeZone: string): string => {
  const date = toDate(d);
  return date ? formatter(timeZone, "datetime").format(date) : EM_DASH;
};

/** "14:32:05" in the given timezone — timestamps only, same rule as above. */
export const fmtTimeTz = (d: DateInput, timeZone: string): string => {
  const date = toDate(d);
  return date ? formatter(timeZone, "time").format(date) : EM_DASH;
};

/**
 * "2026-08-10" — the calendar day this value *renders* as, by the same rule
 * the formatters use. Group and compare on this, never on the raw instant, so
 * a row can never sit in a bucket that contradicts its own printed date.
 * Empty string for nullish/unparseable input.
 */
export function dayKeyTz(d: DateInput, timeZone: string): string {
  const date = toDate(d);
  if (!date) return "";
  const parts = formatter(zoneFor(date, timeZone), "key").formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Shift a day key by whole days. Arithmetic happens at noon UTC, so DST cannot bite. */
export function addDaysToDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/**
 * Does `value` render on an earlier calendar day than `reference`? This is the
 * app's one overdue test — the day-key form of `value < reference`. Every
 * surface that marks something overdue must use it (or the identical
 * `dayKeyTz(a, tz) < dayKeyTz(b, tz)` the calendar spells out inline), because
 * the raw-instant form disagrees with the printed date for most of the day.
 * Unparseable input is never "before" anything.
 */
export const isDayBeforeTz = (value: DateInput, reference: DateInput, timeZone: string): boolean => {
  const a = dayKeyTz(value, timeZone);
  const b = dayKeyTz(reference, timeZone);
  return a !== "" && b !== "" && a < b;
};

/**
 * The UTC instant at which a day key's own midnight sits.
 *
 * A rendered day begins at this instant offset by the zone (and exactly at it
 * for floating date-only rows), and no IANA offset exceeds ±14h, so
 * `[utcDayStart(key - 1 day), utcDayStart(key + 1 day))` brackets every row
 * whose day-key bucket a raw-instant comparison could get wrong. Outside that
 * bracket the two orderings agree. Database queries cannot express a day key,
 * so they widen to this bracket and let `dayKeyTz` make the call in JS.
 */
export const utcDayStart = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
