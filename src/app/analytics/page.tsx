import Link from "next/link";
import type { ApplicationStage, ScoreBand, SourceKind, SponsorshipConfidence } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Figure, FigureStrip, PageFrame } from "@/components/register/page-frame";
import { Footnote } from "@/components/register/footnote";
import { SectionRule } from "@/components/register/rule";
import { Well } from "@/components/register/well";
import { Bars } from "@/components/register/bars";
import { Chip } from "@/components/register/chip";
import {
  Ledger,
  LedgerCell,
  LedgerFullRow,
  LedgerHead,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { Band } from "@/components/register/notation";
import { EmptyState, SampleBadge, rowRoleCls } from "@/components/ui";
import {
  BAND_LABELS,
  CONFIDENCE_LABELS,
  PIP_SPEC,
  STAGE_GROUPS,
  STAGE_LABELS,
  upper,
} from "@/lib/format";
import { BAND_THRESHOLDS } from "@/lib/constants";
import {
  addDaysToDayKey,
  dayKeyTz,
  fmtDateShortTz,
  utcDayStart,
} from "@/lib/dates";
import { readUiPrefs } from "@/server/ui-prefs";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   THE RETURNS — `/analytics` (spec C6)

   Eight `StatTile`s became figure strips, four cards became ruled
   sections, and the two charts moved into instrument wells. Two structural
   debts are paid here rather than restyled around:

     · the bar chart — this page and `/` carried the same nineteen lines
       twice. Both are deleted in favour of `register/bars.tsx`; the
       integration sweep greps for exactly one definition.
     · The ISO-week bucketing was the last SERVER-LOCAL date surface in the
       app. `startOfISOWeek`/`format` from date-fns computed weeks in the
       deployment's zone (UTC), so an application submitted Sunday evening in
       Los Angeles was already counted in Monday's week — a boundary that
       disagreed with every other page. It now buckets on `dayKeyTz` day keys
       in the user's zone, exactly as `/` and `/calendar` do, and the week a
       row lands in is the week its own printed date belongs to.

   The query set is otherwise untouched (D4): same eleven reads, same shapes,
   same order. The two changes forced by the zone rule are the timezone read
   itself and widening the weekly window's lower bound by the ±1-day bracket
   `utcDayStart` documents — SQL cannot express a day key, so the query loads
   a superset and the real call is made in JS below. One later change: the
   "most promising companies" `groupBy` now excludes sample records in its
   `where`, for the reason written at the query.
   ══════════════════════════════════════════════════════════════════════════ */

/** Stages before an application has actually been submitted. */
const PRE_APPLY_STAGES: ApplicationStage[] = ["INTERESTED", "PREPARING", "READY_TO_APPLY"];

/** Stages at-or-beyond APPLIED (used to infer "has applied" for older rows). */
const APPLIED_AND_BEYOND: ApplicationStage[] = [
  "APPLIED",
  "ONLINE_ASSESSMENT",
  "RECRUITER_SCREEN",
  "FIRST_INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "PRODUCT_CASE_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
];

const SCREEN_AND_BEYOND: ApplicationStage[] = [
  "RECRUITER_SCREEN",
  "FIRST_INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "PRODUCT_CASE_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
];

const INTERVIEW_AND_BEYOND: ApplicationStage[] = [
  "FIRST_INTERVIEW",
  "TECHNICAL_INTERVIEW",
  "PRODUCT_CASE_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
];

/** "Strong" bands for source yield — top 4 of the band ladder. */
const TOP_BANDS: ScoreBand[] = ["EXCEPTIONAL", "HIGH_PRIORITY", "STRONG", "WORTH_REVIEWING"];

const CONFIDENCE_ORDER: SponsorshipConfidence[] = [
  "CONFIRMED",
  "HIGH",
  "MODERATE",
  "LOW",
  "UNKNOWN",
  "EXPLICITLY_UNAVAILABLE",
];

// Local label map — SourceKind is not covered by src/lib/format.ts (shared file is frozen).
const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  GITHUB_REPO: "GitHub repo",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  SMARTRECRUITERS: "SmartRecruiters",
  WORKDAY: "Workday",
  COMPANY_PAGE: "Company page",
  URL_IMPORT: "URL import",
  CSV_IMPORT: "CSV import",
  MANUAL: "Manual",
};

