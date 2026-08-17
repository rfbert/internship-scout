import { describe, expect, it } from "vitest";
import type { ApplicationStage } from "@prisma/client";
import {
  CLOSED_OUT_STAGES,
  OPEN_STAGES,
  OPEN_STAGE_FILTER,
  STAGE_ORDER,
  TERMINAL_STAGES,
  isFollowUpOverdue,
} from "@/lib/stages";
import { isOverdue } from "@/app/tracker/meta";
import { liveDeadline, visibleDeadline } from "@/lib/deadlines";
import { addDaysToDayKey, dayKeyTz, utcDayStart } from "@/lib/dates";

/* ══════════════════════════════════════════════════════════════════════════
   ONE DEFINITION OF "OVERDUE".

   Three surfaces answered this differently, and each of them carried a comment
   claiming it agreed with the others:

     · `/`            counted OFFER rows        (ACTIVE_STAGES included OFFER)
     · `/tracker`     did not                   (notIn TERMINAL_STAGES)
     · morning email  did not                   (hand-typed exclusion list)

   and `/tracker?overdue=1&stage=<terminal>` selected rows on the date test
   alone that the row badge then refused to mark, printing a table of rows
   chosen BECAUSE they were overdue above a summary reading "0 overdue".

   These tests exist so the prose in those files cannot go back to being
   decorative. They assert the shared definition, not a re-implementation of it.
   ══════════════════════════════════════════════════════════════════════════ */

const LA = "America/Los_Angeles";
/** 08:00 Pacific — a morning page load, mid-way through the UTC day. */
const NOW = new Date("2026-08-12T15:00:00Z");
/** Noon-anchored Aug 10, the shape `dateOnlyToUtcNoon` writes. Two days late. */
const TWO_DAYS_LATE = new Date("2026-08-10T12:00:00Z");
/** Noon-anchored Aug 12 — due TODAY, which is not overdue. */
const DUE_TODAY = new Date("2026-08-12T12:00:00Z");

describe("#1 · the stage sets the three surfaces read", () => {
  it("puts OFFER in the open set, not the closed-out set", () => {
    // The decision this review made, written down where it can be broken
    // loudly: an offer's follow-up is the most expensive one in the register
    // to swallow, so it is chased like any other open row.
    expect(OPEN_STAGES).toContain("OFFER");
    expect(CLOSED_OUT_STAGES).not.toContain("OFFER");
    expect(isFollowUpOverdue(TWO_DAYS_LATE, "OFFER", NOW, LA)).toBe(true);
  });

  it("closes out exactly REJECTED, WITHDRAWN and CLOSED", () => {
    expect([...CLOSED_OUT_STAGES].sort()).toEqual(["CLOSED", "REJECTED", "WITHDRAWN"]);
    for (const stage of CLOSED_OUT_STAGES) {
      expect(isFollowUpOverdue(TWO_DAYS_LATE, stage, NOW, LA)).toBe(false);
    }
  });

  it("partitions every stage into open or closed out, with none left over", () => {
    // Add a stage to the Prisma enum and forget it here and this fails, rather
    // than the new stage silently landing on one side of the overdue question.
    expect([...OPEN_STAGES, ...CLOSED_OUT_STAGES].sort()).toEqual([...STAGE_ORDER].sort());
    for (const s of OPEN_STAGES) expect(CLOSED_OUT_STAGES).not.toContain(s);
  });

  it("keeps TERMINAL_STAGES distinct from CLOSED_OUT_STAGES by exactly OFFER", () => {
    // TERMINAL_STAGES is still the right answer to "has it stopped moving
    // through the pipeline?" — it is the wrong answer to "is it dead?", and
    // reaching for it there is the bug. Pin the difference.
    expect(TERMINAL_STAGES).toContain("OFFER");
    expect(TERMINAL_STAGES.filter((s) => !CLOSED_OUT_STAGES.includes(s))).toEqual(["OFFER"]);
  });

  it("hands every query the same stage set the predicate applies", () => {
    // `/`'s figure, /tracker's two queries and the agent's email query all pass
    // this object. If it ever stops matching the predicate's own exclusion, a
    // query can select a stage the predicate rejects — which is finding #2.
    expect(OPEN_STAGE_FILTER.notIn).toBe(CLOSED_OUT_STAGES);
    for (const stage of OPEN_STAGE_FILTER.notIn) {
      expect(isFollowUpOverdue(TWO_DAYS_LATE, stage, NOW, LA)).toBe(false);
    }
  });

  it("still refuses a follow-up due today, in every open stage", () => {
    // The older bug this must not regress into: a follow-up stored at noon UTC
    // falls behind `now` from 05:00 Pacific, so a raw-instant test stamps
    // OVERDUE on a row printing today's date.
    for (const stage of OPEN_STAGES) {
      expect(isFollowUpOverdue(DUE_TODAY, stage, NOW, LA)).toBe(false);
    }
    expect(isFollowUpOverdue(null, "APPLIED", NOW, LA)).toBe(false);
    expect(isFollowUpOverdue(undefined, "APPLIED", NOW, LA)).toBe(false);
  });
});

