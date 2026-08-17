import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  REAP_AFTER_H,
  aboveInfo,
  aboveInfoColor,
  aboveInfoLabel,
  agentVersionLabel,
  isStatsDigestEvent,
  runDuration,
  shortWarning,
  statCounters,
  warningForSource,
  warningSummary,
} from "@/app/runs/meta";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const at = (iso: string) => new Date(iso);

/* ══════════════════════════════════════════════════════════════════════════
   1 · A REAPED RUN IS NOT A TEN-DAY RUN
   ══════════════════════════════════════════════════════════════════════════ */

describe("runDuration", () => {
  /* The real row, from the production table: a MANUAL run that collected
     nothing, died, and was closed out by the janitor ten days later. It
     printed "237h 45m", which reads as a run that ground away for ten days. */
  const reaped = {
    status: "FAILED",
    startedAt: at("2026-07-31T01:58:11.812Z"),
    finishedAt: at("2026-08-09T23:43:57.208Z"),
  };

  it("does not print the janitor's delay as a runtime", () => {
    const d = runDuration(reaped);
    expect(d.unfinished).toBe(true);
    expect(d.text).toBe("did not finish");
    expect(d.text).not.toMatch(/\d+h/);
  });

  /* The run's own event log says "still RUNNING 238h after start". A page that
     rounded differently from the janitor would have the header and the stream
     disagree about the same run by an hour. */
  it("agrees with the janitor's own event text to the hour", () => {
    expect(runDuration(reaped).sentence).toBe("did not finish · reaped after 238h");
  });

  it("still measures a run that genuinely finished", () => {
    const d = runDuration({
      status: "SUCCESS",
      startedAt: at("2026-08-12T14:20:18.074Z"),
      finishedAt: at("2026-08-12T14:23:10.816Z"),
    });
    expect(d.unfinished).toBe(false);
    expect(d.text).toBe("2m 53s");
  });

  /* The distinguishing test is FAILED + a span past the janitor's threshold.
     A run that failed fast is the common case and must be unaffected — the
     agent's own catch stamps `finishedAt` the moment it catches. */
  it("leaves a genuinely short FAILED run alone", () => {
    const d = runDuration({
      status: "FAILED",
      startedAt: at("2026-08-12T14:20:00.000Z"),
      finishedAt: at("2026-08-12T14:21:30.000Z"),
    });
    expect(d.unfinished).toBe(false);
    expect(d.text).toBe("1m 30s");
  });

  /* A SUCCESS is never reaped — the janitor only touches RUNNING rows — so a
     long successful run must keep its real duration however long it is. */
  it("does not reinterpret a long SUCCESS", () => {
    const d = runDuration({
      status: "SUCCESS",
      startedAt: at("2026-08-01T00:00:00.000Z"),
      finishedAt: at("2026-08-03T00:00:00.000Z"),
    });
    expect(d.unfinished).toBe(false);
    expect(d.text).toBe("48h 0m");
  });

  it("says so while a run is still open", () => {
    expect(runDuration({ status: "RUNNING", startedAt: at("2026-08-12T14:20:00Z"), finishedAt: null }).text)
      .toBe("running…");
  });
});

/* The threshold used to be pinned against the janitor script's own constant.
   That script belongs to the ingestion side and is not in this repository, so
   there is no second copy left to drift from — `REAP_AFTER_H` owns the number.
   What is still worth asserting is that it is a sane one: a reaper that fires
   inside a working day would mark healthy long runs dead. */