const pct = (num: number, den: number): string => (den > 0 ? `${Math.round((num / den) * 100)}%` : "—");

const bandFromScore = (score: number): ScoreBand =>
  BAND_THRESHOLDS.find((t) => score >= t.min)?.band ?? "LOW_PRIORITY";

const DAY_MS = 86_400_000;

/** Monday = 1 … Sunday = 7, computed from the KEY (a floating calendar date). */
const weekdayOf = (key: string) => utcDayStart(key).getUTCDay() || 7;

/** The Monday that opens the ISO week a day key belongs to. */
const weekStartOf = (key: string) => addDaysToDayKey(key, 1 - weekdayOf(key));

/** ISO-8601 week number of a day key — integers at UTC noon, no DST, no drift. */
function isoWeek(dayKey: string): number {
  const dt = utcDayStart(dayKey);
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7)); // the naming Thursday
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  return Math.ceil(((dt.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** `AUG 10` from a day key — a key is a floating date, so it prints in UTC. */
const keyStamp = (key: string) => upper(fmtDateShortTz(utcDayStart(key), "UTC"));

const FUNNEL_COLS: LedgerCol[] = [
  { label: "Stage", w: "minmax(0,1fr)" },
  { label: "Applications", w: "132px", align: "right" },
  // The values are `pct(count, appliedCount)` and `appliedCount` is SUBMITTED —
  // applications with an `appliedAt`, or at a stage past APPLIED. The head said
  // "% of applied" while the section's own right-hand label said "conversion
  // against submitted", so the page disagreed with itself about the
  // denominator of its own funnel.
  { label: "% of submitted", w: "132px", align: "right" },
];

const SOURCE_COLS: LedgerCol[] = [
  { label: "Source", w: "minmax(0,1fr)" },
  { label: "Kind", w: "150px" },
  { label: "Listings", w: "100px", align: "right" },
  { label: "Strong", w: "100px", align: "right" },
  { label: "Yield", w: "92px", align: "right" },
];

/* `Industry` was a 220px track holding an em dash on every row: 2 of the 278
   companies on file carry the field, and neither is in this top eight. A column
   that is empty by construction is not a column — the industry now rides the
   company's own cell, where it prints only when there is something to print. */
const COMPANY_COLS: LedgerCol[] = [
  { label: "Best score", w: "168px", align: "right" },
  { label: "Company", w: "minmax(0,1fr)" },
  { label: "Scored", w: "104px", align: "right" },
];

export default async function AnalyticsPage() {
  const now = new Date();

  // Read before the queries, not alongside them: the weekly window's lower
  // bound is a day-key boundary in the user's zone, and the zone decides where
  // the week starts. This is the one read the conversion adds — being
  // zone-aware is not possible without the zone.
  const { timezone: tz } = await readUiPrefs();

  const todayKey = dayKeyTz(now, tz);
  const thisWeekKey = weekStartOf(todayKey);
  // Eight ISO weeks INCLUDING the current one, so the last bar is this week.
  const firstWeekKey = addDaysToDayKey(thisWeekKey, -7 * 7);
  // Widened by one day at each end of the range's day keys, exactly as `/`
  // does: no IANA offset exceeds ±14h, so this brackets every row whose
  // day-key bucket a raw-instant comparison could get wrong.
  const weeklyRangeStart = utcDayStart(addDaysToDayKey(firstWeekKey, -1));

  /* ELEVEN QUERIES, FOUR CONNECTIONS AT A TIME — same reasoning as `/`.
   *
   * One `Promise.all` of eleven opens eleven connections at once, which is the
   * shape that exhausted the 15-client session pooler and took /sources down
   * (`FATAL: (EMAXCONNSESSION)`). Sequential groups instead: the queries, their
   * arguments and the order of the results are identical, and there are no
   * dependencies between them — only the number in flight changes. */
  const [totalListings, activeListings, archivedCount, stageGroups] = await Promise.all([
    prisma.internshipListing.count({ where: { deletedAt: null } }),
    prisma.internshipListing.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.userListingDecision.count({
      where: { state: { in: ["DISCARDED", "MARKED_INELIGIBLE", "MARKED_DUPLICATE"] } },
    }),
    prisma.application.groupBy({
      by: ["stage"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const [appliedCount, confGroups, sourceTotals, sourceStrong] = await Promise.all([
    prisma.application.count({
      where: {
        deletedAt: null,
        OR: [{ appliedAt: { not: null } }, { stage: { in: APPLIED_AND_BEYOND } }],
      },
    }),
    prisma.internshipListing.groupBy({
      by: ["currentSponsorshipConfidence"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.internshipSource.groupBy({ by: ["dataSourceId"], _count: { _all: true } }),
    prisma.internshipSource.groupBy({
      by: ["dataSourceId"],
      where: { listing: { deletedAt: null, currentBand: { in: TOP_BANDS } } },
      _count: { _all: true },
    }),
  ]);

  const [dataSources, companyGroups, recentApplied] = await Promise.all([
    prisma.dataSource.findMany({ select: { id: true, name: true, kind: true, enabled: true } }),
    prisma.internshipListing.groupBy({
      by: ["companyId"],
      // "Most promising" must not be led by a listing the gates already ruled
      // out — a clearance-blocked role can carry a high raw score. Nor by a
      // seeded demo record: `Acme Intelligence (SAMPLE)` scored 72 and sat
      // fourth, above Microsoft, which is a ranking of the fixtures.
      where: {
        deletedAt: null,
        currentScore: { not: null },
        currentBand: { not: "INELIGIBLE" },
        isSample: false,
        company: { isSample: false },
      },
      _max: { currentScore: true },
      _count: { _all: true },
      orderBy: { _max: { currentScore: "desc" } },
      take: 8,
    }),
    prisma.application.findMany({
      where: { deletedAt: null, appliedAt: { gte: weeklyRangeStart } },
      select: { appliedAt: true },
    }),
  ]);

  const companies = companyGroups.length
    ? await prisma.company.findMany({
        where: { id: { in: companyGroups.map((g) => g.companyId) } },
        select: { id: true, name: true, industry: true, isSample: true },
      })
    : [];
  const companyById = new Map(companies.map((c) => [c.id, c]));

  const countOf = (s: ApplicationStage) => stageGroups.find((g) => g.stage === s)?._count._all ?? 0;
  const sumOf = (stages: ApplicationStage[]) => stages.reduce((n, s) => n + countOf(s), 0);

  const totalApplications = stageGroups.reduce((n, g) => n + g._count._all, 0);
  const rejectedApplications = countOf("REJECTED");
  const respondedCount = sumOf(SCREEN_AND_BEYOND);
  const interviewCount = sumOf(INTERVIEW_AND_BEYOND);
  const offerCount = countOf("OFFER");

  // Sponsorship confidence distribution (null = not analyzed yet). Each series
  // takes the pip color its confidence already carries elsewhere in the app, so
  // the chart and the row marks agree; the label always names the category, so
  // color is never the sole carrier (D3).
  const confCounts = new Map<SponsorshipConfidence | null, number>(
    confGroups.map((g) => [g.currentSponsorshipConfidence, g._count._all] as const)
  );
  const confItems = [
    ...CONFIDENCE_ORDER.map((c) => ({
      label: CONFIDENCE_LABELS[c],
      count: confCounts.get(c) ?? 0,
      tone: PIP_SPEC[c].color,
    })),
    { label: "Not analyzed", count: confCounts.get(null) ?? 0, tone: "ink-3" as const },
  ].filter((i) => i.count > 0);
  const analyzedTotal = confItems.reduce((n, i) => n + i.count, 0);

  // Source yield.
  const totalsBySource = new Map(sourceTotals.map((g) => [g.dataSourceId, g._count._all] as const));
  const strongBySource = new Map(sourceStrong.map((g) => [g.dataSourceId, g._count._all] as const));
  const sourceRows = dataSources
    .map((ds) => ({
      ds,
      total: totalsBySource.get(ds.id) ?? 0,
      strong: strongBySource.get(ds.id) ?? 0,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.strong - a.strong || b.total - a.total);

  // Weekly application activity — eight ISO weeks, bucketed on day keys in the
  // user's zone. `weekStartOf(dayKeyTz(...))` is the week of the day the row
  // PRINTS on, which is the same day every other surface files it under.
  const weekBuckets = Array.from({ length: 8 }, (_, i) => {
    const key = addDaysToDayKey(firstWeekKey, i * 7);
    return {
      key,
      label: `WK ${isoWeek(key)} · ${keyStamp(key)}`,
      count: 0,
      // The current week is still filling; it is short by construction, not by
      // performance, and the tone says so without hiding the bar.
      tone: (key === thisWeekKey ? "ochre" : "blue") as "ochre" | "blue",
    };
  });
  const bucketByKey = new Map(weekBuckets.map((b) => [b.key, b] as const));
  for (const a of recentApplied) {
    if (!a.appliedAt) continue;
    const bucket = bucketByKey.get(weekStartOf(dayKeyTz(a.appliedAt, tz)));
    if (bucket) bucket.count += 1;
  }
  const hasWeeklyActivity = weekBuckets.some((b) => b.count > 0);
  const weeklyTotal = weekBuckets.reduce((n, b) => n + b.count, 0);

  const funnelGroups = STAGE_GROUPS.map((g) => ({
    ...g,
    rows: g.stages.filter((s) => countOf(s) > 0),
    total: g.stages.reduce((n, s) => n + countOf(s), 0),
  })).filter((g) => g.rows.length > 0);

  return (
    <>
      <PageFrame
        eyebrow={`RETURNS ON THE SEARCH · WEEK ${isoWeek(todayKey)} · ${upper(
          fmtDateShortTz(now, tz)
        )}`}
        title="What the search has returned."
        figures={
          <>
            {totalListings} LISTINGS ON FILE · {totalApplications} APPLICATIONS TRACKED
            <br />
            WEEKS COUNTED IN {upper(tz.replace(/_/g, " "))}
          </>
        }
      />

      {/* 1 · The standing figures, in the TWO GROUPS they actually belong to.
             All five used to sit on one strip, and a strip is a claim of
             comparability: `513 LISTINGS · 511 ACTIVE · 88 ARCHIVED` reads as a
             partition, and 511 + 88 = 599 > 513. It was never a partition.
             `activeListings` is the POSTING's status at the employer;
             `archivedCount` counts YOUR decisions on listings, and a listing you
             archived is usually still open at the source. The two answers are
             both right and they are answers to different questions.

             So the strip is split on the unit being counted — listings, then
             applications — and every `sub` now names the basis of its own
             figure rather than leaving the reader to assume a shared one. */}
      <section>
        <SectionRule label="Listings" right="ONE ROW PER LISTING ON FILE" />
        <div className="pt-2">
          <FigureStrip>
            <Figure value={totalListings} label="Listings" sub="All discovered" />
            <Figure value={activeListings} label="Still open" sub="Status at the source" />
            {/* `Archived`, not `Struck out` — the cell links to /archive, and
                the page it lands on is called Archive. STRUCK is the review
                queue's word for a rejection and is left to it. */}
            <Figure
              value={archivedCount}
              label="Archived"
              sub="Your decisions"
              href="/archive"
            />
          </FigureStrip>
        </div>
      </section>

      <section>
        <SectionRule label="Applications" right="ONE ROW PER TRACKED APPLICATION" />
        <div className="pt-2">
          <FigureStrip>
            <Figure
              value={totalApplications}
              label={totalApplications === 1 ? "Application" : "Applications"}
              sub="Tracked, any stage"
              href="/tracker"
            />
            <Figure value={appliedCount} label="Submitted" sub="Of those tracked" />
            <Figure
              value={rejectedApplications}
              label="Rejected"
              sub="Current stage"
              tone={rejectedApplications > 0 ? "carmine" : undefined}
            />
          </FigureStrip>
        </div>
      </section>

      {/* 2 · The funnel, on the five canonical stage groups (A3). The roman
             folio and the group word print together, so the tick is never the
             only thing saying which part of the pipeline a row is in. */}
      <section>
        <SectionRule
          label="Funnel"
          /* The `% of submitted` column head already names the denominator;
             the rule only has to say what the number is. */
          right={`${appliedCount} SUBMITTED`}
        />
        {totalApplications === 0 ? (
          <div className="rounded border border-rule bg-surface">
            <EmptyState
              title="No applications tracked yet"
              hint="Accept opportunities from the review queue to build your funnel."
            />
          </div>
        ) : (
          <>
            {/* ONE table, ONE head. The five stage groups are `SectionRule`s
                INSIDE it — the same grouped-ledger idiom `/review` and
                `/tracker` use. Each group used to open its own `Ledger`, which
                reprinted `STAGE · APPLICATIONS · % OF APPLIED` once per group:
                three column heads in one viewport for one table. */}
            <Ledger cols={FUNNEL_COLS} minWidth={520} label="Applications by stage">
              <LedgerHead cols={FUNNEL_COLS} />
              {funnelGroups.map((g) => (
                <LedgerSection key={g.group}>
                  <LedgerFullRow>
                    <SectionRule
                      label={g.label}
                      roman={g.roman}
                      tick={g.tick}
                      right={`${g.total} ${g.total === 1 ? "APPLICATION" : "APPLICATIONS"}`}
                    />
                  </LedgerFullRow>
                  {g.rows.map((stage) => {
                    const count = countOf(stage);
                    const preApply = PRE_APPLY_STAGES.includes(stage);
                    return (
                      <LedgerRow key={stage} title={STAGE_LABELS[stage]}>
                        <LedgerCell>{STAGE_LABELS[stage]}</LedgerCell>
                        <LedgerCell mono align="right">
                          {count}
                        </LedgerCell>
                        <LedgerCell mono align="right" muted>
                          {preApply ? "—" : pct(count, appliedCount)}
                        </LedgerCell>
                      </LedgerRow>
                    );
                  })}
                </LedgerSection>
              ))}
            </Ledger>
            <p className="mt-1.5 font-mono text-[11px] tracking-[0.04em] text-ink-3">
              Stages with no applications are hidden. Pre-submission stages have no conversion
              figure — they have not been submitted against anything yet.
            </p>
          </>
        )}
      </section>

      {/* 3 · Conversion. Three derived rates, same strip idiom as the figures
             above so the page has one vocabulary for "a number that matters".

             The section head used to read RATES AGAINST SUBMITTED, and the
             middle rate is not: `interviewCount / respondedCount` is measured
             against those who were SCREENED. Each cell now prints its own
             numerator and denominator, so no cell depends on a shared claim
             overhead that is only true of two of the three. */}
      <section className="mt-6">
        <SectionRule label="Conversion" right="EACH RATE NAMES ITS OWN BASE" />
        <div className="pt-2">
          <FigureStrip>
            <Figure
              value={pct(respondedCount, appliedCount)}
              label="Response"
              sub={`Screen or later ÷ ${appliedCount} submitted`}
            />
            <Figure
              value={pct(interviewCount, respondedCount)}
              label="Interview"
              sub={`Interview or later ÷ ${respondedCount} screened`}
            />
            <Figure
              value={pct(offerCount, appliedCount)}
              label="Offer"
              sub={`Offers ÷ ${appliedCount} submitted`}
              tone={offerCount > 0 ? "green" : undefined}
            />
          </FigureStrip>
        </div>
      </section>

      {/* 4 · The instruments. Bars are marks, so they live in a well and take
             the well palette — a chart is never painted in one accent hue.

             The head used to read `ALL LISTINGS · LAST 8 ISO WEEKS`, which is
             one scope belonging to the left panel and another belonging to the
             right one, printed as though both governed both. Each well already
             carries its own scope on its own right-hand label; the head now
             says so instead of pretending to a shared one. */}
      <section className="mt-6">
        <SectionRule label="Distributions" right="EACH PANEL STATES ITS OWN SCOPE" />
        <div className="grid gap-3 pt-2.5 lg:grid-cols-2">
          {confItems.length === 0 ? (
            <div className="rounded border border-rule bg-surface">
              <EmptyState
                title="No listings analyzed yet"
                hint="Sponsorship assessments run as part of the daily agent pipeline."
              />
            </div>
          ) : (
            <Well
              label="Sponsorship confidence"
              right={`${analyzedTotal} LISTINGS`}
            >
              <Bars items={confItems} unit="listings" />
            </Well>
          )}

          {!hasWeeklyActivity ? (
            <div className="rounded border border-rule bg-surface">
              <EmptyState
                title="No applications in the last 8 weeks"
                hint="Submitted applications (with an applied date) chart here week by week."
              />
            </div>
          ) : (
            <Well
              label="Applications per week"
              right={`${weeklyTotal} IN 8 WEEKS · WK ${isoWeek(thisWeekKey)} PARTIAL`}
            >
              <Bars items={weekBuckets} unit="applications" />
            </Well>
          )}
        </div>
      </section>

      {/* 5 · Where the strong listings actually come from. */}
      <section className="mt-6">
        <SectionRule
          label="Source yield"
          right={
            <Link href="/sources" className="text-blue underline-offset-2 hover:underline">
              DATA SOURCES →
            </Link>
          }
        />
        {sourceRows.length === 0 ? (
          <div className="rounded border border-rule bg-surface">
            <EmptyState
              title="No source activity yet"
              hint="Once agent runs collect listings, each data source's yield will be compared here."
            />
          </div>
        ) : (
          <>
            <Ledger cols={SOURCE_COLS} minWidth={760} label="Yield by data source">
              <LedgerHead cols={SOURCE_COLS} />
              <LedgerSection>
                {sourceRows.map(({ ds, total, strong }) => (
                  <LedgerRow
                    key={ds.id}
                    tick={strong > 0 ? "green" : undefined}
                    title={`${ds.name} — ${SOURCE_KIND_LABELS[ds.kind]}`}
                  >
                    <LedgerCell title={ds.name}>
                      <b className="font-semibold">{ds.name}</b>{" "}
                      {!ds.enabled ? <Chip label="Disabled" tick="ink-3" /> : null}
                    </LedgerCell>
                    <LedgerCell mono muted>
                      {SOURCE_KIND_LABELS[ds.kind]}
                    </LedgerCell>
                    <LedgerCell mono align="right">
                      {total}
                    </LedgerCell>
                    <LedgerCell mono align="right">
                      {strong}
                    </LedgerCell>
                    <LedgerCell mono align="right" className="font-semibold">
                      {pct(strong, total)}
                    </LedgerCell>
                  </LedgerRow>
                ))}
              </LedgerSection>
            </Ledger>
            <p className="mt-1.5 font-mono text-[11px] tracking-[0.04em] text-ink-3">
              Yield = listings scored in the top four bands (
              {TOP_BANDS.map((b) => BAND_LABELS[b]).join(", ")}) ÷ all listings from the source.
            </p>
          </>
        )}
      </section>

      {/* 6 · The correspondents worth courting. */}
      <section className="mt-6">
        <SectionRule
          label="Most promising companies"
          right={
            <Link href="/companies" className="text-blue underline-offset-2 hover:underline">
              ALL COMPANIES →
            </Link>
          }
        />
        {companyGroups.length === 0 ? (
          <div className="rounded border border-rule bg-surface">
            <EmptyState
              title="No scored listings yet"
              hint="Companies rank here once their listings have been scored by the pipeline."
            />
          </div>
        ) : (
          <Ledger cols={COMPANY_COLS} minWidth={760} label="Companies by best listing score">
            <LedgerHead cols={COMPANY_COLS} />
            <LedgerSection>
              {companyGroups.map((g) => {
                const c = companyById.get(g.companyId);
                if (!c) return null;
                const score = g._max.currentScore;
                // Derived, not stored: `groupBy` returns the max score, not the
                // row that carries the band. Unchanged from before the
                // conversion — flagged in the report as a data question, not a
                // visual one.
                const band = score != null ? bandFromScore(score) : null;
                return (
                  <LedgerRow key={g.companyId} title={c.name}>
                    <LedgerCell align="right">
                      <Band band={band} score={score} />
                    </LedgerCell>
                    <LedgerCell title={c.industry ? `${c.name} — ${c.industry}` : c.name}>
                      <Link
                        href={`/companies/${c.id}`}
                        className="underline-offset-2 hover:underline"
                        data-row-title
                      >
                        <b className="font-semibold">{c.name}</b>
                      </Link>{" "}
                      <SampleBadge isSample={c.isSample} />
                      {c.industry ? (
                        <span className={`ml-1.5 ${rowRoleCls}`}>{c.industry}</span>
                      ) : null}
                    </LedgerCell>
                    <LedgerCell mono align="right" muted>
                      {g._count._all} scored
                    </LedgerCell>
                  </LedgerRow>
                );
              })}
            </LedgerSection>
          </Ledger>
        )}
      </section>

      <Footnote
        legend={
          <>
            FIGURES ARE LIVE · WEEKS ARE ISO WEEKS IN {upper(tz.replace(/_/g, " "))} · YIELD = TOP
            FOUR BANDS ÷ ALL LISTINGS FROM THE SOURCE
          </>
        }
        keys={null}
      />
    </>
  );
}
