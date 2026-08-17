import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  DEFAULT_TIMEZONE,
  addDaysToDayKey,
  anchorDateOnly,
  dateOnlyToUtcNoon,
  dayKeyTz,
  fmtDateShortTz,
  fmtDateTimeTz,
  fmtDateTz,
  fmtTimeTz,
  isDayBeforeTz,
  utcDayStart,
} from "@/lib/dates";

const LA = "America/Los_Angeles";
const NY = "America/New_York";
/** Every zone the app can be configured to for a US user. */
const US_ZONES = [
  LA,
  NY,
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

// 02:00 UTC on Aug 1 — still Jul 31 in Pacific, already Aug 1 in Tokyo. The
// exact instant the server-local rendering bug shows a wrong day.
const EDGE = new Date("2026-08-01T02:00:00Z");

// US DST transitions in 2026: spring forward Mar 8, fall back Nov 1.
const SPRING_FORWARD = "2026-03-08";
const FALL_BACK = "2026-11-01";

describe("fmtDateTz — true instants", () => {
  it("renders the wall-clock date of the given timezone, not the server's", () => {
    expect(fmtDateTz(EDGE, LA)).toBe("Jul 31, 2026");
    expect(fmtDateTz(EDGE, "UTC")).toBe("Aug 1, 2026");
    expect(fmtDateTz(EDGE, "Asia/Tokyo")).toBe("Aug 1, 2026");
  });

  it("accepts ISO strings (client rows serialize dates)", () => {
    expect(fmtDateTz("2026-08-01T02:00:00Z", NY)).toBe("Jul 31, 2026");
  });

  it("renders nullish as an em placeholder", () => {
    expect(fmtDateTz(null, "UTC")).toBe("—");
    expect(fmtDateTz(undefined, "UTC")).toBe("—");
  });

  it("renders an unparseable value as the placeholder instead of throwing", () => {
    expect(fmtDateTz("not a date", "UTC")).toBe("—");
    expect(fmtDateShortTz(new Date("nonsense"), "UTC")).toBe("—");
  });

  it("falls back to the default timezone instead of throwing on a bad zone", () => {
    expect(fmtDateTz(EDGE, "Not/AZone")).toBe(fmtDateTz(EDGE, DEFAULT_TIMEZONE));
  });
});

describe("fmtDateShortTz", () => {
  it("renders the short form in the given timezone", () => {
    expect(fmtDateShortTz(EDGE, LA)).toBe("Jul 31");
    expect(fmtDateShortTz(EDGE, "Asia/Tokyo")).toBe("Aug 1");
  });

  it("renders nullish as an em placeholder", () => {
    expect(fmtDateShortTz(null, "UTC")).toBe("—");
  });
});

// Agent-run timestamps: the run's own date is a calendar day, its event clock
// is a moment. Both are on the page at once, so they must not use two lenses.
describe("fmtDateTimeTz / fmtTimeTz — timestamps", () => {
  const iso = "2026-11-15T22:32:05Z";

  it("renders the wall clock of the given timezone, 24-hour", () => {
    expect(fmtDateTimeTz(iso, LA)).toBe("Nov 15, 14:32:05");
    expect(fmtTimeTz(iso, LA)).toBe("14:32:05");
    expect(fmtDateTimeTz(iso, NY)).toBe("Nov 15, 17:32:05");
    expect(fmtDateTimeTz(iso, "UTC")).toBe("Nov 15, 22:32:05");
  });

  it("renders local midnight as 00:00:00, never 24:00:00", () => {
    expect(fmtTimeTz("2026-11-15T08:00:00Z", LA)).toBe("00:00:00");
  });

  // The one deliberate difference from the date formatters: a timestamp is an
  // instant even when it lands on UTC midnight, so reading its day in UTC
  // while reading its clock in the user's zone would print a contradiction.
  it("never takes the floating-calendar-date branch", () => {
    const utcMidnight = new Date("2026-11-15T00:00:00.000Z");
    expect(fmtDateTz(utcMidnight, LA)).toBe("Nov 15, 2026");
    expect(fmtDateTimeTz(utcMidnight, LA)).toBe("Nov 14, 16:00:00");
  });

  it("falls back to the default timezone instead of throwing on a bad zone", () => {
    expect(fmtTimeTz(iso, "Not/AZone")).toBe(fmtTimeTz(iso, DEFAULT_TIMEZONE));
  });

  it("renders nullish and unparseable values as the placeholder", () => {
    expect(fmtTimeTz(null, LA)).toBe("—");
    expect(fmtDateTimeTz(undefined, LA)).toBe("—");
    expect(fmtDateTimeTz("not a date", LA)).toBe("—");
  });
});

// Rows written before the noon rule — `z.coerce.date()` on "YYYY-MM-DD" — sit
// at UTC midnight. Rendering those in a western zone printed the day before.
describe("legacy date-only rows stored at UTC midnight", () => {
  const cases = [
    { day: "2026-11-15", expected: "Nov 15, 2026", short: "Nov 15" },
    { day: SPRING_FORWARD, expected: "Mar 8, 2026", short: "Mar 8" },
    { day: FALL_BACK, expected: "Nov 1, 2026", short: "Nov 1" },
  ];

  for (const { day, expected, short } of cases) {
    it(`${day} at UTC midnight renders as ${expected} everywhere`, () => {
      const stored = new Date(`${day}T00:00:00Z`);
      for (const zone of US_ZONES) {
        expect(fmtDateTz(stored, zone), zone).toBe(expected);
        expect(fmtDateShortTz(stored, zone), zone).toBe(short);
        expect(dayKeyTz(stored, zone), zone).toBe(day);
      }
      expect(fmtDateTz(stored, "UTC")).toBe(expected);
    });
  }
});

// The rule for every new date-only write.
describe("date-only values anchored at noon UTC", () => {
  for (const day of ["2026-11-15", SPRING_FORWARD, FALL_BACK]) {
    it(`${day} reads back as ${day} in every US zone`, () => {
      const stored = dateOnlyToUtcNoon(day);
      expect(stored?.toISOString()).toBe(`${day}T12:00:00.000Z`);
      for (const zone of [...US_ZONES, "UTC"]) {
        expect(dayKeyTz(stored, zone), zone).toBe(day);
      }
    });
  }

  it("rejects impossible and malformed days instead of rolling them over", () => {
    expect(dateOnlyToUtcNoon("2026-02-31")).toBeNull();
    expect(dateOnlyToUtcNoon("2026-13-01")).toBeNull();
    expect(dateOnlyToUtcNoon("2026-11-15T00:00:00Z")).toBeNull();
    expect(dateOnlyToUtcNoon("")).toBeNull();
  });
});

// src/lib/dates.ts used to claim the noon anchor "can never drift". It does,
// at and above UTC+12 — noon UTC is midnight there, so it lands on the next
// day. No US zone is affected, but the settings validator accepts any IANA
// name, so the limit is real and belongs in a test rather than in a promise.
describe("the noon anchor's actual limit", () => {
  const NOV_15 = "2026-11-15";
  const stored = dateOnlyToUtcNoon(NOV_15) as Date;

  it("holds from UTC-12 up to, but not including, UTC+12", () => {
    const inside = [
      ...US_ZONES,
      "UTC",
      "Etc/GMT+12", // UTC-12, the western extreme
      "Europe/London",
      "Asia/Tokyo", // UTC+9
      "Australia/Sydney", // UTC+11 in November
    ];
    for (const zone of inside) {
      expect(dayKeyTz(stored, zone), zone).toBe(NOV_15);
      expect(fmtDateTz(stored, zone), zone).toBe("Nov 15, 2026");
    }
  });

  it("reads one day late at and above UTC+12, in zones the validator accepts", () => {
    const beyond = [
      "Etc/GMT-12", // exactly UTC+12 — already past the edge
      "Pacific/Auckland", // UTC+13 in November
      "Pacific/Fiji",
      "Pacific/Kiritimati", // UTC+14
    ];
    for (const zone of beyond) {
      // Mirrors the check in src/app/api/settings/validation.ts.
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: zone }), zone).not.toThrow();
      expect(dayKeyTz(stored, zone), zone).toBe("2026-11-16");
      expect(fmtDateTz(stored, zone), zone).toBe("Nov 16, 2026");
    }
  });
});

