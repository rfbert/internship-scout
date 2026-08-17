import type {
  DecisionState,
  Prisma,
  RoleCategory,
  ScoreBand,
  SponsorshipConfidence,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, SampleBadge, rowRoleCls } from "@/components/ui";
import { PageFrame } from "@/components/register/page-frame";
import { Footnote, Legend, type LegendItem } from "@/components/register/footnote";
import { StampLink } from "@/components/register/stamp";
import {
  Ledger,
  LedgerCell,
  LedgerHead,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { Band, Estimated, Sponsorship } from "@/components/register/notation";
import {
  BAND_LABELS,
  CONFIDENCE_LABELS,
  ROLE_LABELS,
  SPONSORSHIP_LABELS,
  TOKEN_TEXT,
  bandIsStruck,
  fmtAgo,
} from "@/lib/format";
import { ESTIMATED_GLOSS, bandText, sponsorshipText } from "@/lib/notation";
import { readUiPrefs } from "@/server/ui-prefs";
import { fmtDateShortTz } from "@/lib/dates";
import { ARRANGEMENT_LABELS, DECISION_LABELS, decisionTone } from "@/app/review/meta";
import { FilterChips, type OpportunityFilters } from "./filter-chips";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   ACQUISITIONS — `/opportunities` (spec C4)

   Everything the register took in this week, whatever was later decided about
   it. This is the wide-angle twin of `/review`: the same instrument, pointed at
   seven days of intake instead of at the undecided pile — so it wears the same
   ledger, the same notation and the same chips, and a card-per-listing list
   (~140px a record) becomes one 34px ruled line.

   Two debts die here: the four hand-rolled chip rows (now `Chip`/`ChipRow`) and
   the two full-width CJK marks this page used as icons, which were the wrong
   metrics in a Latin mono face — the assessment column prints ASCII `+` and `!`
   in the mono face instead (B5).
   ══════════════════════════════════════════════════════════════════════════ */

/* ── The column budget ─────────────────────────────────────────────────────
   `MIN_WIDTH` is 1340 and the grid spends 114px of it on chrome (10px + 14px
   of row padding, plus nine 10px column gaps), so the ten tracks share 1226px.
   That total is the whole design constraint, and it was being spent badly.

   Every width below was MEASURED in the browser against the widest value the
   column actually holds across the live register, not guessed from the head
   label. What the measurements said:

     Company — Role  needs 674 · had 178   ← the only column that identifies
     Assessment      needs 313 · had 128      the record, and the most starved
     Location        needs 225 · had 104
     Role            needs 139 · had 112
     Score           needs 118 · had 136
     State           needs 118 · had 132
     Sponsorship     needs 100 · had 136
     Found           needs  80 · had  66   ← clipped its own content
     Deadline        needs   7 · had  82      (head label needs 59)
     (actions)       needs 160 · had 152

   At 178px `Quantbot Technologies — Q…` and `Quantbot Technologies — M…` are
   the same string, so two different roles at one company were indistinguishable
   while `DEADLINE` held 82px to print an em dash on all 63 rows.

   Trimming the over-wide fixed tracks to their measured need frees ~90px,
   which is not enough on its own: nine columns plus a readable identity do
   not fit in 1226px. The one that gave way is ASSESSMENT — it is prose, it
   needs 313px to say anything, and at any width this page can afford it was
   showing about fifteen characters of a sentence. It keeps its `+`/`!` mark
   (the fact that the scorer's leading note is a point in favor or a concern)
   in a 44px track, with the full text on the cell and in the row title. No
   fact is lost; a truncated one is traded for a legible one.

   `tests/unit/opportunities-columns.test.ts` re-adds this budget from the
   source and fails if the tracks stop fitting, or if the identifying column
   loses its floor. */
const COLS: LedgerCol[] = [
  { label: "Score", w: "120px", align: "right" },
  // The floor is the point: this column may take the slack, but it may never
  // again be squeezed below a width that shows a role apart from its sibling.
  { label: "Company — Role", w: "minmax(300px,1fr)" },
  { label: "Role", w: "112px" },
  { label: "Sponsorship", w: "104px" },
  { label: "Location", w: "104px" },
  { label: "Deadline", w: "64px" },
  { label: "Found", w: "84px" },
  { label: "Note", w: "44px" },
  { label: "State", w: "124px" },
  { label: "", w: "160px", align: "right" },
];

/** Below this the ledger scrolls inside itself — the page never does. */
// The page gutter leaves ~1350px of content at the 1440px reference width, so
// a wider ledger clips its trailing column with nothing to say more exists.
// Every other ledger sits at or below this; keep it that way.
const MIN_WIDTH = 1340;

/** `decisionTone` still speaks the old `Tone` vocabulary; the cell needs a token. */
const DECISION_COLOR = {
  accent: "blue",
  success: "green",
  warning: "ochre",
  danger: "carmine",
  neutral: "ink-3",
} as const;

function pick<T extends string>(
  value: string | string[] | undefined,
  allowed: Record<T, string>
): T | undefined {
  return typeof value === "string" && value in allowed ? (value as T) : undefined;
}

// Plain data function, not a component: the per-request Date.now() cutoff is
// intentional (the route is force-dynamic) but impure calls can't sit in the
// component render itself.
async function fetchRecentListings(filters: OpportunityFilters) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const where: Prisma.InternshipListingWhereInput = {
    deletedAt: null,
    discoveredAt: { gte: sevenDaysAgo },
    ...(filters.band ? { currentBand: filters.band } : {}),
    ...(filters.role ? { roleCategory: filters.role } : {}),
    ...(filters.confidence ? { currentSponsorshipConfidence: filters.confidence } : {}),
    ...(filters.state ? { decisions: { some: { state: filters.state } } } : {}),
  };

  return prisma.internshipListing.findMany({
    where,
    include: {
      company: true,
      locations: { orderBy: { createdAt: "asc" } },
      compensation: { orderBy: { createdAt: "asc" }, take: 1 },
      decisions: { take: 1 },
      scores: {
        orderBy: { analysisVersion: "desc" },
        take: 1,
        include: { explanations: { orderBy: { rank: "asc" } } },
      },
    },
    orderBy: [{ discoveredAt: "desc" }, { currentScore: { sort: "desc", nulls: "last" } }],
  });
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters: OpportunityFilters = {
    band: pick<ScoreBand>(sp.band, BAND_LABELS),
    role: pick<RoleCategory>(sp.role, ROLE_LABELS),
    confidence: pick<SponsorshipConfidence>(sp.confidence, CONFIDENCE_LABELS),
    state: pick<DecisionState>(sp.state, DECISION_LABELS),
  };

  const { timezone, notation } = await readUiPrefs();

  const listings = await fetchRecentListings(filters);

  const anyFilter = Boolean(
    filters.band || filters.role || filters.confidence || filters.state
  );

  /* The legend names only what is on this screen. In Plain mode a band already
     prints its own word, so a line reading "EXCEPTIONAL exceptional" would be
     noise; the certainty stroke is never self-evident and is always listed. */
  const legendItems: LegendItem[] = [];
  if (notation === "COMPACT") {
    const bands: ScoreBand[] = [];
    for (const l of listings) {
      if (l.currentBand && !bands.includes(l.currentBand)) bands.push(l.currentBand);
    }
    for (const b of bands) {
      legendItems.push({ mark: bandText(b, notation), meaning: BAND_LABELS[b].toLowerCase() });
    }
    const spons = [
      ...new Set(listings.map((l) => l.currentSponsorshipCategory).filter((c) => c != null)),
    ];
    for (const s of spons) {
      legendItems.push({
        mark: sponsorshipText(s, notation),
        meaning: SPONSORSHIP_LABELS[s].toLowerCase(),
      });
    }
  }
  if (listings.some((l) => l.applicationDeadline && l.deadlineIsEstimated)) {
    legendItems.push({ mark: "~", meaning: ESTIMATED_GLOSS });
  }
  if (listings.some((l) => l.scores[0]?.explanations.length)) {
    legendItems.push({ mark: "+", meaning: "strongest point in favor" });
    legendItems.push({ mark: "!", meaning: "the assessment's leading concern" });
  }

  const filterLine = anyFilter
    ? [
        filters.band ? BAND_LABELS[filters.band] : null,
        filters.role ? ROLE_LABELS[filters.role] : null,
        filters.confidence ? CONFIDENCE_LABELS[filters.confidence] : null,
        filters.state ? DECISION_LABELS[filters.state] : null,
      ]
        .filter(Boolean)
        .join(" · ")
        .toUpperCase()
    : "NO FILTER";

  return (
    <>
      <PageFrame
        eyebrow="ACQUISITIONS · LAST 7 DAYS · ALL DECISION STATES"
        title="New Opportunities"
        figures={
          <>
            {listings.length} {listings.length === 1 ? "record" : "records"}
            <br />
            {filterLine}
          </>
        }
      />

      <FilterChips
        filters={filters}
        right={
          <span className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
            {listings.length} shown
          </span>
        }
      />

      {listings.length === 0 ? (
        <Card>
          <EmptyState
            title={
              anyFilter
                ? "No listings match these filters"
                : "Nothing discovered in the last 7 days"
            }
            hint={
              anyFilter
                ? "Try clearing a filter — this view only spans listings first discovered within the last 7 days."
                : "The daily agent adds new findings here after each run. Check Data Sources to confirm sources are enabled, or trigger a manual run from Runs."
            }
          />
        </Card>
      ) : (
        <Ledger cols={COLS} minWidth={MIN_WIDTH} label="Listings discovered in the last 7 days">
          <LedgerHead cols={COLS} />
          <LedgerSection>
            {listings.map((l) => {
              const decision = l.decisions[0] ?? null;
              const score = l.scores[0] ?? null;
              const location =
                l.locations.find((loc) => loc.isPrimary)?.rawText ??
                l.locations[0]?.rawText ??
                null;
              const topPositive =
                score?.explanations.find((e) => e.kind === "POSITIVE")?.text ?? null;
              const topConcern =
                score?.explanations.find((e) => e.kind === "CONCERN")?.text ?? null;
              const compensation = l.compensation[0]?.rawText ?? null;

              // Everything the card printed on its second line and no column
              // could take — the arrangement and the posted pay — rides the
              // row's own title, so the conversion loses no fact.
              const rowTitle = [
                `${l.company.name} — ${l.title}`,
                ARRANGEMENT_LABELS[l.workArrangement],
                compensation,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <LedgerRow
                  key={l.id}
                  struck={bandIsStruck(l.currentBand)}
                  title={rowTitle}
                >
                  <LedgerCell align="right">
                    <Band band={l.currentBand} score={l.currentScore} />
                  </LedgerCell>

                  <LedgerCell title={`${l.company.name} — ${l.title}`}>
                    <span data-row-title className="text-[13px]">
                      <span className="font-semibold">{l.company.name}</span>
                      <span aria-hidden className="mx-1 text-ink-3">
                        —
                      </span>
                      <span className={rowRoleCls}>{l.title}</span>
                    </span>
                    {l.isSample || l.company.isSample ? (
                      <span className="ml-1.5">
                        <SampleBadge isSample />
                      </span>
                    ) : null}
                  </LedgerCell>

                  <LedgerCell mono muted title={ROLE_LABELS[l.roleCategory]}>
                    {ROLE_LABELS[l.roleCategory].toUpperCase()}
                  </LedgerCell>

                  <LedgerCell>
                    {l.currentSponsorshipCategory ? (
                      <Sponsorship
                        category={l.currentSponsorshipCategory}
                        confidence={l.currentSponsorshipConfidence}
                      />
                    ) : (
                      <span
                        title="Sponsorship has not been analyzed for this listing yet."
                        className={`font-mono text-[10.5px] font-medium ${TOKEN_TEXT.ochre}`}
                      >
                        NOT ANALYZED
                      </span>
                    )}
                  </LedgerCell>

                  <LedgerCell mono title={location ?? "Location unknown"}>
                    {location ? location.toUpperCase() : <span className="text-ink-3">—</span>}
                  </LedgerCell>

                  <LedgerCell mono>
                    {l.applicationDeadline ? (
                      l.deadlineIsEstimated ? (
                        <Estimated>
                          {fmtDateShortTz(l.applicationDeadline, timezone).toUpperCase()}
                        </Estimated>
                      ) : (
                        fmtDateShortTz(l.applicationDeadline, timezone).toUpperCase()
                      )
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </LedgerCell>

                  <LedgerCell mono muted>
                    {fmtAgo(l.discoveredAt).toUpperCase()}
                  </LedgerCell>

                  <Assessment positive={topPositive} concern={topConcern} />

                  <LedgerCell>
                    <span
                      className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
                        TOKEN_TEXT[DECISION_COLOR[decisionTone(decision?.state)]]
                      }`}
                    >
                      {decision ? DECISION_LABELS[decision.state] : "Not queued"}
                    </span>
                  </LedgerCell>

                  <LedgerCell align="right" className="overflow-visible">
                    <span className="inline-flex items-center gap-1.5">
                      {decision?.state === "PENDING_REVIEW" ? (
                        <StampLink href={`/review?listing=${l.id}`} title="Open in the review queue">
                          Review
                        </StampLink>
                      ) : null}
                      {l.postingUrl ? (
                        <StampLink href={l.postingUrl} external title="Open the original posting">
                          Posting
                        </StampLink>
                      ) : null}
                    </span>
                  </LedgerCell>
                </LedgerRow>
              );
            })}
          </LedgerSection>
        </Ledger>
      )}

      <Footnote
        legend={
          legendItems.length > 0 ? (
            <Legend items={legendItems} />
          ) : (
            <span>Everything first seen in the last seven days, decided or not.</span>
          )
        }
        keys={<span>Open a record to review it · keyboard shortcuts live on Review</span>}
      />
    </>
  );
}

/**
 * The assessment mark. The scorer's strongest point in favor, else its leading
 * concern. `+` and `!` are the ASCII mono marks that replaced this page's two
 * full-width CJK icons (B5): a Latin mono face has no business carrying
 * CJK-width glyphs, and they broke the column rhythm.
 *
 * The sentence itself is on the cell's `title` and, spelled out, in the
 * screen-reader text — never on the row, where it needed 313px to be read and
 * had 128 (see the column budget above). What survives on screen is the one
 * bit that fits: whether the scorer's leading note is FOR the listing or
 * against it. The footnote legend names both marks whenever either is on the
 * page.
 */
function Assessment({
  positive,
  concern,
}: {
  positive: string | null;
  concern: string | null;
}) {
  if (!positive && !concern) {
    return (
      <LedgerCell mono muted title="The scorer left no note on this listing.">
        —
      </LedgerCell>
    );
  }

  const mark = positive ? "+" : "!";
  const color = positive ? TOKEN_TEXT.green : TOKEN_TEXT.ochre;
  const full = [positive ? `+ ${positive}` : null, concern ? `! ${concern}` : null]
    .filter(Boolean)
    .join("\n");

  return (
    <LedgerCell title={full}>
      <span aria-hidden className={`font-mono text-[12.5px] font-semibold ${color}`}>
        {mark}
      </span>
      <span className="sr-only">
        {positive ? `Point in favor: ${positive}. ` : ""}
        {concern ? `Concern: ${concern}.` : ""}
      </span>
    </LedgerCell>
  );
}
