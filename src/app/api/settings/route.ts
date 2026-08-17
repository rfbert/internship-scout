import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, currentUser, handler, ok, parseBody } from "@/server/api-helpers";
import { DEFAULT_WEIGHTS } from "@/lib/constants";
import { settingsBodySchema, validateSettingsSemantics } from "./validation";

/** "2028-06-15" → UTC-midnight Date, matching how the gates read it (getUTC*). */
const parseGradDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const PATCH = handler(async (req: Request) => {
  const body = await parseBody(req, settingsBodySchema);
  // All validation happens before the first DB round-trip.
  const semanticError = validateSettingsSemantics(body);
  if (semanticError) throw new ApiError(semanticError, 422);

  const user = await currentUser();

  const data: Prisma.UserPreferenceUncheckedUpdateInput = {};
  if (body.scoringWeights !== undefined) {
    data.scoringWeights = body.scoringWeights as Prisma.InputJsonValue;
  }
  if (body.reviewThresholdBand !== undefined) data.reviewThresholdBand = body.reviewThresholdBand;
  if (body.notationMode !== undefined) data.notationMode = body.notationMode;
  if (body.emailEnabled !== undefined) data.emailEnabled = body.emailEnabled;
  if (body.emailOnEmptyRuns !== undefined) data.emailOnEmptyRuns = body.emailOnEmptyRuns;
  if (body.emailTo !== undefined) data.emailTo = body.emailTo;
  if (body.preferredArrangement !== undefined) data.preferredArrangement = body.preferredArrangement;
  if (body.timezone !== undefined) data.timezone = body.timezone;
  if (body.graduationDate !== undefined) {
    data.graduationDate = body.graduationDate === null ? null : parseGradDate(body.graduationDate);
  }
  if (body.targetSeason !== undefined) data.targetSeason = body.targetSeason;
  if (body.sponsorshipRequired !== undefined) data.sponsorshipRequired = body.sponsorshipRequired;
  if (body.roleAlignmentScores !== undefined) {
    data.roleAlignmentScores =
      body.roleAlignmentScores === null
        ? Prisma.DbNull
        : (body.roleAlignmentScores as Prisma.InputJsonValue);
  }
  if (body.bandThresholds !== undefined) {
    data.bandThresholds =
      body.bandThresholds === null
        ? Prisma.DbNull
        : (body.bandThresholds as Prisma.InputJsonValue);
  }

  const updated = await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: data,
    create: {
      userId: user.id,
      scoringWeights: (body.scoringWeights ?? DEFAULT_WEIGHTS) as Prisma.InputJsonValue,
      ...(body.reviewThresholdBand ? { reviewThresholdBand: body.reviewThresholdBand } : {}),
      ...(body.notationMode ? { notationMode: body.notationMode } : {}),
      ...(body.emailEnabled !== undefined ? { emailEnabled: body.emailEnabled } : {}),
      ...(body.emailOnEmptyRuns !== undefined ? { emailOnEmptyRuns: body.emailOnEmptyRuns } : {}),
      ...(body.emailTo !== undefined ? { emailTo: body.emailTo } : {}),
      ...(body.preferredArrangement ? { preferredArrangement: body.preferredArrangement } : {}),
      ...(body.timezone ? { timezone: body.timezone } : {}),
      ...(body.graduationDate ? { graduationDate: parseGradDate(body.graduationDate) } : {}),
      ...(body.targetSeason ? { targetSeason: body.targetSeason } : {}),
      ...(typeof body.sponsorshipRequired === "boolean"
        ? { sponsorshipRequired: body.sponsorshipRequired }
        : {}),
      ...(body.roleAlignmentScores
        ? { roleAlignmentScores: body.roleAlignmentScores as Prisma.InputJsonValue }
        : {}),
      ...(body.bandThresholds
        ? { bandThresholds: body.bandThresholds as Prisma.InputJsonValue }
        : {}),
    },
  });

  return ok(updated);
});