describe("anchorDateOnly (zod preprocess)", () => {
  it("anchors a bare calendar date at noon UTC", () => {
    expect(anchorDateOnly("2026-11-15")).toEqual(new Date("2026-11-15T12:00:00.000Z"));
  });

  it("passes instants, Dates and junk through untouched for the validator behind it", () => {
    const iso = "2026-11-16T07:59:00.000Z";
    expect(anchorDateOnly(iso)).toBe(iso);
    const d = new Date(iso);
    expect(anchorDateOnly(d)).toBe(d);
    expect(anchorDateOnly("next tuesday")).toBe("next tuesday");
    expect(anchorDateOnly(undefined)).toBeUndefined();
    expect(anchorDateOnly(null)).toBeNull();
  });

  // Otherwise z.coerce.date() rolls it to Mar 3 at UTC midnight — a brand new
  // row in exactly the legacy shape this whole rule exists to retire.
  it("turns a date-shaped impossible day into an invalid Date, not a rollover", () => {
    const out = anchorDateOnly("2026-02-31");
    expect(out).toBeInstanceOf(Date);
    expect(Number.isNaN((out as Date).getTime())).toBe(true);
  });
});

// `evidenceDate` on /api/companies/[id]/evidence is the first date-only field
// that is also OPTIONAL, so it composes the preprocess with `.optional()`. The
// order matters and the failure is silent in the wrong direction: put
// `.optional()` inside the preprocess and an omitted field reaches
// `z.coerce.date()` as undefined and 400s the whole request. This pins the
// composition every optional date-only field must use.
describe("the optional date-only field shape", () => {
  const schema = z.object({
    when: z.preprocess(anchorDateOnly, z.coerce.date()).optional(),
  });

  it("accepts an omitted field and leaves it absent", () => {
    const out = schema.safeParse({});
    expect(out.success).toBe(true);
    expect(out.success && "when" in out.data).toBe(false);
  });

  it("anchors a bare calendar date at noon UTC", () => {
    const out = schema.safeParse({ when: "2026-11-15" });
    expect(out.success && out.data.when?.toISOString()).toBe("2026-11-15T12:00:00.000Z");
  });

  it("keeps a full timestamp as the instant it is", () => {
    const out = schema.safeParse({ when: "2026-11-15T08:30:00.000Z" });
    expect(out.success && out.data.when?.toISOString()).toBe("2026-11-15T08:30:00.000Z");
  });

  it("rejects an impossible day instead of rolling it into the next month", () => {
    expect(schema.safeParse({ when: "2026-02-31" }).success).toBe(false);
    expect(schema.safeParse({ when: "not a date" }).success).toBe(false);
  });
});

