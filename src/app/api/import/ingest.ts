import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/server/api-helpers";
import { CURRENT_ANALYSIS_VERSION, DEFAULT_WEIGHTS, SEASON } from "@/lib/constants";
import type { ScoreComponent } from "@/lib/constants";
import { buildDedupeKey, extractAtsJobId } from "@/lib/normalize";
import type { RawPosting } from "@/lib/types";
import { keywordRelevance, normalizePosting } from "@/agent/normalize";
import { evaluateEligibility } from "@/server/eligibility";
import { assessSponsorshipRules } from "@/server/sponsorship";
import {
  buildWeightsSnapshot,
  resolveScoringKnobs,
  scoreListing,
  type ScoringInputWithText,
} from "@/server/scoring";
import { classifyRoleRules } from "@/server/classify";
import { findExistingListing } from "@/server/dedup";

export interface ManualPostingInput {
  companyName: string;
  title: string;
  locationRaw?: string;
  postingUrl?: string;
  applyUrl?: string;
  description?: string;
  compensationText?: string;
  deadline?: Date;
  deadlineIsEstimated?: boolean;
  /** Free-form note stored on the listing (or the application when tracked). */
  note?: string;
  /** Skip the review queue: create the tracker Application immediately. */
  track?: boolean;
}

/**
 * Full single-listing ingest for manual imports (URL form / CSV). Reuses the
 * agent's engines (normalize → dedupe → eligibility → sponsorship → score) but
 * with one important difference: manual imports are NEVER auto-rejected. Both
 * eligibility-gate failures (wrong season, non-US, …) and sponsorship
 * hard-rejects only add a warning note — these are the user's own entries.
 *
 * With `track: true` the entry skips the review queue entirely: the decision is
 * created as ACCEPTED and a tracker Application (stage INTERESTED) is created
 * in the same transaction.
 *
 * Throws ApiError(409) when the posting is already tracked.
 */
/**
 * The user wants an already-known listing in their tracker: accept its
 * decision and create the Application, exactly like a review-queue accept —
 * plus the note/deadline they typed. The listing keeps its origin (a scraped
 * listing the user tracks is still scraped; tracked decisions are already
 * safe from auto-archive).
 */
async function adoptExistingListing(
  matchedListingId: string,
  input: ManualPostingInput
): Promise<{ listingId: string; companyId: string; applicationId: string }> {
  const now = new Date();
  const user = await prisma.user.findFirstOrThrow();
  const matched = await prisma.internshipListing.findUniqueOrThrow({
    where: { id: matchedListingId },
  });
  const listing = matched.canonicalId
    ? await prisma.internshipListing.findUniqueOrThrow({ where: { id: matched.canonicalId } })
    : matched;

  const existingApp = await prisma.application.findUnique({
    where: { userId_listingId: { userId: user.id, listingId: listing.id } },
  });
  if (existingApp && !existingApp.deletedAt) {
    throw new ApiError(`Already in your tracker: ${listing.title}`, 409);
  }

  const applicationId = await prisma.$transaction(async (tx) => {
    const existingDecision = await tx.userListingDecision.findUnique({
      where: { userId_listingId: { userId: user.id, listingId: listing.id } },
    });
    const adoptNote = "Adopted into tracker via manual add.";
    await tx.userListingDecision.upsert({
      where: { userId_listingId: { userId: user.id, listingId: listing.id } },
      update: {
        previousState: existingDecision?.state,
        state: "ACCEPTED",
        note: [existingDecision?.note, adoptNote].filter(Boolean).join("\n"),
        decidedAt: now,
      },
      create: {
        userId: user.id,
        listingId: listing.id,
        state: "ACCEPTED",
        note: adoptNote,
        decidedAt: now,
        decisionContentHash: listing.descriptionHash,
      },
    });

    let appId: string;
    if (existingApp) {
      // Soft-deleted earlier — restore rather than violate the unique constraint.
      await tx.application.update({
        where: { id: existingApp.id },
        data: { deletedAt: null, lastActivityAt: now },
      });
      await tx.applicationStatusHistory.create({
        data: { applicationId: existingApp.id, fromStage: existingApp.stage, toStage: existingApp.stage, note: adoptNote },
      });
      appId = existingApp.id;
    } else {
      const app = await tx.application.create({
        data: {
          userId: user.id,
          listingId: listing.id,
          stage: "INTERESTED",
          acceptedAt: now,
          statusHistory: { create: { toStage: "INTERESTED", note: "Added manually to tracker" } },
        },
      });
      appId = app.id;
    }

    if (input.deadline) {
      await tx.internshipListing.update({
        where: { id: listing.id },
        data: {
          applicationDeadline: input.deadline,
          deadlineIsEstimated: input.deadlineIsEstimated ?? false,
        },
      });
    }
    if (input.note) {
      await tx.note.create({
        data: {
          userId: user.id,
          entity: "APPLICATION",
          listingId: listing.id,
          applicationId: appId,
          body: input.note,
        },
      });
    }
    return appId;
  });

  return { listingId: listing.id, companyId: listing.companyId, applicationId };
}