describe("#2 · /tracker?overdue=1 cannot select a row it then refuses to mark", () => {
  /**
   * `src/app/tracker/page.tsx`, reproduced: the SQL narrowing, then the JS
   * filter that decides which rows reach the client. The SQL half is written
   * out here (a query object cannot be executed without a database); the JS
   * half is the real function the page calls.
   */
  const overdueBracketEnd = utcDayStart(addDaysToDayKey(dayKeyTz(NOW, LA), 1));
  const serverKeepsRow = (followUpAt: Date, stage: ApplicationStage) => {
    const passesSql =
      followUpAt < overdueBracketEnd && !OPEN_STAGE_FILTER.notIn.includes(stage);
    return passesSql && isFollowUpOverdue(followUpAt, stage, NOW, LA);
  };
  /** `ledger-view.tsx` / `next-action.tsx`, via `meta.ts`. */
  const clientMarksRow = (followUpAt: Date, stage: ApplicationStage) =>
    isOverdue(followUpAt.toISOString(), stage, NOW.toISOString(), LA);

  it("agrees with the client badge for every stage, including terminal ones", () => {
    // The reviewer's table. Before the fix: APPLIED true/true, OFFER
    // true/false, REJECTED true/false — rows selected as overdue, printed as
    // ordinary, and counted as zero.
    const disagreements = STAGE_ORDER.filter(
      (stage) => serverKeepsRow(TWO_DAYS_LATE, stage) !== clientMarksRow(TWO_DAYS_LATE, stage)
    );
    expect(disagreements).toEqual([]);
    // …and not vacuously: the fixture is a genuinely overdue row somewhere.
    expect(serverKeepsRow(TWO_DAYS_LATE, "APPLIED")).toBe(true);
  });

  it("returns nothing for ?overdue=1&stage=<closed out> rather than unmarkable rows", () => {
    for (const stage of CLOSED_OUT_STAGES) {
      expect(serverKeepsRow(TWO_DAYS_LATE, stage)).toBe(false);
      expect(clientMarksRow(TWO_DAYS_LATE, stage)).toBe(false);
    }
  });

  it("keeps and marks an overdue OFFER row under ?overdue=1&stage=OFFER", () => {
    expect(serverKeepsRow(TWO_DAYS_LATE, "OFFER")).toBe(true);
    expect(clientMarksRow(TWO_DAYS_LATE, "OFFER")).toBe(true);
  });

  it("uses the tracker's badge and the shared predicate as one function", () => {
    // Not "these two agree on the cases we thought of" — the same function
    // object. A future local copy in meta.ts fails here immediately.
    expect(isOverdue).toBe(isFollowUpOverdue);
  });
});

describe("#3 · deadlines of removed applications", () => {
  it("excludes them, and lets a deadline with no application through", () => {
    expect(visibleDeadline.OR).toEqual([
      { applicationId: null },
      { application: { deletedAt: null } },
    ]);
  });

  it("adds only 'not completed' for the surfaces counting outstanding work", () => {
    expect(liveDeadline.completedAt).toBeNull();
    expect(liveDeadline.OR).toEqual(visibleDeadline.OR);
  });
});