// followUpAt / appliedAt / backdated changedAt written before the tracker
// drawer moved to `dateOnlyToUtcNoon`: a real moment, at the *writer's* local
// noon, so the ±12h of slack keeps the calendar day stable across US zones.
// These rows are still in the database and must keep reading correctly.
describe("legacy local-noon instants across the DST boundaries", () => {
  const cases = [
    { label: "spring forward, written in LA (PDT, UTC-7)", iso: `${SPRING_FORWARD}T19:00:00Z`, day: SPRING_FORWARD },
    { label: "spring forward, written in NY (EDT, UTC-4)", iso: `${SPRING_FORWARD}T16:00:00Z`, day: SPRING_FORWARD },
    { label: "fall back, written in LA (PST, UTC-8)", iso: `${FALL_BACK}T20:00:00Z`, day: FALL_BACK },
    { label: "fall back, written in NY (EST, UTC-5)", iso: `${FALL_BACK}T17:00:00Z`, day: FALL_BACK },
  ];

  for (const { label, iso, day } of cases) {
    it(`${label} reads back as ${day} in LA and NY`, () => {
      expect(dayKeyTz(iso, LA)).toBe(day);
      expect(dayKeyTz(iso, NY)).toBe(day);
    });
  }

  it("holds for local noon in every US zone read from every other US zone", () => {
    for (const writeOffset of [-4, -5, -6, -7, -8, -9, -10]) {
      const iso = new Date(Date.UTC(2026, 10, 15, 12 - writeOffset)).toISOString();
      for (const zone of US_ZONES) {
        expect(dayKeyTz(iso, zone), `${iso} in ${zone}`).toBe("2026-11-15");
      }
    }
  });
});

// The calendar form posts an end-of-day instant built in the browser's zone.
// That is a real moment, so it is read in the viewer's zone by design — the
// reason a calendar *date* must never be stored end-of-day.
describe("end-of-day instants stay instants", () => {
  it("2026-11-15T23:59 Pacific is Nov 15 in LA and already Nov 16 in NY", () => {
    const iso = "2026-11-16T07:59:00.000Z";
    expect(fmtDateTz(iso, LA)).toBe("Nov 15, 2026");
    expect(fmtDateTz(iso, NY)).toBe("Nov 16, 2026");
  });
});

