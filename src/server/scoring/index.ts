import type {
  RoleCategory,
  ScoreBand,
  SponsorshipCategory,
  UgEligibility,
} from "@prisma/client";
import type { ScoreResult, ScoringInput } from "@/lib/types";
import {
  ARRANGEMENT_PREFERENCE_SCORES,
  BAND_THRESHOLDS,
  DEFAULT_WEIGHTS,
  ROLE_ALIGNMENT_SCORES,
  SCORE_COMPONENTS,
  SEASON,
} from "@/lib/constants";
import type { ScoreComponent } from "@/lib/constants";

/**
 * ScoringInput plus the optional posting text used by the rules-based
 * career-value heuristic. Plain ScoringInput is assignable — without the
 * text the keyword bonuses simply do not fire.
 */
export type ScoringInputWithText = ScoringInput & { description?: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const HOURS_PER_MONTH = 160;
// Total stipends are assumed to cover a ~12-week program at 40h/week.
const HOURS_PER_PROGRAM = 480;

const clamp = (n: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, n));

// ── User-configurable scoring knobs ──────────────────────────────────────────
// Role-alignment rankings and band thresholds default to the constants but can
// be overridden per user (UserPreference.roleAlignmentScores/bandThresholds).
// Invalid stored shapes fall back to the defaults — a bad Settings write must
// never break the pipeline.

export interface ScoringKnobs {
  roleAlignmentScores: Record<RoleCategory, number>;
  bandThresholds: Array<{ band: ScoreBand; min: number }>;
}

export const DEFAULT_SCORING_KNOBS: ScoringKnobs = {
  roleAlignmentScores: ROLE_ALIGNMENT_SCORES,
  bandThresholds: BAND_THRESHOLDS,
};

const ROLE_CATEGORY_KEYS = new Set(Object.keys(ROLE_ALIGNMENT_SCORES));
const BAND_KEYS = new Set(BAND_THRESHOLDS.map((t) => t.band));

function isScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

/**
 * Validate + resolve the stored per-user knob JSON into effective values.
 * roleAlignmentScores may be partial (merged over the defaults); bandThresholds
 * must be a complete, valid list to take effect (order is normalized).
 */
export function resolveScoringKnobs(
  prefs?: { roleAlignmentScores?: unknown; bandThresholds?: unknown } | null,
): ScoringKnobs {
  let roleAlignmentScores = ROLE_ALIGNMENT_SCORES;
  const rawRoles = prefs?.roleAlignmentScores;
  if (rawRoles && typeof rawRoles === "object" && !Array.isArray(rawRoles)) {
    const overrides: Partial<Record<RoleCategory, number>> = {};
    for (const [key, value] of Object.entries(rawRoles)) {
      if (ROLE_CATEGORY_KEYS.has(key) && isScore(value)) overrides[key as RoleCategory] = value;
    }
    if (Object.keys(overrides).length > 0) {
      roleAlignmentScores = { ...ROLE_ALIGNMENT_SCORES, ...overrides };
    }
  }

  let bandThresholds = BAND_THRESHOLDS;
  const rawBands = prefs?.bandThresholds;
  if (Array.isArray(rawBands) && rawBands.length > 0) {
    const entries = rawBands.filter(
      (e): e is { band: ScoreBand; min: number } =>
        !!e &&
        typeof e === "object" &&
        BAND_KEYS.has((e as { band?: unknown }).band as ScoreBand) &&
        isScore((e as { min?: unknown }).min),
    );
    // Every scoring band must be present exactly once for the ladder to be usable.
    if (
      entries.length === rawBands.length &&
      new Set(entries.map((e) => e.band)).size === BAND_KEYS.size
    ) {
      bandThresholds = [...entries].sort((a, b) => b.min - a.min).map(({ band, min }) => ({ band, min }));
    }
  }

  return { roleAlignmentScores, bandThresholds };
}

/**
 * The JSON persisted in ListingScore.weightsSnapshot: everything that shaped
 * the score. Older rows carry the bare weights record; new rows record the
 * effective knobs alongside.
 */
export function buildWeightsSnapshot(
  weights: Record<ScoreComponent, number>,
  knobs: ScoringKnobs = DEFAULT_SCORING_KNOBS,
): {
  weights: Record<ScoreComponent, number>;
  roleAlignmentScores: Record<RoleCategory, number>;
  bandThresholds: Array<{ band: ScoreBand; min: number }>;
} {
  return {
    weights,
    roleAlignmentScores: knobs.roleAlignmentScores,
    bandThresholds: knobs.bandThresholds,
  };
}

