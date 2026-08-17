import Link from "next/link";
import type { ApplicationStage, Prisma, ScoreBand, SponsorshipCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Figure, FigureStrip, PageFrame } from "@/components/register/page-frame";
import { Footnote, Keys, Legend, type LegendItem } from "@/components/register/footnote";
import { Stamp } from "@/components/register/stamp";
import { SectionRule } from "@/components/register/rule";
import { Census } from "@/components/register/census";
import { Spectrum } from "@/components/register/spectrum";
import { DeadlineTape, type TapeItem } from "@/components/register/deadline-tape";
import {
  Ledger,
  LedgerCell,
  LedgerMicroRow,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { Estimated } from "@/components/register/notation";
import { EmptyState, SampleBadge, rowRoleCls } from "@/components/ui";
import {
  Acquisitions,
  Correspondence,
  Docket,
  type AcquisitionRow,
  type CorrespondenceRow,
  type DocketDuty,
} from "./docket";
import { PrintButton } from "./print-button";
import {
  BAND_LABELS,
  DEADLINE_KIND_LABELS,
  RUN_STATUS_LABELS,
  SPONSORSHIP_LABELS,
  TOKEN_TEXT,
  fmtAgo,
  runStatusColor,
  upper,
  urgencyColor,
} from "@/lib/format";
import { ESTIMATED_GLOSS, bandText, sponsorshipText } from "@/lib/notation";
import { readUiPrefs } from "@/server/ui-prefs";
import {
  addDaysToDayKey,
  dayKeyTz,
  fmtDateShortTz,
  fmtTimeTz,
  isDayBeforeTz,
  utcDayStart,
} from "@/lib/dates";
import { agentVersionLabel } from "@/app/runs/meta";
import { OPEN_STAGES, OPEN_STAGE_FILTER, isFollowUpOverdue } from "@/lib/stages";
// The soft-delete rule every deadline query on every page shares — see
// @/lib/deadlines for why it is not written out here any more.
import { liveDeadline } from "@/lib/deadlines";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   THE MORNING DOCKET — `/` (spec C1)

   The page answers one question in one screen: what does today ask of me? It
   is read top-to-bottom as a printed report — figures, then the day's duties,
   then the overnight intake, then the horizon — and every mark on it is either
   a duty, a record or an instrument.

   NOTHING BELOW CHANGES A QUERY (D4). The twelve-way `Promise.all` and the
   Phase-2 day-key bucketing beneath it are load-bearing and are reproduced
   verbatim; only the rendering is new. In particular: the ±1-day bracket, the
   `isDayBeforeTz` split and the capped overdue prefix are the fix that stopped
   this page and /calendar from disagreeing about the same deadline, and every
   derivation added here (the docket's duties, the week-ahead slice) reuses
   `dayKeyTz`/`isDayBeforeTz` rather than inventing a second date rule.

   The one permitted data-shape addition is `notationMode` on the existing
   `prefs` select (A5) — the footnote legend has to know which marks are
   actually on screen, and in Plain mode the marks are already words.
   ══════════════════════════════════════════════════════════════════════════ */

const deadlineTargetSelect = {
  title: true,
  isSample: true,
  company: { select: { name: true, isSample: true } },
} as const;

const deadlineInclude = {
  listing: { select: deadlineTargetSelect },
  application: { select: { listing: { select: deadlineTargetSelect } } },
} satisfies Prisma.DeadlineInclude;

type DashboardDeadline = Prisma.DeadlineGetPayload<{ include: typeof deadlineInclude }>;

const byDueAtAsc = (a: DashboardDeadline, b: DashboardDeadline) =>
  a.dueAt.getTime() - b.dueAt.getTime();

/** The listing a deadline is about, whichever side it hangs off. */
const deadlineTarget = (d: DashboardDeadline) => d.listing ?? d.application?.listing ?? null;

const DAY_MS = 86_400_000;

/** Whole days between two day keys. Positive when `to` is later. */
const dayDiff = (fromKey: string, toKey: string) =>
  Math.round((utcDayStart(toKey).getTime() - utcDayStart(fromKey).getTime()) / DAY_MS);

/**
 * ISO-8601 week number of a day key. Computed from the KEY, not the instant, so
 * it is the week of the day this app prints — the same day the rest of the page
 * buckets on. Pure integer arithmetic at UTC noon: no DST, no zone drift.
 */
function isoWeek(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  dt.setUTCDate(dt.getUTCDate() + 4 - weekday); // the Thursday that names the week
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  return Math.ceil(((dt.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** One numeric field out of an `AgentRun.stats` JSON blob, or null. */
function statNum(stats: unknown, key: string): number | null {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return null;
  const v = (stats as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** `06:12` — `fmtTimeTz` prints seconds, and the masthead readout does not want them. */
const hhmm = (d: Date, tz: string) => fmtTimeTz(d, tz).slice(0, 5);

const WEEK_AHEAD_COLS: LedgerCol[] = [
  { label: "Day", w: "76px" },
  { label: "What", w: "minmax(0,1fr)" },
  { label: "Kind", w: "96px", align: "right" },
];

const CLOSED_COLS: LedgerCol[] = [
  { label: "Listing", w: "minmax(0,1fr)" },
  { label: "Closed", w: "132px", align: "right" },
];

export default async function DashboardPage() {
  const now = new Date();

  // Read before the queries, not alongside them: every date split below is a
  // day-key split in the user's zone, and the zone decides where the day
  // boundaries fall.
  const { timezone: tz, notation } = await readUiPrefs();

  // A day is the day this app *prints*, exactly as /calendar buckets it. SQL
  // cannot express that — the boundary instant depends on the zone and on
  // whether a row is a floating date-only value — so each query widens to the
  // ±1-day bracket around the UTC day start (see `utcDayStart`) and the real
  // call is made in JS below. Splitting on the raw instant instead is what put
  // a legacy UTC-midnight Nov 15 deadline in "overdue" here while /calendar
  // printed it under "Today".
  const todayKey = dayKeyTz(now, tz);
  const bracketStart = utcDayStart(addDaysToDayKey(todayKey, -1));
  const bracketEnd = utcDayStart(addDaysToDayKey(todayKey, 1));
  // "Next 7 days" = today through today+7, the same span of calendar days the
  // old `now … now + 7d` instant range could touch; +9 is that plus bracket.
  const horizonKey = addDaysToDayKey(todayKey, 7);
  const horizonEnd = utcDayStart(addDaysToDayKey(todayKey, 9));

  /* TWELVE QUERIES, FOUR CONNECTIONS AT A TIME.
   *
   * These were one `Promise.all` of twelve, which opens twelve connections at
   * the same instant. That is the precise shape that exhausted Supabase's
   * 15-client session pooler and took /sources down with
   * `FATAL: (EMAXCONNSESSION)` — and this is `/`, the default route and the
   * masthead's first link, so it carries more traffic than /sources ever did.
   * The pooler does not care which page is asking.
   *
   * Split into three sequential groups rather than converted to thunks or a
   * concurrency limiter: three statements are plainly correct without relying
   * on `PrismaPromise` laziness, and the queries, their arguments and the
   * order of the results are untouched — only how many are in flight at once.
   * Grouping is by nothing more than position; there are no dependencies
   * between them.
   *
   * The rule this page's own header states — NOTHING BELOW CHANGES A QUERY
   * (D4) — still holds. Not one query changed. */
  const [awaitingReview, discoveredRecently, overdueFollowUps, deadlineHorizon] =
    await Promise.all([
    prisma.userListingDecision.count({
      where: { state: "PENDING_REVIEW", listing: { deletedAt: null } },
    }),
    prisma.internshipListing.findMany({
      where: { discoveredAt: { gte: bracketStart }, deletedAt: null },
      select: { discoveredAt: true },
    }),
    // Follow-ups split on the day key like everything else here, and by the
    // same bracket trick: `lt: bracketEnd` catches every row that could be
    // overdue, `isFollowUpOverdue` below decides which ones are. That predicate
    // is @/lib/stages' — the SAME function /tracker filters its `?overdue=1`
    // rows with and marks each row with — so this figure and that table count
    // one definition of the word, stage set included. They used to differ by
    // exactly OFFER: this page counted an overdue offer follow-up, the tracker
    // refused to, and clicking the figure took you to a table that disagreed
    // with the number you clicked. (What is NOT guaranteed by the shared call:
    // this query is not user-scoped where /tracker's is. Single-user
    // deployment, one `prisma.user.findFirst()` — if that ever stops being
    // true, this needs the same `userId` the tracker applies.)
    // Deliberately not shared: src/agent/run.ts's email query, which asks the
    // wider question ("follow-ups DUE", today's included) on the raw instant.
    // Its STAGE set is shared — it reads `OPEN_STAGE_FILTER` too.
    prisma.application.findMany({
      where: { deletedAt: null, followUpAt: { lt: bracketEnd }, stage: OPEN_STAGE_FILTER },
      select: { followUpAt: true, stage: true },
    }),
    prisma.deadline.findMany({
      where: { ...liveDeadline, dueAt: { gte: bracketStart, lt: horizonEnd } },
      select: { dueAt: true },
    }),
  ]);

  const [lastRun, bestDecisions, futureDeadlines, bracketDeadlines] = await Promise.all([
    prisma.agentRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.userListingDecision.findMany({
      // "Best" means ones worth your time: a role the eligibility gates already
      // ruled out (PhD-only, clearance, wrong season) is not an opportunity, and
      // it was crowding this panel out of the top six.
      where: {
        state: "PENDING_REVIEW",
        listing: { deletedAt: null, currentBand: { not: "INELIGIBLE" } },
      },
      orderBy: { listing: { currentScore: { sort: "desc", nulls: "last" } } },
      take: 6,
      include: {
        listing: {
          include: {
            company: { select: { name: true, isSample: true } },
            locations: { orderBy: { isPrimary: "desc" }, take: 1 },
          },
        },
      },
    }),
    // Past the bracket, raw-instant order and day-key order agree, so Prisma's
    // cap is safe here: these are all genuinely upcoming. An unbounded
    // dueAt-ascending query let the oldest overdue items fill all 8 slots and
    // hide every future deadline; overdue work is surfaced separately
    // (needs-action figure + a capped overdue prefix).
    prisma.deadline.findMany({
      where: { ...liveDeadline, dueAt: { gte: bracketEnd } },
      orderBy: { dueAt: "asc" },
      take: 8,
      include: deadlineInclude,
    }),
    // Inside the bracket a row's bucket is undecidable in SQL, so take all of
    // them — two days of deadlines — and sort them in JS.
    prisma.deadline.findMany({
      where: { ...liveDeadline, dueAt: { gte: bracketStart, lt: bracketEnd } },
      orderBy: { dueAt: "asc" },
      include: deadlineInclude,
    }),
  ]);

  const [pastDeadlines, stageGroups, recentlyClosed, referrals] = await Promise.all([
    // Before the bracket everything is missed. Capped so stale ones can never
    // crowd the upcoming list out of its own panel again.
    prisma.deadline.findMany({
      where: { ...liveDeadline, dueAt: { lt: bracketStart } },
      orderBy: { dueAt: "desc" },
      take: 3,
      include: deadlineInclude,
    }),
    prisma.application.groupBy({
      by: ["stage"],
      where: { deletedAt: null, stage: { in: OPEN_STAGES } },
      _count: { _all: true },
    }),
    prisma.internshipListing.findMany({
      where: { status: "CLOSED", deletedAt: null },
      orderBy: { closedAt: { sort: "desc", nulls: "last" } },
      take: 5,
      include: { company: { select: { name: true, isSample: true } } },
    }),
    prisma.referral.findMany({
      where: { stage: { in: ["CONTACTED", "REFERRAL_REQUESTED"] } },
      orderBy: { updatedAt: "asc" },
      take: 5,
      include: {
        contact: { select: { name: true, position: true } },
        listing: { select: { title: true, company: { select: { name: true } } } },
      },
    }),
  ]);

  /* ── Buckets ───────────────────────────────────────────────────────────── */

  // One decision per row, made the way /calendar makes it, reused for both the
  // bucket and the badge — so the page cannot print "overdue" next to a date it
  // also files under upcoming.
  const missed = (d: DashboardDeadline) => isDayBeforeTz(d.dueAt, now, tz);
  const needsAction = overdueFollowUps.filter((a) =>
    isFollowUpOverdue(a.followUpAt, a.stage, now, tz)
  ).length;
  const overdueDeadlines = [...pastDeadlines, ...bracketDeadlines.filter(missed)]
    .sort(byDueAtAsc)
    .slice(-3);
  const upcomingDeadlines = [
    ...bracketDeadlines.filter((d) => !missed(d)),
    ...futureDeadlines,
  ].sort(byDueAtAsc);

  // Overdue first (ascending, so the oldest of the capped three leads), then
  // the genuinely upcoming ones.
  const deadlineList = [...overdueDeadlines, ...upcomingDeadlines].slice(0, 8);

  const newToday = discoveredRecently.filter(
    (l) => dayKeyTz(l.discoveredAt, tz) === todayKey
  ).length;
  const deadlinesNext7 = deadlineHorizon.filter((d) => {
    const key = dayKeyTz(d.dueAt, tz);
    return key >= todayKey && key <= horizonKey;
  }).length;

  const stageCounts: Partial<Record<ApplicationStage, number>> = {};
  for (const g of stageGroups) stageCounts[g.stage] = g._count._all;
  const onFile = stageGroups.reduce((n, g) => n + g._count._all, 0);
  const atOffer = stageCounts.OFFER ?? 0;
  const moving = onFile - atOffer;

  /* ── I · The docket: the day's duties ──────────────────────────────────── */

  const toDuty = (d: DashboardDeadline, overdueDays: number): DocketDuty => {
    const target = deadlineTarget(d);
    return {
      id: d.id,
      overdueDays,
      dayStamp: upper(fmtDateShortTz(d.dueAt, tz)),
      company: target?.company.name ?? null,
      title: d.title,
      kind: d.kind,
      isEstimated: d.isEstimated,
      isSample: Boolean(target?.isSample || target?.company.isSample),
    };
  };

  const duties: DocketDuty[] = [
    ...overdueDeadlines.map((d) => toDuty(d, dayDiff(dayKeyTz(d.dueAt, tz), todayKey))),
    ...upcomingDeadlines
      .filter((d) => dayKeyTz(d.dueAt, tz) === todayKey)
      .map((d) => toDuty(d, 0)),
  ];
  const dueToday = duties.length - duties.filter((d) => (d.overdueDays ?? 0) > 0).length;

  /* ── II · Overnight acquisitions ───────────────────────────────────────── */

  const acquisitions: AcquisitionRow[] = bestDecisions.map((d) => {
    const l = d.listing;
    const loc = l.locations[0];
    return {
      id: d.id,
      listingId: l.id,
      company: l.company.name,
      title: l.title,
      score: l.currentScore,
      band: l.currentBand,
      category: l.currentSponsorshipCategory,
      confidence: l.currentSponsorshipConfidence,
      location: loc ? (loc.isRemote ? "Remote" : loc.rawText) : "—",
      isNew: dayKeyTz(l.discoveredAt, tz) === todayKey,
      isSample: Boolean(l.isSample || l.company.isSample),
    };
  });

  // The spectrum reads the same six records the rows do — it is their shape,
  // not a second sample. Rows with no score yet have no position on the axis.
  const spectrumPoints = acquisitions
    .filter((a): a is AcquisitionRow & { score: number; band: ScoreBand } =>
      a.score != null && a.band != null
    )
    .map((a) => ({ id: a.id, score: a.score, band: a.band }));
  const sortedScores = spectrumPoints.map((p) => p.score).sort((a, b) => a - b);
  const median = sortedScores.length
    ? Math.round(
        sortedScores.length % 2
          ? sortedScores[(sortedScores.length - 1) / 2]
          : (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
      )
    : undefined;

  /* ── III · Correspondence ──────────────────────────────────────────────── */

  const correspondence: CorrespondenceRow[] = referrals.map((r) => ({
    id: r.id,
    name: r.contact.name,
    context:
      [
        r.contact.position,
        r.listing ? `${r.listing.company.name} · ${r.listing.title}` : null,
      ]
        .filter(Boolean)
        .join(" — ") || "—",
    stage: r.stage,
    updatedAt: r.updatedAt,
  }));

  /* ── IV · Week ahead + the tape ────────────────────────────────────────── */

  const weekStartKey = addDaysToDayKey(todayKey, 1);
  const weekAhead = upcomingDeadlines.filter((d) => {
    const key = dayKeyTz(d.dueAt, tz);
    return key >= weekStartKey && key <= horizonKey;
  });
  const weekRange = `${upper(fmtDateShortTz(utcDayStart(weekStartKey), tz))} · ${upper(
    fmtDateShortTz(utcDayStart(horizonKey), tz)
  )}`;

  // The tape computes `ceil((dueAt - now) / 1 day)` on whatever instants it is
  // handed, and uses the sign of that to decide what is overdue. Handing it raw
  // instants would give this page two different overdue rules: a deadline that
  // fell late yesterday evening is overdue by the day-key rule the docket and
  // /calendar use, but is only ~8 hours old, so `ceil` rounds it to -0 and the
  // tape would file it as still ahead. So the tape is handed DAY KEYS instead —
  // each item and `now` anchored at noon UTC of the calendar day it prints on.
  // Its subtraction is then exactly `dayDiff`, `T-n` reads as "n calendar days
  // out" (which is what a tape should say), and the noon anchor keeps the
  // division nowhere near the ±0 boundary.
  const dayNoonIso = (key: string) =>
    new Date(utcDayStart(key).getTime() + DAY_MS / 2).toISOString();
  const nowIso = dayNoonIso(todayKey);
  const tapeItems: TapeItem[] = deadlineList.map((d) => {
    const target = deadlineTarget(d);
    return {
      id: d.id,
      label: upper(target?.company.name ?? d.title),
      dueAt: dayNoonIso(dayKeyTz(d.dueAt, tz)),
      isEstimated: d.isEstimated,
    };
  });

  /* ── V · The footnote ──────────────────────────────────────────────────── */

  // The legend lists ONLY what is on this screen, and only where a mark needs
  // expanding: in Plain mode a band already prints its own word, so a legend
  // line reading "EXCEPTIONAL exceptional" is noise. The certainty stroke is
  // never obvious and is always listed when an estimate is on the page.
  const legendItems: LegendItem[] = [];
  if (notation === "COMPACT") {
    const bands: ScoreBand[] = [];
    const spons: SponsorshipCategory[] = [];
    for (const a of acquisitions) {
      if (a.band && !bands.includes(a.band)) bands.push(a.band);
      if (a.category && !spons.includes(a.category)) spons.push(a.category);
    }
    for (const b of bands) {
      legendItems.push({ mark: bandText(b, notation), meaning: BAND_LABELS[b].toLowerCase() });
    }
    for (const s of spons) {
      legendItems.push({
        mark: sponsorshipText(s, notation),
        meaning: SPONSORSHIP_LABELS[s].toLowerCase(),
      });
    }
  }
  const anyEstimated =
    duties.some((d) => d.isEstimated) ||
    weekAhead.some((d) => d.isEstimated) ||
    tapeItems.some((i) => i.isEstimated);
  if (anyEstimated) {
    legendItems.push({ mark: "~", meaning: ESTIMATED_GLOSS });
  }

  const intakeReport = (() => {
    if (!lastRun) return "NO INTAKE ON FILE";
    const bits = [`INTAKE ${upper(fmtDateShortTz(lastRun.runDate, tz))}`];
    const scanned = statNum(lastRun.stats, "fetched");
    const fresh = statNum(lastRun.stats, "new");
    const queued = statNum(lastRun.stats, "queued");
    const errors =
      (statNum(lastRun.stats, "sourceErrors") ?? 0) + (statNum(lastRun.stats, "processErrors") ?? 0);
    if (scanned != null) bits.push(`${scanned} scanned`);
    if (fresh != null) bits.push(`${fresh} new unique`);
    if (queued != null) bits.push(`${queued} queued`);
    if (errors > 0) bits.push(`${errors} collection errors`);
    // `run.ts` stamps `APP_VERSION ?? "dev"` and APP_VERSION is set in no
    // environment, so this printed "AGENT dev" for every reader in production
    // too — a version that names nothing. `agentVersionLabel` returns null for
    // the placeholder and the stamp is simply omitted.
    const version = agentVersionLabel(lastRun.version);
    if (version) bits.push(`AGENT ${version}`);
    return bits.join(" · ");
  })();

  /* ── The report ────────────────────────────────────────────────────────── */

  const dateLine = upper(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(now)
  );
  const weekday = upper(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now)
  );
  // `MON 11`. Built from two formatters rather than one: en-US renders
  // `{weekday, day}` as "11 Mon", and the register reads the day name first.
  // UTC because a day key is a floating calendar date, never an instant.
  const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
  const dayStamp = (key: string) =>
    upper(`${weekdayFmt.format(utcDayStart(key))} ${Number(key.slice(8, 10))}`);

  return (
    <>
      <PageFrame
        eyebrow={`MORNING REPORT · ${dateLine} · WEEK ${isoWeek(todayKey)}`}
        title="The day, in order."
        figures={
          /* The old `Last run` stat tile is gone, but its link is not: the
             readout is where the run now reports, so the run's own page hangs
             off it. No navigation the dashboard had today is lost. */
          <Link href="/runs" className="underline-offset-2 hover:underline">
            {lastRun ? (
              <>
                Intake {upper(fmtDateShortTz(lastRun.runDate, tz))} ·{" "}
                <span className={TOKEN_TEXT[runStatusColor(lastRun.status)]}>
                  {RUN_STATUS_LABELS[lastRun.status]}
                </span>
                <br />
                {lastRun.finishedAt
                  ? `closed ${hhmm(lastRun.finishedAt, tz)}`
                  : `started ${hhmm(lastRun.startedAt, tz)}`}{" "}
                · {fmtAgo(lastRun.finishedAt ?? lastRun.startedAt)}
              </>
            ) : (
              <>No intake on file</>
            )}
          </Link>
        }
        verbs={
          <>
            <PrintButton />
            {/* A verb is screen furniture: on paper it is a dead rectangle. */}
            <Stamp href="/review" className="no-print">
              Start review
            </Stamp>
          </>
        }
      />

      {/* 1 · The figures — ONE RULED LINE, never a card grid. Seven cells, all
             seven derived from queries that were already loaded.

             `href` is spent, not sprinkled: `Figure` prints an `OPEN →` for
             every link, and seven of them in a 170px-per-cell strip is a row of
             arrows rather than a row of numbers. So a cell links only where the
             destination is somewhere else — the three whose evidence is already
             printed further down this page (today's actions → the docket,
             moving/at-offer → the census) stay plain. Every destination the
             dashboard linked to before is still one click away. */}
      <FigureStrip>
        {/* `?overdue=1` is the figure's own filter, not decoration: the bare
            /tracker link landed on the unfiltered register, so a reader who
            clicked a cell reading "3 OVERDUE" arrived at 36 rows and had to
            find the chip themselves. With the query string the destination
            shows those three rows and nothing else — the tracker selects them
            with the predicate this figure counted. */}
        <Figure
          value={needsAction}
          label="Overdue"
          sub="Follow-ups"
          href="/tracker?overdue=1"
          tone={needsAction > 0 ? "carmine" : undefined}
        />
        <Figure
          value={dueToday}
          label="Actions"
          sub="Due today"
          tone={dueToday > 0 ? "ochre" : undefined}
        />
        <Figure value={awaitingReview} label="Awaiting" sub="Review" href="/review" />
        {/* `Today`, not `Overnight`. The count is `discoveredAt` on TODAY's day
            key in the reader's zone, so a run at 3pm lands in it — the word
            has to be the one the arithmetic actually uses. */}
        <Figure value={newToday} label="New" sub="Today" href="/opportunities" />
        <Figure value={deadlinesNext7} label="Deadlines" sub="Next 7 days" href="/calendar" />
        <Figure value={moving} label="Applications" sub="Moving" />
        <Figure
          value={atOffer}
          label="Offer"
          sub="On the table"
          tone={atOffer > 0 ? "green" : undefined}
        />
      </FigureStrip>

      {/* 2 · The two columns. Left is the working surface, right is the standing
             state of the register — the ratio is the mock's.

             It splits at xl (1280), not lg: the acquisitions ledger declares a
             760px minimum, and a 320px rail taken out of a 1024px viewport
             leaves 584px, which would put the day's best opportunities behind a
             horizontal scrollbar. Below 1280 the rail drops under the docket and
             the ledger gets the whole measure. 2xl is 1600 in this theme, where
             a 400px rail still leaves the left column over 1000px. */}
      <div className="grid gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <Docket weekday={weekday} duties={duties} queueCount={awaitingReview} />
          <Acquisitions
            rows={acquisitions}
            queueCount={awaitingReview}
            right={`${newToday} NEW TODAY · ${awaitingReview} QUEUED`}
            spectrum={
              spectrumPoints.length > 1 ? (
                <Spectrum points={spectrumPoints} median={median} label="Intake spectrum" />
              ) : null
            }
          />
          <Correspondence rows={correspondence} />
        </div>

        <div className="min-w-0">
          <section>
            {/* `stageGroups` is an ACTIVE-only groupBy (D4 forbids widening it),
                so group V prints 0 and the rule says so rather than letting the
                zeros read as "nothing was ever closed". */}
            <SectionRule label="Pipeline census" right="ACTIVE ONLY" />
            <div className="px-1 pt-2">
              <Census
                counts={stageCounts}
                total={onFile}
                href={(s) => `/tracker?stage=${s}`}
              />
            </div>
          </section>

          <section className="mt-5">
            <SectionRule label="Week ahead" right={weekAhead.length > 0 ? weekRange : "CLEAR"} />
            {weekAhead.length === 0 ? (
              <div className="rounded border border-rule bg-surface">
                <EmptyState
                  title="Nothing in the next seven days"
                  hint="Deadlines from listings and applications appear here as they are tracked."
                />
              </div>
            ) : (
              <Ledger cols={WEEK_AHEAD_COLS} minWidth={300} label="Deadlines in the week ahead">
                <LedgerSection>
                  {weekAhead.map((d) => {
                    const target = deadlineTarget(d);
                    const key = dayKeyTz(d.dueAt, tz);
                    const days = dayDiff(todayKey, key);
                    const stamp = dayStamp(key);
                    return (
                      <LedgerRow
                        key={d.id}
                        title={`${DEADLINE_KIND_LABELS[d.kind]} · ${
                          target ? `${target.company.name} — ` : ""
                        }${d.title}`}
                      >
                        {/* `tone`, not `className` — as a class the <7-day
                            carmine lost to the cell's `text-ink-2`, so the
                            urgent deadline was the ONLY one that looked
                            ordinary. See LedgerCell. */}
                        <LedgerCell mono tone={urgencyColor(days)}>
                          {d.isEstimated ? (
                            <Estimated label={`${stamp}, in ${days} day${days === 1 ? "" : "s"}`}>
                              {stamp}
                            </Estimated>
                          ) : (
                            stamp
                          )}
                        </LedgerCell>
                        <LedgerCell>
                          {target ? <b className="font-semibold">{target.company.name}</b> : null}
                          {target ? " " : null}
                          <span className={rowRoleCls}>{d.title}</span>{" "}
                          <SampleBadge isSample={target?.isSample || target?.company.isSample} />
                        </LedgerCell>
                        <LedgerCell mono align="right" muted>
                          {DEADLINE_KIND_LABELS[d.kind]}
                        </LedgerCell>
                      </LedgerRow>
                    );
                  })}
                </LedgerSection>
              </Ledger>
            )}
          </section>
        </div>
      </div>

      {/* 3 · The horizon. Full width, because a horizon that is half a column
             wide is a sparkline — this is the fix for the dead bottom third. */}
      <section className="mt-6">
        <DeadlineTape items={tapeItems} now={nowIso} label="Deadline horizon" />
      </section>

      {/* 4 · What left the register overnight. 24px micro-rows: it is a record
             that something is gone, not a thing to act on. */}
      {recentlyClosed.length > 0 ? (
        <section className="mt-6">
          <SectionRule label="Closed out" right={`LATEST ${recentlyClosed.length}`} />
          <Ledger cols={CLOSED_COLS} minWidth={480} label="Recently closed listings">
            <LedgerSection>
              {recentlyClosed.map((l) => (
                <LedgerMicroRow key={l.id}>
                  <LedgerCell title={`${l.company.name} — ${l.title}`}>
                    <b className="font-semibold">{l.company.name}</b>
                    <span className={rowRoleCls}> — {l.title}</span>{" "}
                    <SampleBadge isSample={l.isSample || l.company.isSample} />
                  </LedgerCell>
                  <LedgerCell mono align="right" muted>
                    {l.closedAt ? `closed ${fmtAgo(l.closedAt)}` : "closed"}
                  </LedgerCell>
                </LedgerMicroRow>
              ))}
            </LedgerSection>
          </Ledger>
        </section>
      ) : null}

      {/* 5 · The map key. The intake report rides the left half; the keycaps on
             the right are a REMINDER of bindings that live on /review — this
             page binds no keys, and a printed keycap must be a real one (D1). */}
      <Footnote
        legend={
          <>
            {intakeReport}
            {legendItems.length > 0 ? " · " : null}
            <Legend items={legendItems} />
          </>
        }
        keys={
          <Keys
            label="ON REVIEW"
            items={[
              { key: "J", label: "next" },
              { key: "K", label: "prev" },
              { key: "A", label: "accept" },
              { key: "D", label: "discard" },
            ]}
          />
        }
      />
    </>
  );
}
