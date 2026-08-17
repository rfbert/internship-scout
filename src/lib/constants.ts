import type { RoleCategory, ScoreBand, WorkArrangement } from "@prisma/client";

/** Score component keys — weights must sum to 100. Configurable in Settings. */
export const SCORE_COMPONENTS = [
  "careerValue",
  "sponsorship",
  "roleAlignment",
  "companyQuality",
  "ugEligibility",
  "compensation",
  "locationFit",
  "freshness",
] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

// Priorities (2026-07 revision): role fit dominates — an AI-PM or PM role must
// outrank generic software; company future-sponsorship ability and company tier
// come next, because CPT covers the internship itself and the company's H-1B
// track record is what matters for the return offer.
export const DEFAULT_WEIGHTS: Record<ScoreComponent, number> = {
  careerValue: 15,
  sponsorship: 25,
  roleAlignment: 30,
  companyQuality: 20,
  ugEligibility: 3,
  compensation: 3,
  locationFit: 2,
  freshness: 2,
};

/** Band thresholds on the 0–100 overall score (order matters). */
export const BAND_THRESHOLDS: Array<{ band: ScoreBand; min: number }> = [
  { band: "EXCEPTIONAL", min: 85 },
  { band: "HIGH_PRIORITY", min: 75 },
  { band: "STRONG", min: 65 },
  { band: "WORTH_REVIEWING", min: 55 },
  { band: "REACH", min: 45 },
  { band: "LOW_PRIORITY", min: 0 },
];

export const BAND_ORDER: ScoreBand[] = [
  "EXCEPTIONAL",
  "HIGH_PRIORITY",
  "STRONG",
  "WORTH_REVIEWING",
  "REACH",
  "LOW_PRIORITY",
  "INELIGIBLE",
];

/** Role alignment: 0–100 subscore per category (user's ranked preferences). */
export const ROLE_ALIGNMENT_SCORES: Record<RoleCategory, number> = {
  AI_PRODUCT_MANAGEMENT: 100,
  PM_FOR_AI_PRODUCTS: 94,
  TECHNICAL_PM: 88,
  AI_ENGINEERING: 85,
  APPLIED_AI: 80,
  ML_ENGINEERING: 76,
  APM_PROGRAM: 70,
  PRODUCT_ROTATIONAL: 66,
  OTHER_EXCEPTIONAL: 60,
  DATA_SCIENCE: 45,
  RESEARCH: 40,
  // Generic software and everything else sit far below every product/AI
  // category — a plain SWE intern role must never outrank an AI/PM role.
  SOFTWARE_ENGINEERING: 15,
  OTHER: 10,
};

export const ARRANGEMENT_PREFERENCE_SCORES: Record<
  WorkArrangement,
  Record<WorkArrangement, number>
> = {
  // preferred → actual → subscore
  // User preference: in-person or hybrid preferred, but remote is acceptable.
  ONSITE: { ONSITE: 100, HYBRID: 92, REMOTE: 72, UNKNOWN: 78 },
  HYBRID: { ONSITE: 85, HYBRID: 100, REMOTE: 75, UNKNOWN: 70 },
  REMOTE: { ONSITE: 60, HYBRID: 80, REMOTE: 100, UNKNOWN: 70 },
  UNKNOWN: { ONSITE: 80, HYBRID: 80, REMOTE: 80, UNKNOWN: 70 },
};

/** Season detection: signals that a posting belongs to the target cycle. */
export const SEASON = "SUMMER_2027";

export interface SeasonPatterns {
  /** Canonical season key, e.g. "SUMMER_2027". */
  season: string;
  /** The season's calendar year, e.g. 2027. */
  year: number;
  positive: RegExp[];
  negative: RegExp[];
}

const SEASON_TERMS = ["summer", "fall", "winter", "spring"] as const;
const SEASON_KEY_RX = /^(SPRING|SUMMER|FALL|WINTER)_(20\d{2})$/;

/** "2027" → "20?27" (legacy shape: the leading zero is optional). */
const yearRxPart = (y: number): string => `20?${String(y).slice(2)}`;

/**
 * Two adjacent years as one pattern: (2026, 2027) → "20?2[67]". Falls back to
 * an alternation when the years straddle a decade boundary.
 */
function yearPairRxPart(a: number, b: number): string {
  const sa = String(a);
  const sb = String(b);
  if (sa.slice(0, 3) === sb.slice(0, 3)) return `20?${sb[2]}[${sa[3]}${sb[3]}]`;
  return `(?:${yearRxPart(a)}|${yearRxPart(b)})`;
}

/**
 * Build the season-detection patterns for an arbitrary "TERM_YYYY" cycle.
 * For the default SUMMER_2027 the generated regexes are byte-identical to the
 * legacy hard-coded lists (pinned by tests/unit/eligibility.test.ts).
 */