export async function ingestManualPosting(
  input: ManualPostingInput,
  dataSourceKey: "manual:url-import" | "manual:csv-import" = "manual:url-import"
): Promise<{ listingId: string; applicationId?: string }> {
  const now = new Date();

  // URL-less leads still need a unique source URL and a NormalizedPosting URL;
  // use a sentinel that can never collide with (or match) a real posting.
  const hasUrl = Boolean(input.postingUrl);
  const sourceUrl = input.postingUrl ?? `https://manual-lead.internship-scout.invalid/${crypto.randomUUID()}`;

  const raw: RawPosting = {
    title: input.title,
    companyName: input.companyName,
    locations: input.locationRaw ? [input.locationRaw] : [],
    description: input.description,
    postingUrl: sourceUrl,
    applyUrl: input.applyUrl,
    compensationText: input.compensationText,
  };
  const np = normalizePosting(raw);

  // Dedupe against everything already in the database. A hard match on a
  // review-queue import is a duplicate (409). But when the user is adding to
  // their tracker, "the scraper saw it first" must not block them: adopt the
  // existing listing instead — accept its decision and create the Application.
  const match = await findExistingListing(prisma, np);
  if (match && match.kind !== "POSSIBLE") {
    if (input.track) return adoptExistingListing(match.listing.id, input);
    throw new ApiError(`Already tracked: ${match.listing.title}`, 409);
  }

  const user = await prisma.user.findFirstOrThrow();
  const prefs = await prisma.userPreference.findFirst({ where: { userId: user.id } });
  const weights =
    (prefs?.scoringWeights as Record<ScoreComponent, number> | null) ?? DEFAULT_WEIGHTS;
  const knobs = resolveScoringKnobs(prefs);
  const preferredArrangement = prefs?.preferredArrangement ?? "ONSITE";

  const elig = evaluateEligibility(np, {
    sourceImpliesSeason: false,
    prefs: { graduationDate: prefs?.graduationDate, targetSeason: prefs?.targetSeason },
  });

  const company = await prisma.company.upsert({
    where: { normalizedName: np.normalizedCompany },
    update: {},
    create: { name: np.companyName, normalizedName: np.normalizedCompany },
  });
  const historyCount = await prisma.companySponsorshipEvidence.count({
    where: { companyId: company.id },
  });

  const fullText = [np.title, np.description ?? ""].join("\n");
  const sponsorship = assessSponsorshipRules({
    text: fullText,
    markers: np.markers,
    companyHasHistory: historyCount > 0,
  });

  const roleCategory = classifyRoleRules(np.title, np.description);

  const scoringInput: ScoringInputWithText = {
    roleCategory,
    sponsorship,
    eligibility: elig,
    companyHasSponsorshipHistory: historyCount > 0,
    companyPriorityScore: company.priorityScore,
    companyStage: company.stage,
    compensation: np.compensation,
    workArrangement: np.workArrangement,
    preferredArrangement,
    postedAt: np.postedAt ?? null,
    applicationDeadline: input.deadline ?? null,
    descriptionLength: np.description?.length ?? 0,
    description: np.description,
    now,
  };
  const score = scoreListing(scoringInput, weights, knobs);
  const rel = keywordRelevance(fullText);

  const dataSource = await prisma.dataSource.findUniqueOrThrow({
    where: { key: dataSourceKey },
  });

  const dedupeKey =
    match?.kind === "POSSIBLE"
      ? null
      : buildDedupeKey({
          normalizedCompany: np.normalizedCompany,
          normalizedTitle: np.normalizedTitle,
          season: SEASON,
          primaryLocation: np.locations[0]?.rawText,
        });

  // Decision: the user's own entries are NEVER auto-rejected. Sponsorship
  // hard-rejects and eligibility-gate failures both downgrade to warnings.
  const state: "PENDING_REVIEW" | "ACCEPTED" = input.track ? "ACCEPTED" : "PENDING_REVIEW";
  const noteLines: string[] = [`Imported manually (${dataSource.name}).`];
  if (sponsorship.hardReject) {
    noteLines.push(
      `Warning: sponsorship rules flagged this as ${sponsorship.category} — kept because manual entries are never auto-rejected. ${sponsorship.explanation}`
    );
  } else if (!elig.eligible) {
    const gateNotes = elig.notes.filter((n) => /rejected/i.test(n));
    noteLines.push(
      `Warning: automated checks flagged ${elig.rejectReason ?? "an eligibility concern"} — kept for review because manual imports are never auto-dropped.${gateNotes.length > 0 ? ` ${gateNotes.join(" ")}` : ""}`
    );
  }
  if (match?.kind === "POSSIBLE") {
    noteLines.push(
      `Possible duplicate of existing listing "${match.listing.title}" (title similarity ${(match.similarity * 100).toFixed(0)}%) — verify before applying twice.`
    );
  }

  try {
    const listing = await prisma.$transaction(async (tx) => {
      const l = await tx.internshipListing.create({
        data: {
          companyId: company.id,
          title: np.title,
          normalizedTitle: np.normalizedTitle,
          roleCategory,
          season: SEASON,
          seasonEvidence: elig.seasonEvidence ?? null,
          description: np.description,
          descriptionHash: np.descriptionHash,
          status: "ACTIVE",
          workArrangement: np.workArrangement,
          ugEligibility: elig.ugEligibility,
          lastVerifiedAt: now,
          applicationDeadline: input.deadline ?? null,
          deadlineIsEstimated: input.deadline ? (input.deadlineIsEstimated ?? false) : false,
          postingUrl: hasUrl ? np.postingUrl : null,
          applyUrl: np.applyUrl,
          origin: "MANUAL",
          workAuthLanguage: sponsorship.matchedText.join(" | ") || null,
          sponsorshipLanguage: sponsorship.matchedText.join(" | ") || null,
          currentSponsorshipCategory: sponsorship.category,
          currentSponsorshipConfidence: sponsorship.confidence,
          currentScore: score.overall,
          currentBand: score.band,
          aiRelevance: rel.ai,
          pmRelevance: rel.pm,
          dedupeKey,
          ...(match?.kind === "POSSIBLE"
            ? { duplicateGroupId: match.listing.duplicateGroupId ?? match.listing.id }
            : {}),
          locations: {
            create: np.locations.map((loc, i) => ({
              rawText: loc.rawText,
              city: loc.city,
              state: loc.state,
              country: loc.country,
              isRemote: loc.isRemote,
              isPrimary: i === 0,
            })),
          },
          compensation: {
            create: {
              payType: np.compensation.payType,
              minAmount: np.compensation.minAmount,
              maxAmount: np.compensation.maxAmount,
              period: np.compensation.period,
              rawText: np.compensation.rawText,
            },
          },
          sources: {
            create: {
              dataSourceId: dataSource.id,
              kind: dataSource.kind,
              externalId:
                extractAtsJobId(np.postingUrl) ??
                (np.applyUrl ? extractAtsJobId(np.applyUrl) : null),
              url: np.normalizedPostingUrl,
              isCanonical: true,
            },
          },
          ...(np.description
            ? {
                snapshots: {
                  create: {
                    contentHash: np.descriptionHash!,
                    description: np.description,
                    changeNote: "initial capture (manual import)",
                  },
                },
              }
            : {}),
        },
      });

      await tx.listingSponsorshipAssessment.create({
        data: {
          listingId: l.id,
          category: sponsorship.category,
          confidence: sponsorship.confidence,
          cptCompatible: sponsorship.cptCompatible,
          optCompatible: sponsorship.optCompatible,
          stemOptRelevant: sponsorship.stemOptRelevant,
          futureSponsorshipPotential: sponsorship.futureSponsorshipPotential,
          matchedText: sponsorship.matchedText,
          conflictingInfo: sponsorship.conflictingInfo,
          explanation: sponsorship.explanation,
          engine: "rules",
          analysisVersion: CURRENT_ANALYSIS_VERSION,
        },
      });

      const s = await tx.listingScore.create({
        data: {
          listingId: l.id,
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
          analysisVersion: CURRENT_ANALYSIS_VERSION,
        },
      });
      const expl = [
        ...score.positives.map((t, i) => ({ kind: "POSITIVE", text: t, rank: i })),
        ...score.concerns.map((t, i) => ({ kind: "CONCERN", text: t, rank: i })),
        ...score.missing.map((t, i) => ({ kind: "MISSING", text: t, rank: i })),
        { kind: "ACTION", text: score.recommendedAction, rank: 0 },
      ];
      await tx.listingScoreExplanation.createMany({
        data: expl.map((e) => ({ ...e, scoreId: s.id })),
      });

      await tx.userListingDecision.create({
        data: {
          userId: user.id,
          listingId: l.id,
          state,
          note: noteLines.join("\n"),
          decidedAt: input.track ? now : null,
          decisionContentHash: np.descriptionHash,
        },
      });

      let applicationId: string | undefined;
      if (input.track) {
        const app = await tx.application.create({
          data: {
            userId: user.id,
            listingId: l.id,
            stage: "INTERESTED",
            acceptedAt: now,
            statusHistory: {
              create: { toStage: "INTERESTED", note: "Added manually to tracker" },
            },
          },
        });
        applicationId = app.id;
      }

      if (input.note) {
        await tx.note.create({
          data: {
            userId: user.id,
            entity: applicationId ? "APPLICATION" : "LISTING",
            listingId: l.id,
            ...(applicationId ? { applicationId } : {}),
            body: input.note,
          },
        });
      }

      return { l, applicationId };
    });

    return { listingId: listing.l.id, applicationId: listing.applicationId };
  } catch (e) {
    // A concurrent import of the same posting can race past the dedupe check.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError("Already tracked: a duplicate was detected while saving", 409);
    }
    throw e;
  }
}