export function validateWeights(w: Record<ScoreComponent, number>): void {
  const missingKeys = SCORE_COMPONENTS.filter(
    (c) => typeof (w as Record<string, unknown>)[c] !== "number",
  );
  if (missingKeys.length > 0) {
    throw new Error(`Scoring weights missing component(s): ${missingKeys.join(", ")}`);
  }
  for (const c of SCORE_COMPONENTS) {
    const v = w[c];
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      throw new Error(`Scoring weight for ${c} must be between 0 and 100 (got ${v})`);
    }
  }
  const sum = SCORE_COMPONENTS.reduce((acc, c) => acc + w[c], 0);
  if (sum !== 100) {
    throw new Error(`Scoring weights must sum to 100 (got ${sum})`);
  }
}

// ── Component subscores ──────────────────────────────────────────────────────

// The internship itself runs on CPT (no employer sponsorship needed), so the
// dominant question is the company's record of sponsoring FULL-TIME employees
// — that record is what converts a return offer into a career path.
const SPONSORSHIP_BASE: Record<SponsorshipCategory, number> = {
  SPONSORSHIP_OFFERED: 100,
  CPT_OPT_ACCEPTED: 95,
  COMPANY_HISTORY: 85,
  FUTURE_POSSIBLE: 70,
  NO_INFO: 50,
  UNCERTAIN: 45,
  EXPLICITLY_UNAVAILABLE: 0,
  UNRESTRICTED_AUTH_REQUIRED: 0,
  CITIZENSHIP_REQUIRED: 0,
  CLEARANCE_REQUIRED: 0,
  USER_INELIGIBLE: 0,
};

const UG_SCORES: Record<UgEligibility, number> = {
  UNDERGRAD_EXPLICIT: 100,
  UNDERGRAD_LIKELY: 85,
  AMBIGUOUS: 60,
  GRAD_PREFERRED: 35,
  GRAD_ONLY: 10,
  PHD_ONLY: 0,
};

function scoreSponsorship(input: ScoringInput): number {
  if (input.sponsorship.hardReject) return 0;
  const base = SPONSORSHIP_BASE[input.sponsorship.category];
  if (base === 0) return 0;
  if (!input.companyHasSponsorshipHistory) return base;
  // A verified full-time sponsorship record substantially de-risks ambiguous
  // or silent internship postings ("no sponsorship" phrases usually refer to
  // H-1B, which a CPT internship does not need).
  const bonus =
    input.sponsorship.category === "UNCERTAIN" || input.sponsorship.category === "NO_INFO"
      ? 25
      : 10;
  return clamp(base + bonus);
}

const MENTORSHIP_RX =
  /\bmentor(?:ship|ing|s)?\b|\breturn\s+offers?\b|\bconversion\b|\bconvert(?:ing|s)?\s+to\s+full[\s-]?time\b/i;
const STRUCTURED_RX = /\bprograms?\b|\bcohorts?\b|\brotational\b/i;

interface SubResult {
  score: number;
  positive?: string;
  rulesOnly?: boolean;
  missing?: string;
}

function scoreCareerValue(input: ScoringInputWithText): SubResult {
  const ai = input.aiCareerAssessment;
  if (ai) {
    const score = Math.round(clamp(ai.careerValue));
    return {
      score,
      positive: ai.positives[0] ?? `AI-assessed career value ${score}/100`,
    };
  }
  const text = input.description ?? "";
  let score = 55;
  const signals: string[] = [];
  if ((input.companyPriorityScore ?? 0) >= 70) {
    score += 10;
    signals.push("high-priority target company");
  }
  if (MENTORSHIP_RX.test(text)) {
    score += 10;
    signals.push("mentorship / return-offer language");
  }
  if (STRUCTURED_RX.test(text)) {
    score += 5;
    signals.push("structured program signals");
  }
  if (input.descriptionLength < 300) score -= 10; // thin posting
  return {
    score: Math.round(clamp(score)),
    positive:
      signals.length > 0 ? `Career-value signals: ${signals.join(", ")}` : undefined,
    rulesOnly: true,
  };
}

const LATE_STAGE_RX = /series\s*[cd]\b|\bpublic\b|\blate\b/i;

function scoreCompanyQuality(input: ScoringInput): SubResult {
  const ai = input.aiCareerAssessment;
  if (ai) {
    const score = Math.round(clamp(ai.companyQuality));
    return {
      score,
      positive: score >= 70 ? `AI-assessed company quality ${score}/100` : undefined,
    };
  }
  let score = 50;
  if (typeof input.companyPriorityScore === "number") {
    score += input.companyPriorityScore / 4;
  }
  const lateStage =
    typeof input.companyStage === "string" && LATE_STAGE_RX.test(input.companyStage);
  if (lateStage) score += 10;
  const rounded = Math.round(clamp(score));
  let positive: string | undefined;
  if ((input.companyPriorityScore ?? 0) >= 70) {
    positive = `High-priority company (priority ${input.companyPriorityScore}/100)`;
  } else if (lateStage) {
    positive = `Established later-stage company (${input.companyStage})`;
  }
  return { score: rounded, positive };
}