describe("dayKeyTz", () => {
  it("always names the same day the formatters print", () => {
    const samples = [
      EDGE.toISOString(),
      "2026-11-15T00:00:00Z",
      "2026-11-15T12:00:00Z",
      "2026-11-16T07:59:00Z",
      `${SPRING_FORWARD}T19:00:00Z`,
      `${FALL_BACK}T20:00:00Z`,
    ];
    for (const iso of samples) {
      for (const zone of [LA, NY, "UTC"]) {
        const [year, month, day] = dayKeyTz(iso, zone).split("-").map(Number);
        const printed = fmtDateTz(iso, zone);
        expect(printed, `${iso} in ${zone}`).toBe(
          new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(year, month - 1, day)))
        );
      }
    }
  });

  it("returns an empty key for nullish input so form seeds stay blank", () => {
    expect(dayKeyTz(null, LA)).toBe("");
    expect(dayKeyTz(undefined, LA)).toBe("");
  });
});

describe("addDaysToDayKey", () => {
  it("steps whole days across both DST boundaries", () => {
    expect(addDaysToDayKey("2026-03-07", 1)).toBe(SPRING_FORWARD);
    expect(addDaysToDayKey(SPRING_FORWARD, 1)).toBe("2026-03-09");
    expect(addDaysToDayKey("2026-10-31", 1)).toBe(FALL_BACK);
    expect(addDaysToDayKey(FALL_BACK, 1)).toBe("2026-11-02");
  });

  it("crosses month and year boundaries and steps backwards", () => {
    expect(addDaysToDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDayKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToDayKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysToDayKey("2026-11-15", 8)).toBe("2026-11-23");
  });

  it("keeps day keys sortable, which is what the calendar buckets rely on", () => {
    const today = "2026-11-15";
    expect(addDaysToDayKey(today, -1) < today).toBe(true);
    expect(today < addDaysToDayKey(today, 1)).toBe(true);
    expect(addDaysToDayKey(today, 1) < addDaysToDayKey(today, 8)).toBe(true);
  });
});

/** Exactly how src/app/calendar/page.tsx decides a deadline is overdue. */
const calendarSaysOverdue = (dueAt: Date, now: Date, tz: string) =>
  dayKeyTz(dueAt, tz) < dayKeyTz(now, tz);

/** What the dashboard did before: compare the raw instants. */
const rawInstantSaysOverdue = (dueAt: Date, now: Date) => dueAt.getTime() < now.getTime();

/** Every shape these columns hold, all meaning the calendar day Nov 15 2026. */
const NOV_15_SHAPES = [
  new Date("2026-11-15T00:00:00Z"), // legacy date-only / @db.Date, UTC midnight
  new Date("2026-11-15T12:00:00Z"), // date-only, noon UTC (the rule)
  new Date("2026-11-15T20:00:00Z"), // legacy local noon, written in LA
  new Date("2026-11-15T17:00:00Z"), // legacy local noon, written in NY
];

