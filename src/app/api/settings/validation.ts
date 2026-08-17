import { z } from "zod";
import { BAND_THRESHOLDS, SCORE_COMPONENTS } from "@/lib/constants";
import { ROLE_CATEGORY_VALUES } from "@/server/classify/roles";

const int0to100 = z.number().int().min(0).max(100);

const weightsSchema = z.object({
  careerValue: int0to100,
  sponsorship: int0to100,
  roleAlignment: int0to100,
  companyQuality: int0to100,
  ugEligibility: int0to100,
  compensation: int0to100,
  locationFit: int0to100,
  freshness: int0to100,
});

/**
 * Any "TERM_YYYY" cycle the season-pattern generator accepts
 * (constants.makeSeasonPatterns). Unknown shapes would silently fall back to
 * the app default there — reject them at the write instead.
 */
export const TARGET_SEASON_RX = /^(SPRING|SUMMER|FALL|WINTER)_20\d{2}$/;

/**
 * Full role-priority record: every category present, ints 0–100, no strays.
 * The scorer merges partial stored records over the defaults, but the write
 * path demands the complete set so what is stored is exactly what applies.
 */
const roleAlignmentSchema = z.strictObject(
  Object.fromEntries(ROLE_CATEGORY_VALUES.map((c) => [c, int0to100])) as Record<
    (typeof ROLE_CATEGORY_VALUES)[number],
    typeof int0to100
  >
);

/** Canonical band order, highest floor first (LOW_PRIORITY last). */
export const SCORING_BANDS = BAND_THRESHOLDS.map((t) => t.band);

const bandThresholdsSchema = z
  .array(
    z.strictObject({
      band: z.enum(SCORING_BANDS as [string, ...string[]]),
      min: int0to100,
    })
  )
  .length(
    SCORING_BANDS.length,
    `Band thresholds must list all ${SCORING_BANDS.length} scoring bands`
  );

export const settingsBodySchema = z.object({
  scoringWeights: weightsSchema.optional(),
  reviewThresholdBand: z
    .enum(["EXCEPTIONAL", "HIGH_PRIORITY", "STRONG", "WORTH_REVIEWING", "REACH", "LOW_PRIORITY"])
    .optional(),
  // Notation grammar (A5). No cross-field rule, so validateSettingsSemantics
  // stays untouched — the enum is the whole contract.
  notationMode: z.enum(["PLAIN", "COMPACT"]).optional(),
  emailEnabled: z.boolean().optional(),
  emailOnEmptyRuns: z.boolean().optional(),
  emailTo: z.email().optional(),
  preferredArrangement: z.enum(["ONSITE", "HYBRID", "REMOTE", "UNKNOWN"]).optional(),
  timezone: z.string().min(1).max(100).optional(),
  // New parameter knobs. null = clear the override and use the app default.
  graduationDate: z.iso.date().nullable().optional(),
  targetSeason: z
    .string()
    .regex(TARGET_SEASON_RX, 'Target season must look like "SUMMER_2027" (SPRING/SUMMER/FALL/WINTER)')
    .nullable()
    .optional(),
  sponsorshipRequired: z.boolean().nullable().optional(),
  roleAlignmentScores: roleAlignmentSchema.nullable().optional(),
  bandThresholds: bandThresholdsSchema.nullable().optional(),
});

export type SettingsBody = z.infer<typeof settingsBodySchema>;

/**
 * Cross-field rules the shape schema cannot express. Returns a human-readable
 * error, or null when the body is valid. Pure — unit-testable without a DB.
 */
export function validateSettingsSemantics(body: SettingsBody): string | null {
  if (body.scoringWeights) {
    const w = body.scoringWeights;
    const sum = SCORE_COMPONENTS.reduce((acc, c) => acc + w[c], 0);
    if (sum !== 100) {
      return `Scoring weights must sum to exactly 100 — the values provided sum to ${sum}`;
    }
  }

  if (body.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
    } catch {
      return `Unknown timezone "${body.timezone}" — use an IANA name like "America/Los_Angeles"`;
    }
  }

  if (body.bandThresholds) {
    const byBand = new Map(body.bandThresholds.map((t) => [t.band, t.min]));
    if (byBand.size !== SCORING_BANDS.length) {
      return "Band thresholds must list each scoring band exactly once";
    }
    // LOW_PRIORITY is the fall-through floor in scoring — any other minimum
    // would be stored but never honored, so refuse to store one.
    if (byBand.get("LOW_PRIORITY") !== 0) {
      return "LOW_PRIORITY is the floor band — its minimum must stay 0";
    }
    for (let i = 1; i < SCORING_BANDS.length; i++) {
      const prev = SCORING_BANDS[i - 1];
      const curr = SCORING_BANDS[i];
      if ((byBand.get(curr) as number) >= (byBand.get(prev) as number)) {
        return `Band thresholds must be strictly descending — ${curr} (${byBand.get(curr)}) must be below ${prev} (${byBand.get(prev)})`;
      }
    }
  }

  return null;
}