function scoreCompensation(input: ScoringInput): SubResult {
  const comp = input.compensation;
  if (comp.payType === "UNPAID") return { score: 0 };
  const amounts = [comp.minAmount, comp.maxAmount].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  );
  if (comp.payType === "UNKNOWN" || amounts.length === 0) {
    return { score: 55, missing: "Compensation not listed" };
  }
  const amount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const period =
    comp.period ??
    (comp.payType === "HOURLY" ? "hour" : comp.payType === "MONTHLY" ? "month" : "total");
  const hourly =
    period === "hour"
      ? amount
      : period === "month"
        ? amount / HOURS_PER_MONTH
        : amount / HOURS_PER_PROGRAM;
  const score = hourly >= 60 ? 100 : hourly >= 45 ? 90 : hourly >= 35 ? 75 : hourly >= 25 ? 60 : 40;
  const raw = comp.rawText ? ` (${comp.rawText})` : "";
  const positive =
    score >= 90 ? `Strong pay${raw}` : score >= 60 ? `Solid pay${raw}` : undefined;
  return { score, positive };
}

function scoreFreshness(input: ScoringInput, now: Date): SubResult {
  let score: number;
  let positive: string | undefined;
  let missing: string | undefined;
  if (input.postedAt) {
    const ageDays = Math.max(0, (now.getTime() - input.postedAt.getTime()) / DAY_MS);
    if (ageDays <= 3) {
      score = 100;
      positive = "Freshly posted (within 3 days)";
    } else if (ageDays <= 7) {
      score = 85;
      positive = "Posted within the last week";
    } else if (ageDays <= 14) score = 70;
    else if (ageDays <= 30) score = 55;
    else if (ageDays <= 60) score = 40;
    else score = 25;
  } else {
    score = 50;
    missing = "Posting date unknown";
  }
  if (input.applicationDeadline) {
    const daysToDeadline = (input.applicationDeadline.getTime() - now.getTime()) / DAY_MS;
    if (daysToDeadline >= 0 && daysToDeadline <= 7) {
      score = Math.min(100, score + 10);
      positive = "Application deadline within 7 days — apply quickly";
    }
  }
  return { score, positive, missing };
}

// ── Explanations ─────────────────────────────────────────────────────────────

const ROLE_POSITIVES: Partial<Record<RoleCategory, string>> = {
  AI_PRODUCT_MANAGEMENT: "Direct AI PM role — your top target category",
  PM_FOR_AI_PRODUCTS: "PM role on an AI product — near the top of your target list",
  TECHNICAL_PM: "Technical PM role — a top target category",
  AI_ENGINEERING: "AI engineering role — strong alignment with your goals",
  APPLIED_AI: "Applied AI role — strong alignment with your goals",
  ML_ENGINEERING: "ML engineering role — good technical alignment",
  APM_PROGRAM: "APM program — structured product-management path",
  PRODUCT_ROTATIONAL: "Product rotational program — broad product exposure",
  OTHER_EXCEPTIONAL: "Exceptional role outside your core categories",
};

const SPONSORSHIP_POSITIVES: Partial<Record<SponsorshipCategory, string>> = {
  SPONSORSHIP_OFFERED: "Visa sponsorship explicitly offered",
  CPT_OPT_ACCEPTED: "CPT/OPT candidates explicitly accepted — F-1 friendly",
  COMPANY_HISTORY: "Company has a verified sponsorship track record",
  FUTURE_POSSIBLE: "Posting signals future sponsorship is possible",
};

const SPONSORSHIP_CONCERNS: Partial<Record<SponsorshipCategory, string>> = {
  CITIZENSHIP_REQUIRED: "Explicitly requires US citizenship",
  CLEARANCE_REQUIRED: "Requires a security clearance",
  EXPLICITLY_UNAVAILABLE: "Sponsorship explicitly unavailable",
  UNRESTRICTED_AUTH_REQUIRED: "Requires unrestricted US work authorization",
  USER_INELIGIBLE: "Marked ineligible for your work-authorization situation",
};

const UG_POSITIVES: Partial<Record<UgEligibility, string>> = {
  UNDERGRAD_EXPLICIT: "Explicitly open to undergraduates",
  UNDERGRAD_LIKELY: "Likely open to undergraduates",
};

