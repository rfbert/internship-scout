import type { ApplicationStage, Prisma } from "@prisma/client";
import { isDayBeforeTz } from "./dates";

/**
 * Single source of truth for the application pipeline stages. The Prisma
 * enum, the stage API route, and the tracker UI all derive from this list —
 * change it here (and in schema.prisma) only.
 */
export const STAGE_VALUES = [
  "INTERESTED",
  "PREPARING",
  "READY_TO_APPLY",
  "APPLIED",
  "ONLINE_ASSESSMENT",
  "RECRUITER_SCREEN",
  "FIRST_INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "PRODUCT_CASE_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "CLOSED",
] as const satisfies readonly ApplicationStage[];

/** Active pipeline stages, in progression order. */
export const PIPELINE_STAGES: ApplicationStage[] = [...STAGE_VALUES.slice(0, 10)];

/**
 * Terminal stages — the application has stopped moving *through the pipeline*.
 *
 * This is a statement about the pipeline, not about whether the row still asks
 * anything of you: OFFER is terminal and is also the most demanding row in the
 * register. Do not reach for this list to answer "is this one dead?" — that
 * question is `CLOSED_OUT_STAGES` below, and answering it with this list is the
 * bug `tests/unit/overdue.test.ts` now pins.
 */
export const TERMINAL_STAGES: ApplicationStage[] = [...STAGE_VALUES.slice(10)];

export const STAGE_ORDER: ApplicationStage[] = [...PIPELINE_STAGES, ...TERMINAL_STAGES];

export const stageRank = (s: ApplicationStage): number => STAGE_ORDER.indexOf(s);

/* ── Open vs closed out, and the one follow-up rule ────────────────────────
   Three surfaces used to answer "is this follow-up overdue?" differently: `/`
   counted OFFER rows, /tracker did not, and the morning email had its own
   hand-typed copy of the exclusion list. Everything below exists so that
   answer is written once.

   OFFER COUNTS. The argument, since this is the whole disagreement:

     · The offer row is the one place in the register where a missed date is
       unrecoverable. Offers expire; every other stage forgives a late nudge.
     · A follow-up ON an offer was typed after the offer landed — "call the
       recruiter Thursday", "answer by the 20th". It is the user's own
       deliberate instruction, and swallowing it is the app overruling them.
       A follow-up on a REJECTED row is the opposite: a leftover from before
       the outcome arrived, and nagging about it is noise.
     · The codebase had already worked around the grouping twice by hand —
       `/`'s census does `moving = onFile - atOffer`, the tracker's figures do
       `TERMINAL_STAGES.filter(s => s !== "OFFER")`. Two hand-rolled
       subtractions of the same element mean the element is in the wrong set.

   So: closed out = REJECTED / WITHDRAWN / CLOSED. Open = everything else. */

/** Nothing further will happen here. The only set that means "dead". */
export const CLOSED_OUT_STAGES: ApplicationStage[] = TERMINAL_STAGES.filter((s) => s !== "OFFER");

/** Still open — the pipeline stages plus OFFER. `/`'s census counts these. */
export const OPEN_STAGES: ApplicationStage[] = STAGE_ORDER.filter(
  (s) => !CLOSED_OUT_STAGES.includes(s)
);

/**
 * The same set as a Prisma fragment, so a query and the JS predicate below
 * cannot select different stages. Queries widen, `isFollowUpOverdue` decides:
 * SQL cannot express a day key, so every follow-up query narrows to this filter
 * plus a date bracket and the survivors are re-tested in JS.
 */
export const OPEN_STAGE_FILTER = {
  notIn: CLOSED_OUT_STAGES,
} satisfies Prisma.EnumApplicationStageFilter;

/**
 * The app's ONE overdue test: the follow-up's printed calendar day is already
 * past and the application is not closed out.
 *
 * Every surface that says "overdue" calls this function — `/`'s figure, the
 * tracker's server-side row selection, the tracker's per-row badge and section
 * summaries. That shared call is the guarantee, not this comment: the tracker
 * server keeps exactly the rows this returns true for, so a row can no longer
 * be selected *because* it is overdue and then printed without the mark.
 *
 * Day keys rather than instants, and the caller's `now` rather than
 * `Date.now()`, for the reasons `src/lib/dates.ts` sets out: a follow-up is
 * stored at noon UTC, so the raw-instant form stamped OVERDUE on a follow-up
 * due TODAY from 05:00 Pacific onward, and the browser's clock drifts from the
 * server's between render and hydration.
 */
export const isFollowUpOverdue = (
  followUpAt: Date | string | null | undefined,
  stage: ApplicationStage,
  now: Date | string,
  timeZone: string
): boolean =>
  Boolean(followUpAt) &&
  !CLOSED_OUT_STAGES.includes(stage) &&
  isDayBeforeTz(followUpAt, now, timeZone);
