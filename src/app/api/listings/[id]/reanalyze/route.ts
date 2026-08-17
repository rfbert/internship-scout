import { prisma } from "@/lib/prisma";
import { ApiError, currentUser, fail, handler, ok } from "@/server/api-helpers";
import { CURRENT_ANALYSIS_VERSION, DEFAULT_WEIGHTS } from "@/lib/constants";
import type { ScoreComponent } from "@/lib/constants";
import { normalizeUrl } from "@/lib/normalize";
import type { NormalizedPosting } from "@/lib/types";
import { evaluateEligibility, seasonEvidenceImpliesSource } from "@/server/eligibility";
import {
  assessSponsorshipRules,
  explanationWithWarnings,
  reconstructMarkersFromQuotes,
} from "@/server/sponsorship";
import {
  buildWeightsSnapshot,
  resolveScoringKnobs,
  scoreListing,
  type ScoringInputWithText,
} from "@/server/scoring";
import { classifyRoleRules } from "@/server/classify";
import { Prisma } from "@prisma/client";

export const POST = handler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const user = await currentUser();

    const listing = await prisma.internshipListing.findUnique({
      where: { id },
      include: {
        company: true,
        locations: { orderBy: { createdAt: "asc" } },
        compensation: { orderBy: { createdAt: "asc" }, take: 1 },
        assessments: { orderBy: { analysisVersion: "desc" }, take: 1 },
      },
    });
    if (!listing) throw new ApiError("Listing not found", 404);

    try {
      const comp = listing.compensation[0];

      // Rebuild a NormalizedPosting from stored fields so the deterministic
      // engines can re-run over exactly what we know today.
      const np: NormalizedPosting = {
        title: listing.title,
        normalizedTitle: listing.normalizedTitle,
        companyName: listing.company.name,
        normalizedCompany: listing.company.normalizedName,
        companyWebsite: listing.company.website ?? undefined,
        locations: listing.locations.map((l) => ({
          rawText: l.rawText,
          city: l.city ?? undefined,
          state: l.state ?? undefined,
          country: l.country,
          isRemote: l.isRemote,
        })),
        workArrangement: listing.workArrangement,
        description: listing.description ?? undefined,
        descriptionHash: listing.descriptionHash ?? undefined,
        postingUrl: listing.postingUrl ?? "",
        normalizedPostingUrl: listing.postingUrl ? normalizeUrl(listing.postingUrl) : "",
        applyUrl: listing.applyUrl ?? undefined,
        postedAt: listing.postedAt ?? undefined,
        compensation: comp
          ? {
              payType: comp.payType,
              minAmount: comp.minAmount == null ? undefined : Number(comp.minAmount),
              maxAmount: comp.maxAmount == null ? undefined : Number(comp.maxAmount),
              period: (comp.period as "hour" | "month" | "total" | null) ?? undefined,
              rawText: comp.rawText ?? undefined,
            }
          : { payType: "UNKNOWN" },
        markers: { closed: listing.status === "CLOSED" ? true : undefined },
      };

      const prefs = await prisma.userPreference.findFirst({ where: { userId: user.id } });
      const weights =
        (prefs?.scoringWeights as Record<ScoreComponent, number> | null) ?? DEFAULT_WEIGHTS;
      const knobs = resolveScoringKnobs(prefs);

      // season is stamped SUMMER_2027 on every ingested row, so it cannot tell
      // a source-implied season from an explicit one — the stored seasonEvidence
      // sentinel can. Without this, re-analysis silently upgraded every
      // source-inferred season to EXPLICIT.
      const sourceImpliesSeason = seasonEvidenceImpliesSource(listing.seasonEvidence);
      const elig = evaluateEligibility(np, {
        sourceImpliesSeason,
        prefs: { graduationDate: prefs?.graduationDate, targetSeason: prefs?.targetSeason },
      });

      const historyCount = await prisma.companySponsorshipEvidence.count({
        where: { companyId: listing.companyId },
      });
      // Carry the aggregator 🇺🇸/🛂 markers forward. Their only record is the
      // emoji quote in the previous assessment's matchedText — dropping them
      // here would erase the marker for every future rescore as well.
      const prevQuotes: string[] = Array.isArray(listing.assessments[0]?.matchedText)
        ? (listing.assessments[0].matchedText as string[])
        : [];
      const markers = reconstructMarkersFromQuotes(prevQuotes);
      const fullText = [np.title, np.description ?? ""].join("\n");
      const rulesVerdict = assessSponsorshipRules({
        text: fullText,
        markers,
        companyHasHistory: historyCount > 0,
      });
      // The deterministic rules are the whole verdict here. They hold sole
      // authority over the hard gates (citizenship, clearance, "no
      // sponsorship"), which is why a rescore can never soften one.
      const sponsorship = rulesVerdict;

      // The same classifier the import path calls, not a second inline copy:
      // one rule, one answer, whether a listing is categorised on the way in
      // or rescored later. Divergent copies of this rule are how a rescore
      // used to overwrite the category and silently re-rank the whole queue.
      const roleCategory = classifyRoleRules(np.title, np.description);

      const now = new Date();
      // ScoringInputWithText, not ScoringInput: the bare annotation silently
      // excluded `description`, starving careerValue of its keyword signals.
      const scoringInput: ScoringInputWithText = {
        roleCategory,
        sponsorship,
        eligibility: elig,
        companyHasSponsorshipHistory: historyCount > 0,
        companyPriorityScore: listing.company.priorityScore,
        companyStage: listing.company.stage,
        compensation: np.compensation,
        workArrangement: np.workArrangement,
        preferredArrangement: prefs?.preferredArrangement ?? "ONSITE",
        postedAt: np.postedAt ?? null,
        applicationDeadline: listing.applicationDeadline,
        descriptionLength: np.description?.length ?? 0,
        description: np.description ?? null,
        now,
      };
      const score = scoreListing(scoringInput, weights, knobs);

      // Write at the CURRENT analysis version (upsert, refreshing in place).
      // A max+1 version here used to leapfrog CURRENT_ANALYSIS_VERSION, which
      // exempted the listing from the next global rescore.
      const nextVersion = CURRENT_ANALYSIS_VERSION;

      const result = await prisma.$transaction(async (tx) => {
        const assessmentData = {
          category: sponsorship.category,
          confidence: sponsorship.confidence,
          cptCompatible: sponsorship.cptCompatible,
          optCompatible: sponsorship.optCompatible,
          stemOptRelevant: sponsorship.stemOptRelevant,
          futureSponsorshipPotential: sponsorship.futureSponsorshipPotential,
          matchedText: sponsorship.matchedText,
          conflictingInfo: sponsorship.conflictingInfo,
          explanation: explanationWithWarnings(sponsorship),
          engine: "rules",
          model: null,
          promptVersion: null,
        };
        const assessment = await tx.listingSponsorshipAssessment.upsert({
          where: { listingId_analysisVersion: { listingId: id, analysisVersion: nextVersion } },
          update: assessmentData,
          create: { listingId: id, analysisVersion: nextVersion, ...assessmentData },
        });

        const scoreData = {
          overall: score.overall,
          band: score.band,
          careerValue: score.components.careerValue,
          sponsorship: score.components.sponsorship,
          roleAlignment: score.components.roleAlignment,
          companyQuality: score.components.companyQuality,
          ugEligibility: score.components.ugEligibility,
          compensation: score.components.compensation,
          locationFit: score.components.locationFit,
          freshness: score.components.freshness,
          weightsSnapshot: buildWeightsSnapshot(weights, knobs) as Prisma.InputJsonValue,
          recommendedAction: score.recommendedAction,
          engine: score.engine,
          model: score.model,
          promptVersion: score.promptVersion,
        };
        const scoreRow = await tx.listingScore.upsert({
          where: { listingId_analysisVersion: { listingId: id, analysisVersion: nextVersion } },
          update: scoreData,
          create: { listingId: id, analysisVersion: nextVersion, ...scoreData },
        });
        // A refreshed score would otherwise stack a second copy of every line.
        await tx.listingScoreExplanation.deleteMany({ where: { scoreId: scoreRow.id } });

        const explanations = [
          ...score.positives.map((t, i) => ({ kind: "POSITIVE", text: t, rank: i })),
          ...score.concerns.map((t, i) => ({ kind: "CONCERN", text: t, rank: i })),
          ...score.missing.map((t, i) => ({ kind: "MISSING", text: t, rank: i })),
          { kind: "ACTION", text: score.recommendedAction, rank: 0 },
        ];
        await tx.listingScoreExplanation.createMany({
          data: explanations.map((e) => ({ ...e, scoreId: scoreRow.id })),
        });

        await tx.internshipListing.update({
          where: { id },
          data: {
            roleCategory,
            ugEligibility: elig.ugEligibility,
            currentSponsorshipCategory: sponsorship.category,
            currentSponsorshipConfidence: sponsorship.confidence,
            currentScore: score.overall,
            currentBand: score.band,
            workAuthLanguage: sponsorship.matchedText.join(" | ") || null,
            sponsorshipLanguage: sponsorship.matchedText.join(" | ") || null,
          },
        });

        return { assessment, score: scoreRow };
      });

      return ok({
        analysisVersion: nextVersion,
        overall: score.overall,
        band: score.band,
        sponsorshipCategory: sponsorship.category,
        sponsorshipConfidence: sponsorship.confidence,
        roleCategory,
        assessmentId: result.assessment.id,
        scoreId: result.score.id,
      });
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const message = e instanceof Error ? e.message : "Re-analysis failed";
      return fail(message, 500);
    }
  }
);