const UG_CONCERNS: Partial<Record<UgEligibility, string>> = {
  GRAD_PREFERRED: "Posting prefers graduate students",
  GRAD_ONLY: "Posting appears restricted to graduate students",
  PHD_ONLY: "PhD-only posting",
};

const BAND_ACTIONS: Record<Exclude<ScoreBand, "INELIGIBLE">, string> = {
  EXCEPTIONAL: "Apply this week — exceptional fit",
  HIGH_PRIORITY: "Apply within the next few days — high-priority fit",
  STRONG: "Apply soon — strong opportunity",
  WORTH_REVIEWING: "Review the details — worth your time if it fits your goals",
  REACH: "Consider as a reach — apply if you have spare bandwidth",
  LOW_PRIORITY: "Deprioritize — weak overall fit",
};

const INELIGIBLE_ACTIONS: Partial<Record<SponsorshipCategory, string>> = {
  CITIZENSHIP_REQUIRED: "Skip — explicitly requires citizenship",
  CLEARANCE_REQUIRED: "Skip — requires a security clearance",
  EXPLICITLY_UNAVAILABLE: "Skip — sponsorship explicitly unavailable",
  UNRESTRICTED_AUTH_REQUIRED: "Skip — requires unrestricted work authorization",
  USER_INELIGIBLE: "Skip — marked ineligible for your situation",
};

function bandFor(overall: number, thresholds: Array<{ band: ScoreBand; min: number }>): ScoreBand {
  for (const { band, min } of thresholds) {
    if (overall >= min) return band;
  }
  return "LOW_PRIORITY";
}

function sponsorshipPositive(input: ScoringInput): string | undefined {
  if (input.sponsorship.hardReject) return undefined;
  const base = SPONSORSHIP_POSITIVES[input.sponsorship.category];
  if (!base) return undefined;
  if (input.companyHasSponsorshipHistory && input.sponsorship.category !== "COMPANY_HISTORY") {
    return `${base} (company also has sponsorship history)`;
  }
  return base;
}

function locationPositive(input: ScoringInput, subscore: number): string | undefined {
  if (subscore === 100) {
    return `Work arrangement (${input.workArrangement.toLowerCase()}) matches your preference`;
  }
  if (subscore >= 80 && input.workArrangement !== "UNKNOWN") {
    return "Work arrangement compatible with your preference";
  }
  return undefined;
}

function buildPositives(
  input: ScoringInputWithText,
  components: Record<ScoreComponent, number>,
  weights: Record<ScoreComponent, number>,
  subs: { career: SubResult; company: SubResult; comp: SubResult; fresh: SubResult },
): string[] {
  const phrases = new Map<ScoreComponent, string>();
  const set = (c: ScoreComponent, text: string | undefined) => {
    if (text) phrases.set(c, text);
  };
  set("roleAlignment", ROLE_POSITIVES[input.roleCategory]);
  set("sponsorship", sponsorshipPositive(input));
  set("careerValue", subs.career.positive);
  set("companyQuality", subs.company.positive);
  set("ugEligibility", UG_POSITIVES[input.eligibility.ugEligibility]);
  set("compensation", subs.comp.positive);
  set("locationFit", locationPositive(input, components.locationFit));
  set("freshness", subs.fresh.positive);

  return [...phrases.entries()]
    .filter(([c]) => components[c] >= 55)
    .sort(
      ([a], [b]) =>
        components[b] - components[a] || weights[b] - weights[a] || a.localeCompare(b),
    )
    .slice(0, 3)
    .map(([, text]) => text);
}

function buildConcerns(
  input: ScoringInput,
  components: Record<ScoreComponent, number>,
): string[] {
  const concerns: string[] = [];
  if (!input.eligibility.eligible) {
    const reason = input.eligibility.rejectReason;
    concerns.push(`Fails eligibility gate${reason ? `: ${reason}` : ""}`);
  }
  if (components.sponsorship <= 40) {
    concerns.push(SPONSORSHIP_CONCERNS[input.sponsorship.category] ?? "Weak sponsorship outlook");
  }
  // 45-point UNCERTAIN sits above the ≤40 cut, but ambiguity is worth flagging.
  if (input.sponsorship.category === "UNCERTAIN" && !input.sponsorship.hardReject) {
    concerns.push(
      input.sponsorship.conflictingInfo
        ? `Sponsorship language is uncertain: ${input.sponsorship.conflictingInfo}`
        : "Sponsorship language is uncertain — verify with the recruiter",
    );
  }
  if (components.roleAlignment <= 40) {
    concerns.push("Role falls outside your target categories");
  }
  if (components.careerValue <= 40) {
    concerns.push(
      input.aiCareerAssessment?.concerns[0] ?? "Limited career-value signals in this posting",
    );
  }
  if (components.companyQuality <= 40) {
    concerns.push("Weak company-quality signals");
  }
  if (components.ugEligibility <= 40) {
    const text = UG_CONCERNS[input.eligibility.ugEligibility];
    if (text) concerns.push(text);
  }
  if (components.compensation <= 40) {
    concerns.push(
      input.compensation.payType === "UNPAID" ? "Unpaid role" : "Pay appears below your target range",
    );
  }
  if (components.locationFit <= 40) {
    concerns.push("Work arrangement conflicts with your preference");
  }
  if (components.freshness <= 40) {
    concerns.push("Posting is stale — role may already be filled");
  }
  return concerns;
}

