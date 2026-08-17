import { prisma } from "@/lib/prisma";
import { readUiPrefs } from "@/server/ui-prefs";
import { Card, EmptyState } from "@/components/ui";
import { PageFrame } from "@/components/register/page-frame";
import { Footnote, Keys } from "@/components/register/footnote";
import { adjustmentLabelFor, readSnapshotWeights } from "@/lib/scoring-display";
import { ReviewList } from "./review-list";
import { DEFAULT_REVIEW_SORT, REVIEW_KEYS, isReviewSort, type ReviewSort } from "./meta";
import { COMPARATORS } from "./order";
import type { ReviewRow, ReviewScoreDetail } from "./types";

export const dynamic = "force-dynamic";

const DESCRIPTION_LIMIT = 1200;

/* ── The docket's order ────────────────────────────────────────────────────
   The vocabulary lives in `./meta` (client-safe) and the comparators live in
   `./order`, which BOTH sides import: the server sorts the pending rows it
   fetched, and the docket re-sorts the wider sitting (pending rows plus the
   records this sitting has already decided, which have left this query). One
   definition means the two cannot drift.

   No query changed (D4): `rows` is already fully materialised below, and this
   is a comparator over an array that is in hand. Band grouping stays the
   docket's primary structure — this orders rows WITHIN each band. */

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const highlightId = typeof sp.listing === "string" ? sp.listing : undefined;
  const sort: ReviewSort = isReviewSort(sp.sort) ? sp.sort : DEFAULT_REVIEW_SORT;

  const user = await prisma.user.findFirst();
  const { timezone } = await readUiPrefs();
  const decisions = user
    ? await prisma.userListingDecision.findMany({
        where: { userId: user.id, state: "PENDING_REVIEW", listing: { deletedAt: null } },
        include: {
          listing: {
            include: {
              company: true,
              locations: { orderBy: { createdAt: "asc" } },
              compensation: { orderBy: { createdAt: "asc" }, take: 1 },
              scores: {
                orderBy: { analysisVersion: "desc" },
                take: 1,
                include: { explanations: { orderBy: { rank: "asc" } } },
              },
              assessments: { orderBy: { analysisVersion: "desc" }, take: 1 },
              sources: { where: { isCanonical: true }, take: 1 },
            },
          },
        },
        orderBy: { queuedAt: "asc" },
      })
    : [];

  const rows: ReviewRow[] = decisions
    .map((d): ReviewRow => {
      const l = d.listing;
      const score = l.scores[0] ?? null;
      const assessment = l.assessments[0] ?? null;
      const primaryLocation =
        l.locations.find((loc) => loc.isPrimary) ?? l.locations[0] ?? null;
      const description = l.description
        ? l.description.length > DESCRIPTION_LIMIT
          ? `${l.description.slice(0, DESCRIPTION_LIMIT)}…`
          : l.description
        : null;
      const matchedText = Array.isArray(assessment?.matchedText)
        ? (assessment.matchedText as unknown[]).filter(
            (q): q is string => typeof q === "string"
          )
        : [];

      // The assessment ledger's arithmetic (A1). Every column below already
      // came back with `l.scores[0]` — this is the same row, mapped further.
      // No new query, no new round-trip.
      const scoreDetail: ReviewScoreDetail | null = score
        ? {
            components: {
              careerValue: score.careerValue,
              sponsorship: score.sponsorship,
              roleAlignment: score.roleAlignment,
              companyQuality: score.companyQuality,
              ugEligibility: score.ugEligibility,
              compensation: score.compensation,
              locationFit: score.locationFit,
              freshness: score.freshness,
            },
            // Never DEFAULT_WEIGHTS: the ledger must show the weights that
            // actually produced this score, snapshot shape and all.
            weights: readSnapshotWeights(score.weightsSnapshot),
            overall: score.overall,
            band: score.band,
            analysisVersion: score.analysisVersion,
            adjustmentLabel: adjustmentLabelFor(score.explanations),
            rationale:
              score.recommendedAction ??
              score.explanations.find((e) => e.kind === "CONCERN")?.text ??
              null,
          }
        : null;

      return {
        decisionId: d.id,
        listingId: l.id,
        queuedAt: d.queuedAt.toISOString(),
        decisionNote: d.note,
        companyName: l.company.name,
        title: l.title,
        isSample: l.isSample || l.company.isSample,
        roleCategory: l.roleCategory,
        location: primaryLocation?.rawText ?? null,
        workArrangement: l.workArrangement,
        compensationText: l.compensation[0]?.rawText ?? null,
        score: l.currentScore,
        band: l.currentBand,
        sponsorshipCategory: l.currentSponsorshipCategory,
        sponsorshipConfidence: l.currentSponsorshipConfidence,
        sourceKind: l.sources[0]?.kind ?? null,
        topPositive:
          score?.explanations.find((e) => e.kind === "POSITIVE")?.text ?? null,
        topConcern:
          score?.explanations.find((e) => e.kind === "CONCERN")?.text ?? null,
        deadline: l.applicationDeadline?.toISOString() ?? null,
        deadlineIsEstimated: l.deadlineIsEstimated,
        postingUrl: l.postingUrl,
        applyUrl: l.applyUrl,
        description,
        explanations:
          score?.explanations.map((e) => ({ kind: e.kind, text: e.text, rank: e.rank })) ??
          [],
        assessment: assessment
          ? {
              explanation: assessment.explanation,
              matchedText,
              conflictingInfo: assessment.conflictingInfo,
              evidenceSource: assessment.evidenceSource,
              retrievedAt: (assessment.evidenceDate ?? assessment.createdAt).toISOString(),
            }
          : null,
        postedAt: l.postedAt?.toISOString() ?? null,
        discoveredAt: l.discoveredAt.toISOString(),
        season: l.season,
        seasonEvidence: l.seasonEvidence,
        ugEligibility: l.ugEligibility,
        scoreDetail,
      };
    })
    .sort(COMPARATORS[sort]);

  if (rows.length === 0) {
    return (
      <div>
        <PageFrame
          eyebrow={`ACCESSIONING · ${eyebrowDate(timezone)}`}
          title="Review Queue"
          figures={<span>NOTHING ON THE DOCKET</span>}
        />
        <Card>
          <EmptyState
            title="The review queue is empty"
            hint="New opportunities land here after each agent run once they pass the eligibility gates and score above your review threshold. Adjust the threshold in Settings, or check New Opportunities for everything found this week."
          />
        </Card>
        <Footnote
          legend={<span>No records on the docket — nothing waiting for a verdict.</span>}
          keys={<Keys label="on a full docket:" items={REVIEW_KEYS} />}
        />
      </div>
    );
  }

  return (
    /* NO `key={sort}` — A RE-SORT MUST NOT START A NEW SITTING.

       It used to. `key={sort}` remounted `ReviewList` on every chip click, and
       the sitting is entirely component-local state: the verdict stamps, the
       bulk selection, an open discard picker and any typed-but-unsaved note all
       died with it. Worse, the decided records had already left `PENDING_REVIEW`
       and so were gone from `rows` too — so after deciding 40 of 133, one click
       on `Deadline` silently returned a 93-row docket reading "0 of 93
       reviewed". A view control that destroys 40 decisions is not a view
       control.

       The remount had a real cause, and the cause is what got fixed instead:
       the sitting's `order` was doing two jobs. It is append-only because
       `Q-04` must stay `Q-04`, and it was ALSO the reading order — so a
       re-sorted `rows` prop changed nothing on screen and only a remount could
       reorder anything. Those two jobs are now separate (see the `Sitting`
       comment in review-list.tsx): `order` numbers the sitting, and the reading
       order is `COMPARATORS[sort]` applied on every render. The chip re-orders
       the docket in place and nothing is lost, so there is no cost to warn
       about and nothing to recover. */
    <ReviewList
      rows={rows}
      highlightId={highlightId}
      timezone={timezone}
      intakeLabel={intakeLabel(rows, timezone)}
      dateLabel={eyebrowDate(timezone)}
      sort={sort}
    />
  );
}

/** `SATURDAY, AUGUST 9` — the sitting's own date, in the user's timezone. */
function eyebrowDate(timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  })
    .format(new Date())
    .toUpperCase();
}

/**
 * The mock's eyebrow reads `INTAKE NO. 128`. There is no run ordinal in
 * anything `/review` loads, and D4 forbids adding a query to fetch one — so the
 * intake is named by its DATE, taken from the newest `queuedAt` already in
 * hand. Same job (which intake is on the table), no new round-trip.
 */
function intakeLabel(rows: ReviewRow[], timeZone: string): string {
  const newest = rows.reduce<string | null>(
    (acc, r) => (acc == null || r.queuedAt > acc ? r.queuedAt : acc),
    null
  );
  if (!newest) return "INTAKE —";
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone,
  }).format(new Date(newest));
  return `INTAKE ${day.toUpperCase()}`;
}