// The regression the split migration produced: one deadline, two pages, two days.
describe("cross-page agreement", () => {
  it("gives every storage shape one calendar day per timezone", () => {
    for (const stored of NOV_15_SHAPES) {
      for (const zone of US_ZONES) {
        expect(fmtDateTz(stored, zone), `${stored.toISOString()} in ${zone}`).toBe("Nov 15, 2026");
        expect(fmtDateShortTz(stored, zone), `${stored.toISOString()} in ${zone}`).toBe("Nov 15");
        expect(dayKeyTz(stored, zone), `${stored.toISOString()} in ${zone}`).toBe("2026-11-15");
      }
    }
  });

  // src/app/page.tsx (dashboard) vs src/app/calendar/page.tsx. The dashboard
  // used `d.dueAt.getTime() < now.getTime()`; it now uses `isDayBeforeTz`,
  // which must be the calendar's rule and nothing else.
  it("has the dashboard's overdue test answer exactly as the calendar's does", () => {
    // Every half hour across three days, so every boundary is crossed in
    // every zone — including the ones where the two rules used to diverge.
    for (let t = Date.UTC(2026, 10, 14); t < Date.UTC(2026, 10, 17); t += 30 * 60 * 1000) {
      const now = new Date(t);
      for (const dueAt of NOV_15_SHAPES) {
        for (const zone of US_ZONES) {
          const why = `${dueAt.toISOString()} vs now ${now.toISOString()} in ${zone}`;
          expect(isDayBeforeTz(dueAt, now, zone), why).toBe(
            calendarSaysOverdue(dueAt, now, zone)
          );
        }
      }
    }
  });

  it("stops calling a legacy Nov 15 deadline overdue at 16:00 PT on Nov 14", () => {
    const dueAt = new Date("2026-11-15T00:00:00Z"); // legacy date-only for Nov 15
    const now = new Date("2026-11-15T00:00:00.001Z"); // 16:00:00.001 PT, Nov 14

    expect(dayKeyTz(now, LA)).toBe("2026-11-14");
    expect(fmtDateTz(dueAt, LA)).toBe("Nov 15, 2026");

    // The old dashboard predicate: overdue, contradicting the date it printed
    // and contradicting /calendar, which filed the same row under "Today".
    expect(rawInstantSaysOverdue(dueAt, now)).toBe(true);
    expect(isDayBeforeTz(dueAt, now, LA)).toBe(false);
    expect(calendarSaysOverdue(dueAt, now, LA)).toBe(false);
  });

  it("still calls it overdue once the user's own day has turned over", () => {
    const dueAt = new Date("2026-11-15T00:00:00Z");
    const now = new Date("2026-11-16T08:00:00Z"); // 00:00 PT, Nov 16
    expect(dayKeyTz(now, LA)).toBe("2026-11-16");
    expect(isDayBeforeTz(dueAt, now, LA)).toBe(true);
    expect(calendarSaysOverdue(dueAt, now, LA)).toBe(true);
  });

  it("treats unparseable and nullish values as not-before, never as overdue", () => {
    const now = new Date("2026-11-15T18:00:00Z");
    expect(isDayBeforeTz(null, now, LA)).toBe(false);
    expect(isDayBeforeTz(undefined, now, LA)).toBe(false);
    expect(isDayBeforeTz("not a date", now, LA)).toBe(false);
    expect(isDayBeforeTz(new Date("2026-11-01T00:00:00Z"), "nonsense", LA)).toBe(false);
  });
});

// The dashboard cannot express a day key in SQL, so it widens each date split
// to `[utcDayStart(today - 1), utcDayStart(today + 1))` and buckets in JS. If
// that bracket ever failed to contain a row, the row would be dropped from the
// page entirely — a silent hole, not a visible wrong date.
describe("utcDayStart — the bracket the dashboard's queries widen to", () => {
  const todayKey = "2026-11-15";
  const bracketStart = utcDayStart(addDaysToDayKey(todayKey, -1));
  const bracketEnd = utcDayStart(addDaysToDayKey(todayKey, 1));
  const horizonKey = addDaysToDayKey(todayKey, 7);
  const horizonEnd = utcDayStart(addDaysToDayKey(todayKey, 9));

  it("names that day's own UTC midnight", () => {
    expect(utcDayStart("2026-11-15").toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(utcDayStart("2027-01-01").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  // The widest span the settings validator accepts, not just the US zones:
  // Etc/GMT+12 is UTC-12 and Pacific/Kiritimati is UTC+14.
  const EXTREMES = [...US_ZONES, "UTC", "Etc/GMT+12", "Pacific/Auckland", "Pacific/Kiritimati"];

  it("contains every row a day-key comparison could bucket differently", () => {
    for (const zone of EXTREMES) {
      for (let t = Date.UTC(2026, 10, 12); t < Date.UTC(2026, 10, 26); t += 30 * 60 * 1000) {
        const d = new Date(t);
        const key = dayKeyTz(d, zone);
        const why = `${d.toISOString()} (${key}) in ${zone}`;

        // Not overdue → the "upcoming" queries must be able to see it.
        if (key >= todayKey) expect(d.getTime(), why).toBeGreaterThanOrEqual(bracketStart.getTime());
        // Overdue → the "past" query must be able to see it.
        if (key < todayKey) expect(d.getTime(), why).toBeLessThan(bracketEnd.getTime());
        // Inside the next-7-days horizon → the counting query must see it.
        if (key >= todayKey && key <= horizonKey) {
          expect(d.getTime(), why).toBeGreaterThanOrEqual(bracketStart.getTime());
          expect(d.getTime(), why).toBeLessThan(horizonEnd.getTime());
        }
      }
    }
  });
});