describe("the reap threshold", () => {
  it("is long enough not to reap a run that is merely slow", () => {
    expect(REAP_AFTER_H).toBeGreaterThanOrEqual(12);
    expect(Number.isInteger(REAP_AFTER_H)).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 · WARNINGS, COUNTED WHERE RUNS ARE COUNTED
   ══════════════════════════════════════════════════════════════════════════ */

describe("aboveInfo", () => {
  const events = [
    { level: "INFO" as const },
    { level: "WARN" as const },
    { level: "WARN" as const },
    { level: "ERROR" as const },
  ];

  it("counts WARN and ERROR apart", () => {
    expect(aboveInfo(events)).toEqual({ warn: 2, error: 1, total: 3 });
  });

  it("ignores INFO", () => {
    expect(aboveInfo([{ level: "INFO" as const }])).toEqual({ warn: 0, error: 0, total: 0 });
  });

  /* The reaped run's only non-INFO line is the janitor's ERROR. Calling that
     "1 WARNING" is how a dead run reads as a merely noisy one. */
  it("does not call a lone ERROR a warning", () => {
    expect(aboveInfoLabel(aboveInfo([{ level: "ERROR" as const }]))).toBe("1 ERROR");
  });

  it("names both when both are present", () => {
    expect(aboveInfoLabel(aboveInfo(events))).toBe("2 WARN · 1 ERROR");
    expect(aboveInfoLabel(aboveInfo(events), true)).toBe("2 WARN 1 ERR");
  });

  it("prints an em dash for a clean run", () => {
    expect(aboveInfoLabel(aboveInfo([]))).toBe("—");
  });

  it("escalates to carmine once anything errored", () => {
    expect(aboveInfoColor(aboveInfo([]))).toBeUndefined();
    expect(aboveInfoColor(aboveInfo([{ level: "WARN" as const }]))).toBe("ochre");
    expect(aboveInfoColor(aboveInfo(events))).toBe("carmine");
  });
});

describe("warningForSource", () => {
  /* `collect()` logs `${source.key}: ${warning}`, verbatim from the 12 Aug run. */
  const msg = "github:jobright-ai/2027-AI-ML-Internship: NOT_YET_AVAILABLE: repo or branch missing";

  it("strips the key the agent prefixed", () => {
    expect(warningForSource(msg, "github:jobright-ai/2027-AI-ML-Internship")).toBe(
      "NOT_YET_AVAILABLE: repo or branch missing"
    );
  });

  it("returns null for a different source", () => {
    expect(warningForSource(msg, "lever:watchlist")).toBeNull();
  });

  /* Source keys nest: these two share sixteen leading characters, and a
     substring match would file one connector's warning against the other. */
  it("will not match a source whose key is a prefix of another", () => {
    const other = "github:speedyapply/2027-SWE-College-Jobs: 12 postings";
    expect(warningForSource(other, "github:speedyapply/2027-AI-College-Jobs")).toBeNull();
  });
});

describe("shortWarning", () => {
  it("drops the machine code and keeps the finding", () => {
    expect(shortWarning("NOT_YET_AVAILABLE: repo or branch missing")).toBe("repo or branch missing");
  });

  it("leaves prose alone", () => {
    expect(shortWarning("vansh: no table with Company/Role/Link headers found", 80)).toBe(
      "vansh: no table with Company/Role/Link headers found"
    );
  });

  it("clips with an ellipsis that says so", () => {
    const out = shortWarning("linear: reachable, 31 jobs, 0 intern-titled postings", 26);
    expect(out).toHaveLength(26);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("warningSummary", () => {
  it("is empty when nothing warned", () => {
    expect(warningSummary([])).toBe("");
  });

  it("counts the rest rather than truncating the list", () => {
    expect(
      warningSummary([
        "NOT_YET_AVAILABLE: repo or branch missing",
        "something else",
        "a third thing",
      ])
    ).toBe("repo or branch missing +2 more");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3 · THE STATS BLOB, LOGGED AT ITSELF
   ══════════════════════════════════════════════════════════════════════════ */

describe("isStatsDigestEvent", () => {
  it("suppresses the JSON digest the run closes with", () => {
    expect(
      isStatsDigestEvent({
        stage: "report",
        message: 'Run SUCCESS: {"fetched":549,"resighted":456,"new":6}',
      })
    ).toBe(true);
  });

  /* The throwing path reuses the same stage and prefix to carry the actual
     failure. Dropping that line would delete the only statement of what went
     wrong from the page whose job is to show it. */
  it("keeps the failure message that shares its prefix", () => {
    expect(
      isStatsDigestEvent({
        stage: "report",
        message: "Run FAILED: Transaction API error: Transaction already closed",
      })
    ).toBe(false);
  });

  it("keeps the janitor's note", () => {
    expect(
      isStatsDigestEvent({
        stage: "report",
        message: "Marked FAILED by janitor: still RUNNING 238h after start (process presumed dead).",
      })
    ).toBe(false);
  });

  it("does not reach outside the report stage", () => {
    expect(isStatsDigestEvent({ stage: "collect", message: 'Run SUCCESS: {"a":1}' })).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 · A COLUMN THAT MEANS ONE THING
   ══════════════════════════════════════════════════════════════════════════ */

describe("statCounters", () => {
  /* The two adjacent rows from the review, verbatim. Under the old
     "top few non-zero" rule the first printed FETCHED·NEW·CHANGED·QUEUED and
     the second FETCHED·CHANGED·QUEUED·RESCORED, so position 2 meant NEW on one
     line and CHANGED on the next. */
  const withNew = { fetched: 549, new: 6, changed: 4, queued: 1, resighted: 456 };
  const withoutNew = { fetched: 543, changed: 4, queued: 12, rescored: 464, resighted: 458 };

  it("puts the same key in the same position on every row", () => {
    const a = statCounters(withNew).map((c) => c.key);
    const b = statCounters(withoutNew).map((c) => c.key);
    expect(a).toEqual(b);
    expect(a).toEqual(["fetched", "new", "changed", "queued"]);
  });

  it("holds the position open when the run recorded no such counter", () => {
    const b = statCounters(withoutNew);
    expect(b[1]).toEqual({ key: "new", label: "NEW", value: null });
  });

  it("reads the values it does have", () => {
    expect(statCounters(withNew).map((c) => c.value)).toEqual([549, 6, 4, 1]);
  });

  /* A run that died before writing stats has a null blob. Every position still
     has to be held, or the column reflows on exactly the rows worth reading. */
  it("survives a run with no stats at all", () => {
    expect(statCounters(null).map((c) => c.value)).toEqual([null, null, null, null]);
  });

  it("never lets a high-count stat displace a fixed one", () => {
    const noisy = { rescored: 9999, dropped_NOT_US: 500, fetched: 1 };
    expect(statCounters(noisy).map((c) => c.key)).toEqual(["fetched", "new", "changed", "queued"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5 · A VERSION STAMP THAT NAMES SOMETHING
   ══════════════════════════════════════════════════════════════════════════ */

describe("agentVersionLabel", () => {
  /* `run.ts` writes `process.env.APP_VERSION ?? "dev"` and APP_VERSION is set
     nowhere, production included — so every row on file says "dev" and every
     footnote printed "AGENT DEV". */
  it("treats the placeholder as no version at all", () => {
    expect(agentVersionLabel("dev")).toBeNull();
    expect(agentVersionLabel("DEV")).toBeNull();
  });

  it("treats missing and blank as no version", () => {
    expect(agentVersionLabel(null)).toBeNull();
    expect(agentVersionLabel(undefined)).toBeNull();
    expect(agentVersionLabel("   ")).toBeNull();
  });

  it("prints a real version", () => {
    expect(agentVersionLabel("2026.08.12")).toBe("2026.08.12");
    expect(agentVersionLabel(" a1b2c3d ")).toBe("a1b2c3d");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6 · THE /runs LEDGER WIDTH

   tests/unit/ledger-width.test.ts pins every other ledger in the app against
   the /opportunities ceiling; /runs was outside that pin because its width was
   written inline as `minWidth={980}` — the same way /reports slipped out, as
   that file's own comment records. It is a named constant now, and pinned
   here rather than by editing a test another agent may be holding.
   ══════════════════════════════════════════════════════════════════════════ */

describe("the /runs ledger width", () => {
  const RUNS = "src/app/runs/page.tsx";
  const OPPORTUNITIES = "src/app/opportunities/page.tsx";

  function minWidth(rel: string): number {
    const m = /\bMIN_WIDTH\s*=\s*(\d+)\s*;/.exec(source(rel));
    if (!m) throw new Error(`${rel} no longer declares MIN_WIDTH as a plain integer literal.`);
    return Number(m[1]);
  }

  it("is a named constant, not an inline literal", () => {
    expect(source(RUNS)).toContain("minWidth={MIN_WIDTH}");
  });

  it("sits at or below the /opportunities ceiling", () => {
    expect(minWidth(RUNS)).toBeLessThanOrEqual(minWidth(OPPORTUNITIES));
  });

  /* The columns are fixed tracks plus one `minmax(0,1fr)` for COUNTERS. If the
     fixed tracks and their gaps ever eat the whole minimum width, the counter
     grid this file exists to make readable collapses to nothing. */
  it("leaves the counters column real room at its minimum", () => {
    const src = source(RUNS);
    const block = /const COLS: LedgerCol\[\] = \[([\s\S]*?)\n\];/.exec(src);
    if (!block) throw new Error(`${RUNS} no longer declares COLS as an array literal.`);
    const fixed = [...block[1].matchAll(/w:\s*"(\d+)px"/g)].reduce((n, m) => n + Number(m[1]), 0);
    const tracks = (block[1].match(/\{\s*label:/g) ?? []).length;
    const gaps = (tracks - 1) * 10; // gap-x-2.5 in `gridRow`
    const padding = 10 + 14; // pl-2.5 + pr-3.5
    expect(minWidth(RUNS) - fixed - gaps - padding).toBeGreaterThanOrEqual(260);
  });
});
