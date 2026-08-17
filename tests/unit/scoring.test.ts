import { describe, expect, it } from "vitest";
import type { ScoreBand, UgEligibility, WorkArrangement } from "@prisma/client";
import { BAND_THRESHOLDS, DEFAULT_WEIGHTS, ROLE_ALIGNMENT_SCORES, SCORE_COMPONENTS } from "@/lib/constants";
import type { ScoreComponent } from "@/lib/constants";
import type { EligibilityResult, SponsorshipRuleResult } from "@/lib/types";
import { buildWeightsSnapshot, resolveScoringKnobs, scoreListing, validateWeights } from "@/server/scoring";
import type { ScoringInputWithText } from "@/server/scoring";

const NOW = new Date("2026-07-18T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY_MS);

function sponsorship(over: Partial<SponsorshipRuleResult> = {}): SponsorshipRuleResult {
  return {
    category: "CPT_OPT_ACCEPTED",
    confidence: "HIGH",
    hardReject: false,
    matchedText: [],
    futureSponsorshipPotential: "LIKELY",
    explanation: "CPT/OPT accepted per posting",
    ...over,
  };
}

function eligibility(over: Partial<EligibilityResult> = {}): EligibilityResult {
  return {
    eligible: true,
    seasonMatch: "EXPLICIT",
    ugEligibility: "UNDERGRAD_EXPLICIT",
    isUS: true,
    isPaid: true,
    notes: [],
    ...over,
  };
}

function makeInput(over: Partial<ScoringInputWithText> = {}): ScoringInputWithText {
  return {
    roleCategory: "AI_PRODUCT_MANAGEMENT",
    sponsorship: sponsorship(),
    eligibility: eligibility(),
    companyHasSponsorshipHistory: false,
    companyPriorityScore: null,
    companyStage: null,
    compensation: { payType: "HOURLY", minAmount: 50, maxAmount: 50, period: "hour" },
    workArrangement: "ONSITE",
    preferredArrangement: "ONSITE",
    postedAt: daysAgo(2),
    applicationDeadline: null,
    descriptionLength: 1200,
    now: NOW,
    ...over,
  };
}

function soloWeights(component: ScoreComponent): Record<ScoreComponent, number> {
  const w = Object.fromEntries(SCORE_COMPONENTS.map((c) => [c, 0])) as Record<
    ScoreComponent,
    number
  >;
  w[component] = 100;
  return w;
}

const ai = (careerValue: number, companyQuality = 60) => ({
  careerValue,
  companyQuality,
  positives: [],
  concerns: [],
  model: "claude-test",
  promptVersion: "v1",
});

describe("validateWeights", () => {
  it("accepts DEFAULT_WEIGHTS", () => {
    expect(() => validateWeights(DEFAULT_WEIGHTS)).not.toThrow();
  });

  it("throws when a component key is missing", () => {
    const rest = Object.fromEntries(
      Object.entries(DEFAULT_WEIGHTS).filter(([key]) => key !== "freshness"),
    );
    expect(() => validateWeights(rest as Record<ScoreComponent, number>)).toThrow(/freshness/);
  });

  it("throws when the sum is not exactly 100", () => {
    expect(() => validateWeights({ ...DEFAULT_WEIGHTS, careerValue: 30 })).toThrow(/sum/i);
  });

  it("throws on negative or out-of-range values", () => {
    expect(() =>
      validateWeights({ ...DEFAULT_WEIGHTS, careerValue: -5, sponsorship: 55 }),
    ).toThrow(/between 0 and 100/);
    expect(() => validateWeights({ ...soloWeights("careerValue"), careerValue: 105 })).toThrow(
      /between 0 and 100/,
    );
  });

  it("throws on NaN", () => {
    expect(() => validateWeights({ ...DEFAULT_WEIGHTS, freshness: Number.NaN })).toThrow();
  });
});

describe("scoreListing — weights", () => {
  it("honors custom weights", () => {
    const weights = { ...soloWeights("sponsorship"), sponsorship: 60, roleAlignment: 40 };
    const result = scoreListing(
      makeInput({
        sponsorship: sponsorship({ category: "SPONSORSHIP_OFFERED", confidence: "CONFIRMED" }),
        roleCategory: "DATA_SCIENCE",
      }),
      weights,
    );
    // 100 * 0.6 + 45 * 0.4 = 78
    expect(result.overall).toBe(78);
    expect(result.band).toBe("HIGH_PRIORITY");
  });

  it("defaults to DEFAULT_WEIGHTS and overall equals the weighted component sum", () => {
    const result = scoreListing(makeInput());
    const expected = Math.round(
      SCORE_COMPONENTS.reduce((acc, c) => acc + result.components[c] * DEFAULT_WEIGHTS[c], 0) /
        100,
    );
    expect(result.overall).toBe(expected);
  });

  it("rejects invalid weights passed to scoreListing", () => {
    expect(() => scoreListing(makeInput(), { ...DEFAULT_WEIGHTS, careerValue: 99 })).toThrow(
      /sum/i,
    );
  });
});

describe("scoreListing — band edges", () => {
  // Solo careerValue weight + AI assessment pins overall to an exact value.
  it.each<[number, ScoreBand]>([
    [85, "EXCEPTIONAL"],
    [84, "HIGH_PRIORITY"],
    [75, "HIGH_PRIORITY"],
    [74, "STRONG"],
    [65, "STRONG"],
    [64, "WORTH_REVIEWING"],
    [55, "WORTH_REVIEWING"],
    [54, "REACH"],
    [45, "REACH"],
    [44, "LOW_PRIORITY"],
    [0, "LOW_PRIORITY"],
  ])("overall %i → %s", (value, band) => {
    const result = scoreListing(
      makeInput({ aiCareerAssessment: ai(value) }),
      soloWeights("careerValue"),
    );
    expect(result.overall).toBe(value);
    expect(result.band).toBe(band);
  });
});

describe("scoreListing — ineligibility overrides", () => {
  it("hardReject forces INELIGIBLE even when every other subscore is high", () => {
    const result = scoreListing(
      makeInput({
        sponsorship: sponsorship({
          category: "CITIZENSHIP_REQUIRED",
          confidence: "CONFIRMED",
          hardReject: true,
        }),
        companyPriorityScore: 95,
      }),
    );
    expect(result.components.sponsorship).toBe(0);
    expect(result.components.roleAlignment).toBe(100);
    expect(result.overall).toBeGreaterThan(45); // score still computed…
    expect(result.band).toBe("INELIGIBLE"); // …but the band is overridden
    expect(result.recommendedAction).toBe("Skip — explicitly requires citizenship");
    expect(result.concerns).toContain("Explicitly requires US citizenship");
  });

  it("failed eligibility gate forces INELIGIBLE", () => {
    const result = scoreListing(
      makeInput({
        eligibility: eligibility({
          eligible: false,
          rejectReason: "WRONG_SEASON",
          seasonMatch: "NEGATIVE",
        }),
      }),
    );
    expect(result.band).toBe("INELIGIBLE");
    expect(result.recommendedAction).toBe("Skip — fails eligibility gate (WRONG_SEASON)");
    expect(result.concerns).toContain("Fails eligibility gate: WRONG_SEASON");
  });

  it("EXPLICITLY_UNAVAILABLE hard reject gets a sponsorship-specific skip action", () => {
    const result = scoreListing(
      makeInput({
        sponsorship: sponsorship({
          category: "EXPLICITLY_UNAVAILABLE",
          confidence: "EXPLICITLY_UNAVAILABLE",
          hardReject: true,
        }),
      }),
    );
    expect(result.band).toBe("INELIGIBLE");
    expect(result.recommendedAction).toBe("Skip — sponsorship explicitly unavailable");
  });
});

describe("scoreListing — sponsorship subscore", () => {
  it.each<[SponsorshipRuleResult["category"], number]>([
    ["SPONSORSHIP_OFFERED", 100],
    ["CPT_OPT_ACCEPTED", 95],
    ["COMPANY_HISTORY", 85],
    ["FUTURE_POSSIBLE", 70],
    ["NO_INFO", 50],
    ["UNCERTAIN", 45],
  ])("%s → %i", (category, expected) => {
    const result = scoreListing(makeInput({ sponsorship: sponsorship({ category }) }));
    expect(result.components.sponsorship).toBe(expected);
  });

  it("company sponsorship history adds +10 (or +25 when the listing is silent/uncertain) with a 100 cap", () => {
    const withHistory = scoreListing(
      makeInput({
        sponsorship: sponsorship({ category: "COMPANY_HISTORY" }),
        companyHasSponsorshipHistory: true,
      }),
    );
    expect(withHistory.components.sponsorship).toBe(95);
    // A verified full-time record de-risks silent/uncertain internship postings
    // (CPT internships need no employer sponsorship — the future job does).
    const uncertainWithHistory = scoreListing(
      makeInput({
        sponsorship: sponsorship({ category: "UNCERTAIN" }),
        companyHasSponsorshipHistory: true,
      }),
    );
    expect(uncertainWithHistory.components.sponsorship).toBe(70);
    const silentWithHistory = scoreListing(
      makeInput({
        sponsorship: sponsorship({ category: "NO_INFO" }),
        companyHasSponsorshipHistory: true,
      }),
    );
    expect(silentWithHistory.components.sponsorship).toBe(75);
    const capped = scoreListing(
      makeInput({
        sponsorship: sponsorship({ category: "SPONSORSHIP_OFFERED" }),
        companyHasSponsorshipHistory: true,
      }),
    );
    expect(capped.components.sponsorship).toBe(100);
  });

  it("UNCERTAIN adds a nuance concern and a verify-with-recruiter action", () => {
    const result = scoreListing(
      makeInput({ sponsorship: sponsorship({ category: "UNCERTAIN", confidence: "LOW" }) }),
    );
    expect(result.components.sponsorship).toBe(45);
    expect(result.concerns.some((c) => /uncertain/i.test(c))).toBe(true);
    expect(result.recommendedAction).toBe(
      "Verify sponsorship language with recruiter before applying",
    );
  });
});

describe("scoreListing — career value", () => {
  it("uses the AI assessment verbatim and labels the engine rules+ai", () => {
    const result = scoreListing(makeInput({ aiCareerAssessment: ai(83, 72) }));
    expect(result.components.careerValue).toBe(83);
    expect(result.components.companyQuality).toBe(72);
    expect(result.engine).toBe("rules+ai");
    expect(result.model).toBe("claude-test");
    expect(result.promptVersion).toBe("v1");
    expect(result.missing).not.toContain("Career value estimated by rules only");
  });

  it("clamps out-of-range AI values", () => {
    expect(
      scoreListing(makeInput({ aiCareerAssessment: ai(150) })).components.careerValue,
    ).toBe(100);
    expect(scoreListing(makeInput({ aiCareerAssessment: ai(-20) })).components.careerValue).toBe(
      0,
    );
  });

  it("rules heuristic stacks priority + mentorship + program bonuses", () => {
    const result = scoreListing(
      makeInput({
        companyPriorityScore: 80,
        description:
          "Our internship program pairs every intern with a dedicated mentor; strong return offer rates.",
        descriptionLength: 1200,
      }),
    );
    // 55 + 10 (priority ≥70) + 10 (mentorship) + 5 (program) = 80
    expect(result.components.careerValue).toBe(80);
    expect(result.engine).toBe("rules");
    expect(result.model).toBeUndefined();
    expect(result.missing).toContain("Career value estimated by rules only");
  });

  it("penalizes thin postings", () => {
    const result = scoreListing(makeInput({ descriptionLength: 120 }));
    expect(result.components.careerValue).toBe(45); // 55 - 10
  });
});

describe("scoreListing — company quality (rules)", () => {
  it("adds priority/4 and a late-stage bonus", () => {
    expect(
      scoreListing(makeInput({ companyPriorityScore: 80, companyStage: "Public" })).components
        .companyQuality,
    ).toBe(80); // 50 + 20 + 10
    expect(
      scoreListing(makeInput({ companyStage: "Series C" })).components.companyQuality,
    ).toBe(60);
    expect(scoreListing(makeInput()).components.companyQuality).toBe(50);
  });
});

describe("scoreListing — undergrad eligibility", () => {
  it.each<[UgEligibility, number]>([
    ["UNDERGRAD_EXPLICIT", 100],
    ["UNDERGRAD_LIKELY", 85],
    ["AMBIGUOUS", 60],
    ["GRAD_PREFERRED", 35],
    ["GRAD_ONLY", 10],
    ["PHD_ONLY", 0],
  ])("%s → %i", (ug, expected) => {
    const result = scoreListing(makeInput({ eligibility: eligibility({ ugEligibility: ug }) }));
    expect(result.components.ugEligibility).toBe(expected);
  });
});

describe("scoreListing — compensation", () => {
  it("unpaid scores 0 and is flagged as a concern", () => {
    const result = scoreListing(
      makeInput({ compensation: { payType: "UNPAID" } }),
      soloWeights("compensation"),
    );
    expect(result.components.compensation).toBe(0);
    expect(result.overall).toBe(0);
    expect(result.band).toBe("LOW_PRIORITY");
    expect(result.concerns).toContain("Unpaid role");
  });

  it("unknown compensation scores 55 with a missing-info note", () => {
    const unknownType = scoreListing(makeInput({ compensation: { payType: "UNKNOWN" } }));
    expect(unknownType.components.compensation).toBe(55);
    expect(unknownType.missing).toContain("Compensation not listed");
    const noAmounts = scoreListing(makeInput({ compensation: { payType: "HOURLY" } }));
    expect(noAmounts.components.compensation).toBe(55);
    expect(noAmounts.missing).toContain("Compensation not listed");
  });

  it.each<[number, number]>([
    [65, 100],
    [60, 100],
    [50, 90],
    [45, 90],
    [40, 75],
    [35, 75],
    [30, 60],
    [25, 60],
    [20, 40],
  ])("hourly $%i/hr → %i", (rate, expected) => {
    const result = scoreListing(
      makeInput({
        compensation: { payType: "HOURLY", minAmount: rate, maxAmount: rate, period: "hour" },
      }),
    );
    expect(result.components.compensation).toBe(expected);
  });

  it("uses the midpoint of a range", () => {
    const result = scoreListing(
      makeInput({
        compensation: { payType: "HOURLY", minAmount: 45, maxAmount: 55, period: "hour" },
      }),
    );
    expect(result.components.compensation).toBe(90); // midpoint 50
  });

  it("maps monthly and total amounts to hourly equivalents", () => {
    const monthly = scoreListing(
      makeInput({ compensation: { payType: "MONTHLY", minAmount: 8000, period: "month" } }),
    );
    expect(monthly.components.compensation).toBe(90); // 8000/160 = 50/hr
    const lowMonthly = scoreListing(
      makeInput({ compensation: { payType: "MONTHLY", minAmount: 4000, period: "month" } }),
    );
    expect(lowMonthly.components.compensation).toBe(60); // 25/hr
    const stipend = scoreListing(
      makeInput({ compensation: { payType: "STIPEND", minAmount: 30000, period: "total" } }),
    );
    expect(stipend.components.compensation).toBe(100); // 30000/480 = 62.5/hr
  });
});

describe("scoreListing — location fit", () => {
  it.each<[WorkArrangement, WorkArrangement, number]>([
    ["ONSITE", "ONSITE", 100],
    ["ONSITE", "HYBRID", 92],
    ["ONSITE", "REMOTE", 72],
    ["REMOTE", "REMOTE", 100],
    ["ONSITE", "UNKNOWN", 78],
  ])("preferred %s / actual %s → %i", (preferred, actual, expected) => {
    const result = scoreListing(
      makeInput({ preferredArrangement: preferred, workArrangement: actual }),
    );
    expect(result.components.locationFit).toBe(expected);
  });
});

describe("scoreListing — freshness (fixed now)", () => {
  it.each<[number, number]>([
    [2, 100],
    [5, 85],
    [10, 70],
    [20, 55],
    [45, 40],
    [90, 25],
  ])("posted %i days ago → %i", (age, expected) => {
    const result = scoreListing(makeInput({ postedAt: daysAgo(age) }));
    expect(result.components.freshness).toBe(expected);
  });

  it("unknown posting date scores 50 with a missing note", () => {
    const result = scoreListing(makeInput({ postedAt: null }));
    expect(result.components.freshness).toBe(50);
    expect(result.missing).toContain("Posting date unknown");
  });

  it("deadline within 7 days adds +10 urgency, capped at 100", () => {
    const boosted = scoreListing(
      makeInput({ postedAt: daysAgo(20), applicationDeadline: daysAhead(3) }),
    );
    expect(boosted.components.freshness).toBe(65); // 55 + 10
    const capped = scoreListing(
      makeInput({ postedAt: daysAgo(2), applicationDeadline: daysAhead(3) }),
    );
    expect(capped.components.freshness).toBe(100);
    const pastDeadline = scoreListing(
      makeInput({ postedAt: daysAgo(20), applicationDeadline: daysAhead(-1) }),
    );
    expect(pastDeadline.components.freshness).toBe(55); // no bonus for expired deadlines
  });
});

describe("scoreListing — explanations", () => {
  it("positives lead with concrete top-component phrasing, max 3", () => {
    const result = scoreListing(makeInput());
    expect(result.positives.length).toBeLessThanOrEqual(3);
    expect(result.positives).toContain("Direct AI PM role — your top target category");
  });

  it("flags an unknown season under missing info", () => {
    const result = scoreListing(
      makeInput({ eligibility: eligibility({ seasonMatch: "UNKNOWN" }) }),
    );
    expect(result.missing.some((m) => /season/i.test(m))).toBe(true);
  });

  it("band actions match the band", () => {
    const exceptional = scoreListing(
      makeInput({ aiCareerAssessment: ai(95) }),
      soloWeights("careerValue"),
    );
    expect(exceptional.recommendedAction).toBe("Apply this week — exceptional fit");
    const low = scoreListing(
      makeInput({ aiCareerAssessment: ai(20) }),
      soloWeights("careerValue"),
    );
    expect(low.recommendedAction).toBe("Deprioritize — weak overall fit");
  });
});

describe("scoreListing — famous company does not auto-win", () => {
  it("small F-1-friendly company with mentorship outscores a big name with no sponsorship info", () => {
    const small = scoreListing(
      makeInput({
        sponsorship: sponsorship({ category: "CPT_OPT_ACCEPTED" }),
        companyHasSponsorshipHistory: true,
        companyPriorityScore: 72,
        description:
          "Structured internship program with a dedicated mentor and a strong return offer rate.",
        descriptionLength: 900,
      }),
    );
    const big = scoreListing(
      makeInput({
        sponsorship: sponsorship({
          category: "NO_INFO",
          confidence: "UNKNOWN",
          futureSponsorshipPotential: "UNKNOWN",
        }),
        companyHasSponsorshipHistory: false,
        companyPriorityScore: 95,
        companyStage: "Public",
        descriptionLength: 150,
      }),
    );
    // Big name wins on company quality alone (only 15% of the score)…
    expect(big.components.companyQuality).toBeGreaterThan(small.components.companyQuality);
    // …but loses overall to better sponsorship + career value.
    expect(small.overall).toBeGreaterThan(big.overall);
  });
});

// Regression: adversarial validation found most top-ranked listings were not
// actually Summer 2027 — their season was inferred from the source list or
// absent entirely. An unconfirmed season must not outrank a confirmed one.
describe("season confidence affects rank", () => {
  const base = (seasonMatch: "EXPLICIT" | "INFERRED" | "UNKNOWN") => ({
    roleCategory: "AI_ENGINEERING" as const,
    sponsorship: {
      category: "NO_INFO" as const, confidence: "UNKNOWN" as const, hardReject: false,
      matchedText: [], futureSponsorshipPotential: "POSSIBLE" as const, explanation: "",
    },
    eligibility: {
      eligible: true, seasonMatch, ugEligibility: "AMBIGUOUS" as const,
      isUS: true, isPaid: "UNKNOWN" as const, notes: [],
    },
    companyHasSponsorshipHistory: false,
    compensation: { payType: "UNKNOWN" as const },
    workArrangement: "ONSITE" as const,
    preferredArrangement: "ONSITE" as const,
    descriptionLength: 2000,
  });

  it("an explicit Summer 2027 posting outscores an inferred one", async () => {
    const { scoreListing } = await import("@/server/scoring");
    expect(scoreListing(base("EXPLICIT")).overall).toBeGreaterThan(
      scoreListing(base("INFERRED")).overall,
    );
  });

  it("an inferred season is not scored the same as an unknown one being confirmed", async () => {
    const { scoreListing } = await import("@/server/scoring");
    expect(scoreListing(base("EXPLICIT")).overall).toBeGreaterThan(
      scoreListing(base("UNKNOWN")).overall,
    );
  });

  it("flags the unconfirmed season as a concern the user can see", async () => {
    const { scoreListing } = await import("@/server/scoring");
    const r = scoreListing(base("INFERRED"));
    expect([...r.concerns, ...r.missing].some((s) => /season/i.test(s))).toBe(true);
  });
});

// ── Phase 2: user-configurable scoring knobs ─────────────────────────────────

describe("resolveScoringKnobs", () => {
  it("null / missing prefs → the default constants", () => {
    const knobs = resolveScoringKnobs(null);
    expect(knobs.roleAlignmentScores).toBe(ROLE_ALIGNMENT_SCORES);
    expect(knobs.bandThresholds).toBe(BAND_THRESHOLDS);
  });

  it("merges a partial roleAlignmentScores override over the defaults", () => {
    const knobs = resolveScoringKnobs({ roleAlignmentScores: { DATA_SCIENCE: 80 } });
    expect(knobs.roleAlignmentScores.DATA_SCIENCE).toBe(80);
    expect(knobs.roleAlignmentScores.AI_PRODUCT_MANAGEMENT).toBe(100);
  });

  it("drops invalid role keys/values and falls back when nothing valid remains", () => {
    const knobs = resolveScoringKnobs({
      roleAlignmentScores: { AI_ENGINEERING: 500, BOGUS_CATEGORY: 50 },
    });
    expect(knobs.roleAlignmentScores).toBe(ROLE_ALIGNMENT_SCORES);
  });

  it("rejects an incomplete band ladder", () => {
    const knobs = resolveScoringKnobs({
      bandThresholds: [{ band: "EXCEPTIONAL", min: 90 }],
    });
    expect(knobs.bandThresholds).toBe(BAND_THRESHOLDS);
  });

  it("accepts a complete ladder and normalizes its order", () => {
    const knobs = resolveScoringKnobs({
      bandThresholds: [
        { band: "LOW_PRIORITY", min: 0 },
        { band: "EXCEPTIONAL", min: 95 },
        { band: "STRONG", min: 65 },
        { band: "HIGH_PRIORITY", min: 80 },
        { band: "REACH", min: 45 },
        { band: "WORTH_REVIEWING", min: 55 },
      ],
    });
    expect(knobs.bandThresholds[0]).toEqual({ band: "EXCEPTIONAL", min: 95 });
    expect(knobs.bandThresholds.at(-1)).toEqual({ band: "LOW_PRIORITY", min: 0 });
  });
});

describe("scoring knob overrides change the score", () => {
  it("roleAlignmentScores override changes the roleAlignment subscore", () => {
    const input = makeInput({ roleCategory: "SOFTWARE_ENGINEERING" });
    const before = scoreListing(input, soloWeights("roleAlignment"));
    expect(before.components.roleAlignment).toBe(15);

    const knobs = resolveScoringKnobs({ roleAlignmentScores: { SOFTWARE_ENGINEERING: 90 } });
    const after = scoreListing(input, soloWeights("roleAlignment"), knobs);
    expect(after.components.roleAlignment).toBe(90);
    expect(after.overall).toBeGreaterThan(before.overall);
  });

  it("bandThresholds override changes the band for the same overall", () => {
    // TECHNICAL_PM alignment 88 with a roleAlignment-only weight → overall 88.
    const input = makeInput({ roleCategory: "TECHNICAL_PM" });
    const before = scoreListing(input, soloWeights("roleAlignment"));
    expect(before.band).toBe("EXCEPTIONAL");

    const knobs = resolveScoringKnobs({
      bandThresholds: [
        { band: "EXCEPTIONAL", min: 95 },
        { band: "HIGH_PRIORITY", min: 75 },
        { band: "STRONG", min: 65 },
        { band: "WORTH_REVIEWING", min: 55 },
        { band: "REACH", min: 45 },
        { band: "LOW_PRIORITY", min: 0 },
      ],
    });
    const after = scoreListing(input, soloWeights("roleAlignment"), knobs);
    expect(after.overall).toBe(before.overall);
    expect(after.band).toBe("HIGH_PRIORITY");
  });
});

describe("buildWeightsSnapshot", () => {
  it("records the weights and the effective knobs that produced a score", () => {
    const knobs = resolveScoringKnobs({ roleAlignmentScores: { RESEARCH: 70 } });
    const snapshot = buildWeightsSnapshot(DEFAULT_WEIGHTS, knobs);
    expect(snapshot.weights).toBe(DEFAULT_WEIGHTS);
    expect(snapshot.roleAlignmentScores.RESEARCH).toBe(70);
    expect(snapshot.bandThresholds).toEqual(BAND_THRESHOLDS);
  });

  it("defaults to the default knobs", () => {
    const snapshot = buildWeightsSnapshot(DEFAULT_WEIGHTS);
    expect(snapshot.roleAlignmentScores).toBe(ROLE_ALIGNMENT_SCORES);
  });
});