function buildAction(band: ScoreBand, input: ScoringInput): string {
  if (band === "INELIGIBLE") {
    if (input.sponsorship.hardReject) {
      return (
        INELIGIBLE_ACTIONS[input.sponsorship.category] ??
        "Skip — sponsorship unavailable for your situation"
      );
    }
    const reason = input.eligibility.rejectReason;
    return `Skip — fails eligibility gate${reason ? ` (${reason})` : ""}`;
  }
  if (input.sponsorship.category === "UNCERTAIN" && band !== "LOW_PRIORITY") {
    return "Verify sponsorship language with recruiter before applying";
  }
  return BAND_ACTIONS[band];
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function scoreListing(
  input: ScoringInputWithText,
  weights: Record<ScoreComponent, number> = DEFAULT_WEIGHTS,
  knobs: ScoringKnobs = DEFAULT_SCORING_KNOBS,
): ScoreResult {
  validateWeights(weights);
  const now = input.now ?? new Date();

  const career = scoreCareerValue(input);
  const company = scoreCompanyQuality(input);
  const comp = scoreCompensation(input);
  const fresh = scoreFreshness(input, now);

  const components: Record<ScoreComponent, number> = {
    careerValue: career.score,
    sponsorship: scoreSponsorship(input),
    roleAlignment: knobs.roleAlignmentScores[input.roleCategory] ?? ROLE_ALIGNMENT_SCORES[input.roleCategory],
    companyQuality: company.score,
    ugEligibility: UG_SCORES[input.eligibility.ugEligibility],
    compensation: comp.score,
    locationFit: ARRANGEMENT_PREFERENCE_SCORES[input.preferredArrangement][input.workArrangement],
    freshness: fresh.score,
  };

  const raw =
    SCORE_COMPONENTS.reduce((acc, c) => acc + components[c] * weights[c], 0) / 100;

  // A season that was inferred from the source list — or never stated — is a
  // real risk: most postings live at any moment belong to the CURRENT cycle,
  // not the target one. Validation found unconfirmed-season roles crowding out
  // genuinely confirmed ones, so they are demoted rather than trusted.
  const seasonPenalty =
    input.eligibility.seasonMatch === "EXPLICIT"
      ? 0
      : input.eligibility.seasonMatch === "INFERRED"
        ? 8
        : 12;
  const overall = Math.round(clamp(raw - seasonPenalty));

  const ineligible = input.sponsorship.hardReject || !input.eligibility.eligible;
  const band: ScoreBand = ineligible ? "INELIGIBLE" : bandFor(overall, knobs.bandThresholds);

  const missing: string[] = [];
  if (career.rulesOnly) missing.push("Career value estimated by rules only");
  if (comp.missing) missing.push(comp.missing);
  if (input.sponsorship.category === "NO_INFO") {
    missing.push("No sponsorship information in the posting");
  }
  if (fresh.missing) missing.push(fresh.missing);
  if (input.eligibility.seasonMatch === "UNKNOWN") {
    missing.push("Season not confirmed — could be a different cycle");
  } else if (input.eligibility.seasonMatch === "INFERRED") {
    missing.push(
      `Season inferred from the source list, not stated in the posting — confirm it is ${SEASON}`,
    );
  }
  if (input.workArrangement === "UNKNOWN") missing.push("Work arrangement not specified");

  return {
    overall,
    band,
    components,
    positives: buildPositives(input, components, weights, { career, company, comp, fresh }),
    concerns: buildConcerns(input, components),
    missing,
    recommendedAction: buildAction(band, input),
    engine: input.aiCareerAssessment ? "rules+ai" : "rules",
    model: input.aiCareerAssessment?.model,
    promptVersion: input.aiCareerAssessment?.promptVersion,
  };
}