function generateSeasonPatterns(term: string, year: number): SeasonPatterns {
  const prior = year - 1;
  const others = SEASON_TERMS.filter((t) => t !== term); // e.g. [fall, winter, spring]
  const rx = (source: string) => new RegExp(source, "i");

  const positive: RegExp[] = [
    rx(`${term}\\s*${yearRxPart(year)}`),
    rx(`${yearRxPart(year)}\\s*${term}`),
    rx(`${year}\\s*(university\\s*)?intern`),
    rx(`intern(ship)?\\s*(-|—|–)?\\s*${year}`),
    rx(`undergraduate\\s+intern(ship)?\\s+${year}`),
    rx(`early\\s+careers?\\s+${year}`),
    rx(`university\\s+recruiting\\s+${year}`),
    // Rising seniors interning in summer of `year` graduate the year after.
    ...(term === "summer" ? [rx(`class\\s+of\\s+${year + 1}`)] : []),
  ];

  const negative: RegExp[] = [
    // `[,\s]*` (not `\s*`) so punctuated forms match too: "(Fall, 2026)".
    // Same term, prior cycle ("Summer 2026" for a Summer 2027 target).
    rx(`${term}[,\\s]*${yearRxPart(prior)}`),
    // Off-terms across the prior/target years. The first off-term keeps the
    // legacy split into two single-year patterns (prior first, target last)
    // so the default output stays byte-identical to the hand-written list.
    rx(`${others[0]}[,\\s]*${yearRxPart(prior)}`),
    rx(`${others[1]}[,\\s]*${yearPairRxPart(prior, year)}`),
    rx(`${others[2]}[,\\s]*${yearPairRxPart(prior, year)}`),
    rx(`${others[0]}[,\\s]*${yearRxPart(year)}`),
    // Reversed word order used by some ATSes: "2026 Fall", "2026 Summer".
    rx(`\\b${yearRxPart(prior)}[,\\s]*(${[others[0], term, others[1], others[2]].join("|")})\\b`),
    rx(`\\b${year}[,\\s]*(${others[0]}|${others[1]})\\b`),
    rx(`${yearRxPart(prior)}\\s*start`),
    /new\s*grad/i,
    // Explicit term dates that end inside the prior year — a Fall-2026 co-op
    // often never says "Fall 2026", only "September … through December 18, 2026".
    rx(
      `\\b(?:aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?)\\b[^.\\n]{0,60}\\b(?:through|to|[-–—])\\b[^.\\n]{0,60}\\b(?:dec(?:ember)?|nov(?:ember)?|jan(?:uary)?)\\b[^.\\n]{0,20}\\b${yearRxPart(prior)}\\b`,
    ),
    // A term named for another season with no year is still the wrong cycle
    // ("AI Engineering Fall Co-Op"). Requires an adjacent internship word so
    // prose like "fallback" or "spring release" is safe. "autumn" rides along
    // as a synonym whenever "fall" is an off-term.
    rx(`\\b(?:${offTermWords(term).join("|")})\\s+(?:co[\\s-]?op|internship|intern\\b)`),
    rx(`\\b(?:co[\\s-]?op|internship|intern)\\s+(?:-\\s*)?(?:${offTermWords(term).join("|")})\\b`),
    // Year-long / 12-month programs are not a single-season internship.
    /\byear\s+at\s+[a-z]/i,
    /\b12[\s-]month\b/i,
    /\b(?:one|1)[\s-]year\s+(?:full[\s-]time\s+)?program\b/i,
  ];

  return { season: `${term.toUpperCase()}_${year}`, year, positive, negative };
}

// Term words for the no-year off-season patterns, in the legacy order and with
// "autumn" riding along as a synonym of "fall".
const SEASON_TERM_WORDS = ["summer", "fall", "autumn", "spring", "winter"] as const;

function offTermWords(term: string): string[] {
  return SEASON_TERM_WORDS.filter((t) => t !== term && !(term === "fall" && t === "autumn"));
}

const seasonPatternCache = new Map<string, SeasonPatterns>();

/**
 * Season patterns for a user-configured target cycle. Unset/unknown values
 * fall back to the app default (SEASON). Results are memoized per season key.
 */
export function makeSeasonPatterns(season?: string | null): SeasonPatterns {
  const key = SEASON_KEY_RX.test(season ?? "") ? (season as string) : SEASON;
  let patterns = seasonPatternCache.get(key);
  if (!patterns) {
    const m = SEASON_KEY_RX.exec(key)!;
    patterns = generateSeasonPatterns(m[1].toLowerCase(), Number(m[2]));
    seasonPatternCache.set(key, patterns);
  }
  return patterns;
}

const DEFAULT_SEASON_PATTERNS = makeSeasonPatterns(SEASON);
export const SEASON_POSITIVE_PATTERNS: RegExp[] = DEFAULT_SEASON_PATTERNS.positive;
export const SEASON_NEGATIVE_PATTERNS: RegExp[] = DEFAULT_SEASON_PATTERNS.negative;

// Bumping this makes the daily agent re-assess and re-score every stored
// listing on its next run (see the rescore stage in src/agent/run.ts).
// v4: sponsorship rules no longer let an aggregator citizenship marker hard-reject
// a text-less listing (Akuna false-negative fix). Bump forces a rescore of all
// listings so the corrected verdicts replace the stale v3 ones.
// v5: role classifier no longer reads a bare "AI" in a business-function title
// ("AI Marketing Intern") as AI engineering. Bump forces a rescore so the
// affected listings lose their inflated role-alignment score.
// v6: rescore runs the real eligibility gates (UNPAID/grad-window restored,
// source-inferred seasons stay INFERRED), negated clearance mentions no longer
// hard-reject, new sponsorship-refusal phrasings hard-reject, and US towns
// sharing a foreign city's name (Vancouver WA, Dublin CA) count as US. Bump so
// the whole corpus re-assesses under the corrected rules.
export const CURRENT_ANALYSIS_VERSION = 6;

export const APP_NAME = "Internship Scout";
