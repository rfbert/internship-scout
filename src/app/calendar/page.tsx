import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Figure, FigureStrip, PageFrame } from "@/components/register/page-frame";
import { Footnote, Legend, type LegendItem } from "@/components/register/footnote";
import { OutlineVerb } from "@/components/register/stamp";
import { SectionRule } from "@/components/register/rule";
import { Chip } from "@/components/register/chip";
import { DeadlineTape, type TapeItem } from "@/components/register/deadline-tape";
import {
  Ledger,
  LedgerCell,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { Band, Estimated } from "@/components/register/notation";
import { EmptyState, SampleBadge, rowRoleCls } from "@/components/ui";
import { DEADLINE_KIND_LABELS, TOKEN_TEXT, upper, urgencyColor } from "@/lib/format";
import { readUiPrefs } from "@/server/ui-prefs";
import {
  addDaysToDayKey,
  dayKeyTz,
  fmtDateShortTz,
  utcDayStart,
} from "@/lib/dates";
import { visibleDeadline } from "@/lib/deadlines";
import { ESTIMATED_GLOSS } from "@/lib/notation";
import { DEADLINE_KIND_CODES, deadlineKindColor } from "./meta";
import { DeadlineForm, type LinkOption } from "./deadline-form";
import { CompleteCheckbox, DeleteDeadlineButton } from "./deadline-actions";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   THE DIARY — `/calendar` (spec C6)

   Read top to bottom: the figures, the 45-day tape, then the agenda as
   ruled week blocks. Three things this conversion fixes, all of them named
   in the brief:

     · The page was called a calendar and rendered an agenda. It is now
       titled and structured as what it is — a diary of what comes due —
       and the agenda groups by CALENDAR WEEK rather than by the old
       "next 3 days / this week / later" buckets that had no printed edge.
     · The add-deadline worksheet no longer owns the top of the page. It is
       the last block, under its own rule, reachable from the head's verb.
     · `TONE_FOR_TOKEN` is gone. The kind mark is a `Chip` carrying the
       classification color as a leading tick, which is what the bridge was
       standing in for; the legacy `Badge` is no longer imported here.

   THE DAY RULE IS UNCHANGED AND IS LOAD-BEARING (D4). Every bucket below is
   a comparison of DAY KEYS in the user's zone (`dayKeyTz`), never of raw
   instants: an end-of-day deadline is a later instant than "now" but is
   still today, and the server's midnight is not the user's. `/` was
   deliberately moved onto this same rule — the two pages must never disagree
   about which day a deadline falls on — so the tape here is fed exactly the
   way the dashboard feeds it: day keys anchored at noon UTC, so `T-n` counts
   calendar days and the division never sits near the ±0 boundary.
   ══════════════════════════════════════════════════════════════════════════ */

const DAY_MS = 86_400_000;

/** Whole days between two day keys. Positive when `to` is later. */
const dayDiff = (fromKey: string, toKey: string) =>
  Math.round((utcDayStart(toKey).getTime() - utcDayStart(fromKey).getTime()) / DAY_MS);

/** Monday = 1 … Sunday = 7, computed from the KEY (a floating calendar date). */
const weekdayOf = (key: string) => utcDayStart(key).getUTCDay() || 7;

/** The Monday that opens the ISO week a day key belongs to. */
const weekStartOf = (key: string) => addDaysToDayKey(key, 1 - weekdayOf(key));

/**
 * ISO-8601 week number of a day key. Same arithmetic as `src/app/page.tsx`
 * (which prints `WEEK 33` in its eyebrow) — pure integers at UTC noon, so no
 * DST and no zone drift. Duplicated rather than shared because `src/lib/dates`
 * is FOUNDATION's file; see the handoff note in the report.
 */
function isoWeek(dayKey: string): number {
  const dt = utcDayStart(dayKey);
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7)); // the naming Thursday
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  return Math.ceil(((dt.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** `MON 17` — weekday first, the way a diary reads. */
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
const dayStamp = (key: string) =>
  upper(`${weekdayFmt.format(utcDayStart(key))} ${Number(key.slice(8, 10))}`);

/** `AUG 17` from a day key — a key is a floating date, so it prints in UTC. */
const keyStamp = (key: string) => upper(fmtDateShortTz(utcDayStart(key), "UTC"));

const relatedListingSelect = {
  id: true,
  title: true,
  isSample: true,
  company: { select: { name: true, isSample: true } },
} as const;

const deadlineInclude = {
  listing: { select: relatedListingSelect },
  application: { select: { id: true, listing: { select: relatedListingSelect } } },
} satisfies Prisma.DeadlineInclude;

type DeadlineRow = Prisma.DeadlineGetPayload<{ include: typeof deadlineInclude }>;

/**
 * One agenda line. Five tracks: the tick box, the dated stamp, the duty, its
 * classification, and the countdown that carries the delete verb.
 */
const AGENDA_COLS: LedgerCol[] = [
  { label: "", w: "26px" },
  { label: "Due", w: "104px" },
  { label: "Duty", w: "minmax(0,1fr)" },
  { label: "Kind", w: "132px" },
  { label: "In", w: "128px", align: "right" },
];

const PROMPT_COLS: LedgerCol[] = [
  { label: "Score", w: "148px", align: "right" },
  { label: "Company — role", w: "minmax(0,1fr)" },
  { label: "Standing", w: "168px" },
  { label: "", w: "96px", align: "right" },
];

function DeadlineLine({
  d,
  completed,
  todayKey,
  timezone,
}: {
  d: DeadlineRow;
  completed: boolean;
  todayKey: string;
  timezone: string;
}) {
  const rel = d.listing ?? d.application?.listing ?? null;
  const key = dayKeyTz(d.dueAt, timezone);
  const days = dayDiff(todayKey, key);
  const late = !completed && days < 0;
  const stamp = dayStamp(key);
  const full = `${DEADLINE_KIND_LABELS[d.kind]} · due ${keyStamp(key)}${
    d.isEstimated ? " (estimated)" : ""
  }`;

  return (
    <LedgerRow key={d.id} tick={late ? "carmine" : undefined} title={full} struck={completed}>
      <LedgerCell>
        <CompleteCheckbox deadlineId={d.id} completed={completed} title={d.title} />
      </LedgerCell>
      {/* `tone`, not `className` — see LedgerCell: as a class the carmine of a
          deadline inside seven days lost to the cell's own `text-ink-2`, and
          only the 21-day ochre warning ever showed. */}
      <LedgerCell mono tone={completed ? "ink-3" : urgencyColor(late ? 0 : days)}>
        {d.isEstimated ? <Estimated label={`${keyStamp(key)}, estimated`}>{stamp}</Estimated> : stamp}
      </LedgerCell>
      <LedgerCell title={`${rel ? `${rel.company.name} · ` : ""}${d.title}`}>
        {rel ? <b className="font-semibold">{rel.company.name}</b> : null}
        {rel ? <span className={rowRoleCls}> · </span> : null}
        <span className={completed ? "text-ink-3" : ""} data-row-title>
          {d.title}
        </span>{" "}
        <SampleBadge isSample={rel ? rel.isSample || rel.company.isSample : false} />
      </LedgerCell>
      <LedgerCell>
        {/* The kind mark. This chip — bordered mono caps with the
            classification color as a LEADING TICK — is what the page's old
            `TONE_FOR_TOKEN` bridge existed to fake with the legacy `Badge`.
            The word always prints beside the tick, so color is never the sole
            carrier of meaning (D3). */}
        <Chip
          label={DEADLINE_KIND_CODES[d.kind]}
          tick={completed ? "ink-3" : deadlineKindColor(d.kind)}
          title={DEADLINE_KIND_LABELS[d.kind]}
        />
      </LedgerCell>
      <LedgerCell align="right">
        <span className="inline-flex items-center justify-end gap-1.5">
          <span
            className={`font-mono text-[11px] tabular-nums ${
              completed
                ? "text-ink-3"
                : late
                  ? "font-semibold uppercase tracking-[0.06em] text-carmine"
                  : TOKEN_TEXT[urgencyColor(days)]
            }`}
          >
            {completed ? keyStamp(key) : late ? `Overdue ${Math.abs(days)}d` : `T−${days}d`}
          </span>
          <DeleteDeadlineButton deadlineId={d.id} title={d.title} />
        </span>
      </LedgerCell>
    </LedgerRow>
  );
}

/** One ruled block of the agenda: a section rule over its own ledger. */
function AgendaBlock({
  label,
  right,
  tick,
  rows,
  todayKey,
  timezone,
}: {
  label: string;
  right: string;
  tick?: "carmine" | "ochre";
  rows: DeadlineRow[];
  todayKey: string;
  timezone: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-4 first:mt-0">
      <SectionRule label={label} right={right} tick={tick} />
      <Ledger cols={AGENDA_COLS} minWidth={720} label={label}>
        <LedgerSection>
          {rows.map((d) => (
            <DeadlineLine
              key={d.id}
              d={d}
              completed={false}
              todayKey={todayKey}
              timezone={timezone}
            />
          ))}
        </LedgerSection>
      </Ledger>
    </section>
  );
}

export default async function CalendarPage() {
  const now = new Date();
  const { timezone } = await readUiPrefs();

  const [deadlines, noDeadlineListings, listingRaw, applicationRaw] = await Promise.all([
    // `visibleDeadline`, not "no where clause". A deadline attached to a
    // soft-deleted application must leave this page when the application does:
    // the query had no filter at all, so withdrawing an application kept its
    // deadline in the Overdue / Today / Next-7 figures and in the agenda while
    // `/` — which has always filtered on the same rule — had already dropped
    // it, and the two pages printed different counts for the same day. The
    // completed ones stay: this page renders them in their own block, which is
    // why it takes `visibleDeadline` rather than `/`'s `liveDeadline`.
    prisma.deadline.findMany({
      where: visibleDeadline,
      include: deadlineInclude,
      orderBy: { dueAt: "asc" },
    }),
    prisma.internshipListing.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        applicationDeadline: null,
        currentBand: { in: ["EXCEPTIONAL", "HIGH_PRIORITY"] },
        decisions: { some: { state: { in: ["PENDING_REVIEW", "ACCEPTED"] } } },
      },
      select: {
        id: true,
        title: true,
        isSample: true,
        currentBand: true,
        currentScore: true,
        company: { select: { name: true, isSample: true } },
      },
      orderBy: { currentScore: { sort: "desc", nulls: "last" } },
    }),
    prisma.internshipListing.findMany({
      where: {
        deletedAt: null,
        decisions: { some: { state: { in: ["ACCEPTED", "PENDING_REVIEW"] } } },
      },
      select: { id: true, title: true, company: { select: { name: true } } },
      orderBy: { currentScore: { sort: "desc", nulls: "last" } },
      take: 50,
    }),
    prisma.application.findMany({
      where: { deletedAt: null },
      select: { id: true, listing: { select: { title: true, company: { select: { name: true } } } } },
      orderBy: { lastActivityAt: "desc" },
    }),
  ]);

  const listingOptions: LinkOption[] = listingRaw.map((l) => ({
    id: l.id,
    label: `${l.company.name} — ${l.title}`,
  }));
  const applicationOptions: LinkOption[] = applicationRaw.map((a) => ({
    id: a.id,
    label: `${a.listing.company.name} — ${a.listing.title}`,
  }));

  const open = deadlines.filter((d) => !d.completedAt);
  const completed = deadlines
    .filter((d) => d.completedAt)
    .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());

  // Bucket on the same calendar day the row prints, not on the raw instant:
  // an end-of-day deadline is a later instant than "now" but still today, and
  // the server's own midnight is not the user's. Day keys sort chronologically.
  // `/` splits the identical way (`isDayBeforeTz` is this comparison, named).
  const dayOf = new Map(deadlines.map((d) => [d.id, dayKeyTz(d.dueAt, timezone)]));
  const day = (d: DeadlineRow) => dayOf.get(d.id) ?? "";
  const d0 = dayKeyTz(now, timezone);
  const d1 = addDaysToDayKey(d0, 1);
  const d7 = addDaysToDayKey(d0, 7);

  const overdue = open.filter((d) => day(d) < d0);
  const today = open.filter((d) => day(d) === d0);
  const ahead = open.filter((d) => day(d) >= d1);
  const next7 = open.filter((d) => day(d) >= d0 && day(d) <= d7);

  /* ── The week blocks ────────────────────────────────────────────────────
     Everything after today is filed under the Monday that opens its week, in
     day-key space. Eight weeks get their own rule; past that the register
     stops pretending to schedule and prints one LATER block, which is also
     what stops an unbounded query from rendering forty near-empty sections. */
  const horizonWeekKey = weekStartOf(addDaysToDayKey(weekStartOf(d0), 7 * 8));
  const weekOrder: string[] = [];
  const byWeek = new Map<string, DeadlineRow[]>();
  const later: DeadlineRow[] = [];
  for (const d of ahead) {
    const wk = weekStartOf(day(d));
    if (wk >= horizonWeekKey) {
      later.push(d);
      continue;
    }
    const bucket = byWeek.get(wk);
    if (bucket) bucket.push(d);
    else {
      byWeek.set(wk, [d]);
      weekOrder.push(wk);
    }
  }
  weekOrder.sort();

  const thisWeekKey = weekStartOf(d0);
  const weekLabel = (wk: string) =>
    wk === thisWeekKey ? "Rest of this week" : `Week ${isoWeek(wk)}`;

  /* ── The tape ───────────────────────────────────────────────────────────
     Fed day keys anchored at noon UTC, exactly as `/` feeds it. Handing it
     raw instants would give the page two overdue rules — `ceil` rounds a
     deadline that fell late yesterday to -0 and the tape would call it ahead,
     while the agenda above calls it overdue. The noon anchor makes the tape's
     subtraction identical to `dayDiff`, so `T-n` is "n calendar days out".

     Horizon is A7's clamp of the furthest LOADED deadline into [14, 45]; this
     page's queries are unbounded, so in practice it opens to the full 45 days.
     Overdue items ride the gutter, capped at the three most recent so a long
     tail of missed work cannot overflow a 72px strip — the full list is
     printed, uncapped, in the OVERDUE block below. */
  const dayNoonIso = (key: string) => new Date(utcDayStart(key).getTime() + DAY_MS / 2).toISOString();
  const toTapeItem = (d: DeadlineRow): TapeItem => {
    const rel = d.listing ?? d.application?.listing ?? null;
    return {
      id: d.id,
      label: upper(rel?.company.name ?? d.title),
      dueAt: dayNoonIso(day(d)),
      isEstimated: d.isEstimated,
    };
  };
  const tapeItems: TapeItem[] = [
    ...overdue.slice(-3).map(toTapeItem),
    ...today.map(toTapeItem),
    ...ahead.map(toTapeItem),
  ];

  const dateLine = upper(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(now)
  );

  const legendItems: LegendItem[] = [];
  if (open.some((d) => d.isEstimated) || completed.some((d) => d.isEstimated)) {
    legendItems.push({ mark: "~", meaning: ESTIMATED_GLOSS });
  }

  return (
    <>
      <PageFrame
        eyebrow={`DIARY OF DEADLINES · ${dateLine} · WEEK ${isoWeek(d0)}`}
        title="What comes due, and when."
        figures={
          <>
            {open.length} OPEN · {completed.length} COMPLETED
            <br />
            {timezone.replace(/_/g, " ")}
          </>
        }
        verbs={<OutlineVerb href="#enter-a-deadline">Enter a deadline</OutlineVerb>}
      />

      <FigureStrip>
        <Figure
          value={overdue.length}
          label="Overdue"
          sub="Missed"
          tone={overdue.length > 0 ? "carmine" : undefined}
        />
        <Figure
          value={today.length}
          label="Today"
          sub="Due now"
          tone={today.length > 0 ? "ochre" : undefined}
        />
        <Figure value={next7.length} label="Deadlines" sub="Next 7 days" />
        <Figure value={ahead.length} label="Ahead" sub="After today" />
        <Figure
          value={noDeadlineListings.length}
          label="Undated"
          sub="High priority"
          href="/review"
          tone={noDeadlineListings.length > 0 ? "ochre" : undefined}
        />
        {/* `Completed`, not `Struck`. STRUCK is the review queue's word for a
            record that was REJECTED (`review/meta.ts`); a deadline you ticked
            off is the opposite of rejected, and one word could not mean both. */}
        <Figure value={completed.length} label="Completed" sub="Deadlines" />
      </FigureStrip>

      {/* 1 · The horizon, full width — the instrument this page was missing.
             It is drawn only when it has something to draw. `DeadlineTape`
             prints its own one-line "nothing scheduled" when handed an empty
             set, which is right on `/`, where the tape is the only thing
             speaking for deadlines — but here the agenda below says the same
             thing, and the page ended up declaring the same emptiness three
             times in three different phrasings (the tape's line, the section
             rule's `NOTHING OPEN`, and the empty state's `No upcoming
             deadlines`). One absence, one statement: the agenda's. */}
      {tapeItems.length > 0 ? (
        <section className="mb-6">
          <DeadlineTape items={tapeItems} now={dayNoonIso(d0)} label="Deadline horizon" />
        </section>
      ) : null}

      {/* 2 · The agenda. One ruled block per week, no cards. */}
      {open.length === 0 ? (
        <section>
          {/* `0 DUE` is the count every other agenda block prints in this slot,
              not a second way of saying "nothing". */}
          <SectionRule label="Agenda" right="0 DUE" />
          <div className="rounded border border-rule bg-surface">
            <EmptyState
              title="No open deadlines on file"
              hint="A deadline appears here as soon as an accepted listing carries an application date — or enter one yourself at the foot of this page."
            />
          </div>
        </section>
      ) : (
        <div>
          <AgendaBlock
            label="Overdue"
            right={`${overdue.length} MISSED`}
            tick="carmine"
            rows={overdue}
            todayKey={d0}
            timezone={timezone}
          />
          <AgendaBlock
            label={`Today · ${dayStamp(d0)}`}
            right={`${today.length} DUE`}
            tick={today.length > 0 ? "ochre" : undefined}
            rows={today}
            todayKey={d0}
            timezone={timezone}
          />
          {weekOrder.map((wk) => {
            const rows = byWeek.get(wk) ?? [];
            return (
              <AgendaBlock
                key={wk}
                label={weekLabel(wk)}
                right={`${keyStamp(wk)} — ${keyStamp(addDaysToDayKey(wk, 6))} · ${rows.length} DUE`}
                rows={rows}
                todayKey={d0}
                timezone={timezone}
              />
            );
          })}
          <AgendaBlock
            label="Later"
            right={`BEYOND ${keyStamp(horizonWeekKey)} · ${later.length} DUE`}
            rows={later}
            todayKey={d0}
            timezone={timezone}
          />
        </div>
      )}

      {/* 3 · Standing risk: strong listings with no date on record at all. */}
      {noDeadlineListings.length > 0 ? (
        <section className="mt-6">
          <SectionRule
            label="No deadline on record"
            right={`${noDeadlineListings.length} APPLY-SOON`}
            tick="ochre"
          />
          <Ledger cols={PROMPT_COLS} minWidth={720} label="High-priority listings with no deadline">
            <LedgerSection>
              {noDeadlineListings.map((l) => (
                <LedgerRow key={l.id} title={`${l.company.name} — ${l.title}`}>
                  <LedgerCell align="right">
                    <Band band={l.currentBand} score={l.currentScore} />
                  </LedgerCell>
                  <LedgerCell title={`${l.company.name} — ${l.title}`}>
                    <b className="font-semibold">{l.company.name}</b>
                    <span className={rowRoleCls}> — {l.title}</span>{" "}
                    <SampleBadge isSample={l.isSample || l.company.isSample} />
                  </LedgerCell>
                  <LedgerCell>
                    <Chip label="No confirmed date" tick="ochre" />
                  </LedgerCell>
                  <LedgerCell align="right">
                    <Link
                      href={`/review?listing=${l.id}`}
                      className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-blue underline-offset-2 hover:underline"
                    >
                      Review →
                    </Link>
                  </LedgerCell>
                </LedgerRow>
              ))}
            </LedgerSection>
          </Ledger>
          <p className="mt-1.5 font-mono text-[11px] tracking-[0.04em] text-ink-3">
            Pending or accepted listings in the top two bands with no application deadline on
            record. These can close without warning — treat them as apply-soon.
          </p>
        </section>
      ) : null}

      {/* 4 · What has been ticked off. A record, so it ships collapsed. */}
      {completed.length > 0 ? (
        <section className="mt-6">
          <details>
            <summary className="flex h-[28px] cursor-pointer list-none items-center gap-2.5 border-b border-t border-feint bg-inset pl-3.5 pr-3.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3 transition-colors duration-[120ms] ease-out hover:bg-sel">
              Completed deadlines
              <span className="ml-auto font-normal tracking-[0.1em]">
                {completed.length} DONE
              </span>
            </summary>
            <Ledger cols={AGENDA_COLS} minWidth={720} label="Completed deadlines">
              <LedgerSection>
                {completed.map((d) => (
                  <DeadlineLine
                    key={d.id}
                    d={d}
                    completed
                    todayKey={d0}
                    timezone={timezone}
                  />
                ))}
              </LedgerSection>
            </Ledger>
          </details>
        </section>
      ) : null}

      {/* 5 · The worksheet. Last, not first: entering a deadline is the rarer
             act, and the agenda is what the page is for. The head's verb
             jumps here. */}
      <section id="enter-a-deadline" className="mt-6 scroll-mt-6">
        <SectionRule label="Enter a deadline" right="WORKSHEET" />
        <div className="rounded border border-rule bg-surface">
          <DeadlineForm listingOptions={listingOptions} applicationOptions={applicationOptions} />
        </div>
        <p className="mt-1.5 font-mono text-[11px] tracking-[0.04em] text-ink-3">
          Cutoffs, interviews, follow-ups and reminders. Link one to a listing or to an application —
          choosing one clears the other.
        </p>
      </section>

      <Footnote
        legend={
          <>
            DAYS ARE COUNTED IN {upper(timezone.replace(/_/g, " "))}
            {legendItems.length > 0 ? " · " : null}
            <Legend items={legendItems} />
          </>
        }
        keys={null}
      />
    </>
  );
}
