import type { UgEligibility } from "@prisma/client";
import type { EligibilityResult, NormalizedPosting } from "@/lib/types";
import { makeSeasonPatterns } from "@/lib/constants";

// ── Gate 1: is it an internship at all? ──────────────────────────────────────
// Word boundaries so "Internal Tools Engineer" / "Cooperation Lead" do not pass.
const INTERNSHIP_TITLE_RX = /\b(?:intern(?:ship)?s?|co[\s-]?op)\b/i;

// ── Gate 4: degree-level signals ─────────────────────────────────────────────
const UNDERGRAD_RX: RegExp[] = [
  /\bundergrad(?:uate)?s?\b/i,
  /\bbachelor[’']?s?\b/i,
  /\bb\.?s\.?\s*[/,]\s*m\.?s\.?\b/i, // "BS/MS" and the comma form "BS, MS, or PhD"
  /\bba\s*\/\s*bs\b/i,
  /\bb\.?s\.?\s+(?:in|degree|or)\b/i,
  /\brising\s+(?:senior|junior)s?\b/i,
];

// Grad-level combos ("MS/PhD" is GRAD_ONLY, not PHD_ONLY).
const GRAD_RX: RegExp[] = [
  /\bm\.?s\.?\s*\/\s*ph\.?\s?d\.?/i,
  /\b(?:masters?|master[’']s|m\.?s\.?)\s+(?:or|and\/or)\s+ph\.?\s?d/i,
  /\b(?:grad|graduate)\s+(?:students?|degree|program)\b/i,
  /\bmaster[’']?s\b/i,
];

// An explicit graduate-level REQUIREMENT ("pursuing a Master's or PhD",
// "must be enrolled in a Master's program"). This outranks an incidental
// undergrad mention — postings that require an MS/PhD often still say the word
// "Bachelor's" (e.g. "Bachelor's holders will not be considered"), which used
// to let them through the gate as undergrad-eligible.
const GRAD_REQUIREMENT_RX: RegExp[] = [
  /(?:pursuing|enrolled\s+in|working\s+towards?|completed)\s+(?:a\s+|an\s+)?(?:master[’']?s?|m\.?s\.?)\s*(?:or|\/|and\/or)?\s*(?:ph\.?\s?d)?/i,
  /\b(?:master[’']?s?|m\.?s\.?)\s+(?:or|\/|and\/or)\s+ph\.?\s?d\b/i,
  /must\s+be\s+(?:currently\s+)?(?:enrolled|pursuing)[^.\n]{0,40}\b(?:master[’']?s?|ph\.?\s?d)\b/i,
  /\b(?:master[’']?s?|ph\.?\s?d)\b[^.\n]{0,30}\b(?:required|is\s+required)\b/i,
];

const PHD_RX = /\bph\.?\s?d\b/i;
// Description mentions only count as a *requirement* with level context —
// "collaborate with PhD scientists" must not trip the gate.
const PHD_REQUIREMENT_RX: RegExp[] = [
  /\bph\.?\s?d\.?\s*(?:students?|candidates?|interns?|programs?|degree|level|required|only)\b/i,
  /(?:pursuing|enrolled\s+in|working\s+towards?)\s+(?:a\s+|an\s+)?ph\.?\s?d/i,
  /\bph\.?\s?d\.?\s+in\s+[a-z]/i,
  /must\s+(?:be|hold)\s+a?\s*ph\.?\s?d/i,
  /^\s*[-•*]?\s*ph\.?\s?d\.?\s*$/im, // a bullet line that is just "PhD" / "- PhD"
];

// ── Graduation windows (parameterized on the user's graduation date) ─────────
// "Graduate before the internship starts" roles are effectively new-grad roles.
// Lookbehind keeps "must not graduate before ..." (returning-student language) safe.
// A stated graduation year that does not include the user's closes the role.
// Only fires when no accepted year is also offered — for a June 2028 grad,
// "graduating between December 2027 and September 2028" and "graduating in
// 2028" stay eligible. The regexes below are BUILT from the graduation year at
// call time; the defaults (grad June 2028, season year 2027) reproduce the
// legacy hard-coded patterns byte-for-byte — pinned by the .source assertions
// in tests/unit/eligibility.test.ts.

/** Alternation for an inclusive 20xx year range: (2010, 2026) → "20(?:1\d|2[0-6])". */
function yearRangeRxPart(from: number, to: number): string {
  const lo = Math.max(2000, from);
  const hi = Math.min(2099, to);
  const decades: string[] = [];
  for (let d = Math.floor(lo / 10); d <= Math.floor(hi / 10); d++) {
    const tens = d % 10; // third digit of the year
    const a = d * 10 < lo ? lo % 10 : 0;
    const b = d * 10 + 9 > hi ? hi % 10 : 9;
    if (a === 0 && b === 9) decades.push(`${tens}\\d`);
    else if (a === b) decades.push(`${tens}${a}`);
    // A two-digit run is written [89], not [8-9] — same language, and it keeps
    // the generated defaults textually identical to the legacy literals.
    else if (b === a + 1) decades.push(`${tens}[${a}${b}]`);
    else decades.push(`${tens}[${a}-${b}]`);
  }
  return `20(?:${decades.join("|")})`;
}

export interface GradWindows {
  /** A stated graduation year strictly before the user's. */
  requirementRx: RegExp;
  /** An accepted year at or after the user's graduation is also offered. */
  okRx: RegExp;
  /** "Must graduate before the internship" phrasings. */
  windowRx: RegExp[];
  /** Human label for notes, e.g. "June 2028". */
  gradLabel: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const gradWindowCache = new Map<string, GradWindows>();

const DEFAULT_GRAD_YEAR = 2028;
const DEFAULT_GRAD_LABEL = "June 2028";

export function makeGradWindows(
  graduationDate: Date | null | undefined,
  seasonYear: number,
): GradWindows {
  const gradYear = graduationDate?.getUTCFullYear() ?? DEFAULT_GRAD_YEAR;
  const gradLabel = graduationDate
    ? `${MONTH_NAMES[graduationDate.getUTCMonth()]} ${gradYear}`
    : DEFAULT_GRAD_LABEL;
  const key = `${gradLabel}|${seasonYear}`;
  const cached = gradWindowCache.get(key);
  if (cached) return cached;

  // Years 4 back through 1 back read as "graduates before the user".
  const tooEarly = yearRangeRxPart(gradYear - 4, gradYear - 1);
  // The user's year or later (through the visible horizon) reads as accepted.
  const okYears = yearRangeRxPart(gradYear, gradYear + 11);
  const okNearYears = yearRangeRxPart(gradYear, gradYear + 1);
  // "Must graduate by <year before the internship season>" is a new-grad role.
  const beforeSeason = yearRangeRxPart(2010, seasonYear - 1);

  const windows: GradWindows = {
    requirementRx: new RegExp(`\\bgraduat(?:e|ing|ion)\\b[^.\\n]{0,40}\\b${tooEarly}\\b`, "i"),
    okRx: new RegExp(
      `\\bgraduat(?:e|ing|ion)\\b[^.\\n]{0,60}\\b${okYears}\\b|\\b${okNearYears}\\b[^.\\n]{0,30}\\bgraduat`,
      "i",
    ),
    windowRx: [
      new RegExp(`must\\s+graduate\\s+by\\s+(?:[a-z]+\\s+)?${beforeSeason}\\b`, "i"),
      /(?<!not\s)\bgraduat(?:e|ing|ion)[^.\n]{0,40}?\b(?:before|prior\s+to)\s+(?:the\s+)?(?:internship|program|start)/i,
      new RegExp(
        `(?<!not\\s)\\bgraduat(?:e|ing|ion)(?:\\s+date)?\\s+(?:on\\s+or\\s+)?before\\s+(?:[a-z]+\\s+)?${beforeSeason}\\b`,
        "i",
      ),
    ],
    gradLabel,
  };
  gradWindowCache.set(key, windows);
  return windows;
}

// ── Gate 5: geography ────────────────────────────────────────────────────────
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC", "PR",
]);

const UNITED_STATES_RX = /\bunited\s+states\b/i;
// Case-sensitive on purpose: lowercase "us" is a pronoun, and state codes like
// "in"/"or"/"me" only count when written as uppercase codes.
const US_TOKEN_RX = /\b(?:USA|US)\b|\bU\.S\.(?:A\.?)?/;

// Lookbehind on "new " keeps "New Mexico" / "New England" from reading as foreign.
const NON_US_COUNTRIES = [
  "canada", "united kingdom", "u\\.k\\.", "(?<!new\\s)england", "scotland",
  "wales", "ireland", "france", "germany", "netherlands", "belgium",
  "luxembourg", "spain", "portugal", "italy", "switzerland", "austria",
  "poland", "czechia", "czech republic", "slovakia", "hungary", "romania",
  "bulgaria", "greece", "sweden", "norway", "denmark", "finland", "estonia",
  "latvia", "lithuania", "ukraine", "turkey", "israel",
  "united arab emirates", "saudi arabia", "qatar", "india", "pakistan",
  "bangladesh", "sri lanka", "nepal", "singapore", "malaysia", "indonesia",
  "philippines", "vietnam", "thailand", "china", "hong kong", "taiwan",
  "japan", "south korea", "korea", "australia", "new zealand", "brazil",
  "argentina", "chile", "colombia", "peru", "(?<!new\\s)mexico",
  "costa rica", "nigeria", "kenya", "south africa", "egypt", "morocco", "uk",
];
const NON_US_RX = new RegExp(`\\b(?:${NON_US_COUNTRIES.join("|")})\\b`, "i");

// Foreign CITIES that appear in internship titles without their country
// ("Software Engineer, Intern" @ Bengaluru; "Internship - London"). Kept apart
// from the country list so country matching stays unchanged. Several names
// collide with US towns (Vancouver WA, Dublin CA/OH, Melbourne FL, Toronto OH) —
// a US state code alongside the city resolves the collision in classifyLocation.
const NON_US_CITIES = [
  "london", "dublin", "edinburgh", "manchester", "paris", "berlin", "munich",
  "amsterdam", "zurich", "geneva", "stockholm", "copenhagen", "oslo",
  "helsinki", "warsaw", "krakow", "prague", "budapest", "lisbon", "madrid",
  "barcelona", "milan", "rome", "tel aviv", "dubai", "bengaluru", "bangalore",
  "hyderabad", "mumbai", "delhi", "pune", "chennai", "gurgaon", "noida",
  "karachi", "lahore", "dhaka", "kuala lumpur", "jakarta", "manila", "hanoi",
  "bangkok", "beijing", "shanghai", "shenzhen", "seoul", "tokyo", "osaka",
  "taipei", "sydney", "melbourne", "auckland", "wellington", "toronto",
  "vancouver", "montreal", "ottawa", "sao paulo", "buenos aires", "bogota",
  "santiago", "lima", "nairobi", "lagos", "cairo", "johannesburg",
];
const NON_US_CITY_RX = new RegExp(`\\b(?:${NON_US_CITIES.join("|")})\\b`, "i");
/** A place named in a title that puts the role outside the US. */
const TITLE_FOREIGN_RX = new RegExp(
  `\\b(?:${[...NON_US_COUNTRIES, ...NON_US_CITIES].join("|")})\\b`,
  "i",
);

const US_COUNTRY_FIELD_RX = /^(?:us|usa|u\.s\.a?\.?|united\s+states(?:\s+of\s+america)?)$/i;
const UNKNOWN_COUNTRY_FIELD_RX = /^(?:unknown|n\/a|remote|global|worldwide)$/i;

/**
 * Like firstMatch, but ignores a season that sits inside a GRADUATION
 * requirement. Databricks' "Product Management Intern (Summer 2027)" asks for
 * candidates "graduating in Fall 2027 or Spring 2028" — that Fall 2027 is when
 * the student finishes, not when the internship runs, and reading it as the
 * term hid the role entirely.
 */
function firstNonGraduationMatch(patterns: RegExp[], text: string): string | undefined {
  for (const rx of patterns) {
    const flags = rx.flags.includes("g") ? rx.flags : `${rx.flags}g`;
    for (const m of text.matchAll(new RegExp(rx.source, flags))) {
      const at = m.index ?? 0;
      // Look back a short window for graduation wording.
      const before = text.slice(Math.max(0, at - 60), at);
      if (/\bgraduat(?:e|es|ing|ion)\b[^.\n]{0,40}$/i.test(before)) continue;
      if (m[0]) return m[0].trim();
    }
  }
  return undefined;
}

function firstMatch(patterns: RegExp[], text: string): string | undefined {
  for (const rx of patterns) {
    const m = rx.exec(text);
    if (m && m[0]) return m[0].trim();
  }
  return undefined;
}

/**
 * seasonEvidence strings that mean "the season came from the source list, not
 * from the posting text". Two spellings exist in stored rows (evaluateEligibility
 * wrote the first; the ingest fallback wrote the second) — recognize both so a
 * rescore reconstructs INFERRED instead of upgrading the season to EXPLICIT.
 */
const SOURCE_IMPLIED_SEASON_EVIDENCE = [
  "listed on a Summer 2027-dedicated source",
  "Season-dedicated source list",
];

export function seasonEvidenceImpliesSource(evidence: string | null | undefined): boolean {
  return evidence != null && SOURCE_IMPLIED_SEASON_EVIDENCE.includes(evidence);
}

function hasUsStateCode(raw: string): boolean {
  const tokens = raw.match(/\b[A-Z]{2}\b/g);
  return tokens !== null && tokens.some((t) => US_STATE_CODES.has(t));
}

type LocationVerdict = "US" | "NON_US" | "UNKNOWN";

function classifyLocation(loc: NormalizedPosting["locations"][number]): LocationVerdict {
  const raw = loc.rawText ?? "";
  // Explicit US wording beats everything ("Remote (US or Canada)" is US-eligible).
  if (UNITED_STATES_RX.test(raw) || US_TOKEN_RX.test(raw)) return "US";
  // Named foreign country beats state codes ("Perth, WA, Australia" is not Washington).
  if (NON_US_RX.test(raw)) return "NON_US";
  // A bare foreign city with no country field ("Bengaluru") is still not the US.
  // But a US state code alongside the city ("Vancouver, WA", "Dublin, CA") names
  // the US town that shares the name — the state wins when no country is named.
  if (NON_US_CITY_RX.test(raw)) return hasUsStateCode(raw) ? "US" : "NON_US";
  if (hasUsStateCode(raw)) return "US";
  if (loc.state && US_STATE_CODES.has(loc.state.trim().toUpperCase())) return "US";
  const country = (loc.country ?? "").trim();
  if (US_COUNTRY_FIELD_RX.test(country)) return "US";
  if (NON_US_RX.test(country)) return "NON_US";
  if (country !== "" && !UNKNOWN_COUNTRY_FIELD_RX.test(country)) return "NON_US";
  return "UNKNOWN";
}

/**
 * User parameters the gates derive their windows from. All optional — absent
 * values fall back to the legacy hard-coded behavior (June 2028 grad,
 * SUMMER_2027 season), keeping the function fully deterministic.
 */
export interface EligibilityPrefs {
  graduationDate?: Date | null;
  targetSeason?: string | null;
}

/**
 * Stage 5 deterministic eligibility gates. All gates always run so the result
 * carries a complete picture; rejectReason is the first failing gate in the
 * documented order. Uncertainty (unknown season/location/pay) never rejects.
 */
export function evaluateEligibility(
  p: NormalizedPosting,
  opts: { sourceImpliesSeason: boolean; prefs?: EligibilityPrefs | null },
): EligibilityResult {
  const season = makeSeasonPatterns(opts.prefs?.targetSeason);
  const grad = makeGradWindows(opts.prefs?.graduationDate, season.year);
  const notes: string[] = [];
  let rejectReason: EligibilityResult["rejectReason"];
  const reject = (reason: NonNullable<EligibilityResult["rejectReason"]>) => {
    if (!rejectReason) rejectReason = reason;
  };

  const text = `${p.title}\n${p.description ?? ""}`;

  // 1. Must actually be an internship.
  const internKeyword = INTERNSHIP_TITLE_RX.exec(p.title)?.[0];
  if (internKeyword) {
    notes.push(`Internship keyword "${internKeyword}" found in title.`);
  } else {
    reject("NOT_AN_INTERNSHIP");
    notes.push(`Title "${p.title}" has no intern/internship/co-op keyword — not an internship.`);
  }

  // 2. Closed marker from the source.
  if (p.markers.closed) {
    reject("CLOSED");
    notes.push("Source marks this posting as closed.");
  } else {
    notes.push("Posting is open (no closed marker from source).");
  }

  // 3. Season. A negative signal is authoritative — it beats positive text and
  // any season implied by the source list.
  let seasonMatch: EligibilityResult["seasonMatch"];
  let seasonEvidence: string | undefined;
  const negative = firstNonGraduationMatch(season.negative, text);
  const positive = firstMatch(season.positive, text);
  if (negative) {
    seasonMatch = "NEGATIVE";
    seasonEvidence = negative;
    reject("WRONG_SEASON");
    notes.push(`Season signal "${negative}" indicates a cycle other than ${season.season} — rejected.`);
    if (positive) {
      notes.push(`Conflicting positive season signal "${positive}" also present; negative signal wins.`);
    }
    if (opts.sourceImpliesSeason) {
      notes.push("Source list implies Summer 2027, but explicit posting text overrides the source.");
    }
  } else if (positive) {
    seasonMatch = "EXPLICIT";
    seasonEvidence = positive;
    notes.push(`Explicit ${season.season} signal: "${positive}".`);
  } else if (opts.sourceImpliesSeason) {
    seasonMatch = "INFERRED";
    seasonEvidence = SOURCE_IMPLIED_SEASON_EVIDENCE[0];
    notes.push(`No season text in posting; inferred ${season.season} from the dedicated source list.`);
  } else {
    seasonMatch = "UNKNOWN";
    notes.push("No season signal found — kept (uncertainty is not rejection); verify the season manually.");
  }

  // 4. Undergraduate eligibility. An undergrad mention wins over grad mentions
  // ("BS/MS" postings accept undergrads).
  const ugSignal = firstMatch(UNDERGRAD_RX, text);
  const phdSignal = PHD_RX.exec(p.title)?.[0] ?? firstMatch(PHD_REQUIREMENT_RX, text);
  const gradSignal = firstMatch(GRAD_RX, text);
  // An explicit graduate-level requirement beats an incidental undergrad word:
  // "pursuing a Master's or PhD … Bachelor's holders will not be considered".
  const gradRequirement = firstMatch(GRAD_REQUIREMENT_RX, text);
  let ugEligibility: UgEligibility;
  // Only a master's-level requirement takes this branch; a PhD-only posting
  // keeps flowing to the PHD_ONLY classification below.
  if (
    gradRequirement &&
    /master|\bm\.?s\.?\b/i.test(gradRequirement) &&
    // Undergrad-inclusive degree lists keep the posting open: "BS/MS",
    // "BS, MS, or PhD", "Bachelor's, Master's, or PhD".
    !/\bb\.?s\.?\s*[/,]\s*m\.?s\.?\b/i.test(text) &&
    !/\bb\.?s\.?\b[^.\n]{0,10}\bm\.?s\.?\b[^.\n]{0,16}\bph\.?\s?d\b/i.test(text) &&
    !/\bbachelor[’']?s?\b[^.\n]{0,20}\b(?:master|ph\.?\s?d)/i.test(text)
  ) {
    ugEligibility = "GRAD_ONLY";
    reject("NOT_UNDERGRAD");
    notes.push(`Explicit graduate-level requirement ("${gradRequirement}") — closed to undergraduates.`);
  } else if (ugSignal) {
    ugEligibility = "UNDERGRAD_EXPLICIT";
    notes.push(`Undergraduate-eligible signal: "${ugSignal}".`);
  } else if (phdSignal && !gradSignal) {
    ugEligibility = "PHD_ONLY";
    reject("NOT_UNDERGRAD");
    notes.push(`PhD-level requirement ("${phdSignal}") with no undergraduate mention — rejected.`);
  } else if (gradSignal) {
    ugEligibility = "GRAD_ONLY";
    reject("NOT_UNDERGRAD");
    notes.push(`Graduate-level requirement ("${gradSignal}") with no undergraduate mention — rejected.`);
  } else {
    ugEligibility = "AMBIGUOUS";
    notes.push("No degree-level signal found — treating as ambiguous (undergrad-possible).");
  }
  // A graduation-year requirement that excludes the user's graduation closes the role.
  const gradYear = grad.requirementRx.exec(text)?.[0];
  if (gradYear && !grad.okRx.test(text)) {
    reject("NOT_UNDERGRAD");
    notes.push(
      `Graduation-year requirement ("${gradYear.trim()}") does not include a ${grad.gradLabel} graduation.`,
    );
  }

  const gradWindow = firstMatch(grad.windowRx, text);
  if (gradWindow) {
    reject("NOT_UNDERGRAD");
    notes.push(`Graduation-window requirement ("${gradWindow}") means graduating before the internship — rejected.`);
  }

  // 5. Geography: reject only when every location is confidently non-US.
  // A country named in the TITLE is authoritative and overrides the location
  // rows: aggregator/ATS feeds often carry a stale HQ address (Palantir's
  // "Internship - Poland" was stored as "New York, NY"), which would otherwise
  // score a role abroad as US-eligible.
  // A named country in the title always wins; a foreign-city name yields to a
  // US state code in the same title ("Intern - Dublin, CA" is California).
  const titleForeign = TITLE_FOREIGN_RX.exec(p.title)?.[0];
  const titleIsForeign =
    titleForeign !== undefined && (NON_US_RX.test(p.title) || !hasUsStateCode(p.title));
  if (titleForeign && titleIsForeign) {
    reject("NOT_US");
    notes.push(
      `Title names a non-US location ("${titleForeign}") — role is outside the US regardless of the listed location.`,
    );
    return {
      eligible: false,
      rejectReason: "NOT_US",
      seasonMatch,
      ...(seasonEvidence ? { seasonEvidence } : {}),
      ugEligibility,
      isUS: false,
      isPaid: p.compensation.payType === "UNPAID" ? false : p.compensation.payType === "UNKNOWN" ? "UNKNOWN" : true,
      notes,
    };
  }

  let usCount = 0;
  let nonUsCount = 0;
  let unknownCount = 0;
  const nonUsExamples: string[] = [];
  for (const loc of p.locations) {
    const verdict = classifyLocation(loc);
    if (verdict === "US") usCount++;
    else if (verdict === "NON_US") {
      nonUsCount++;
      nonUsExamples.push(loc.rawText);
    } else unknownCount++;
  }
  let isUS: boolean;
  if (usCount > 0) {
    isUS = true;
    notes.push(
      nonUsCount > 0
        ? `US location present alongside international location(s) (${nonUsExamples.join("; ")}) — kept.`
        : "US location confirmed.",
    );
  } else if (nonUsCount > 0 && unknownCount === 0) {
    isUS = false;
    reject("NOT_US");
    notes.push(`All locations are outside the US (${nonUsExamples.join("; ")}) — rejected.`);
  } else if (nonUsCount > 0) {
    isUS = false;
    notes.push(
      `Non-US location(s) (${nonUsExamples.join("; ")}) alongside unresolved location(s) — kept for manual review.`,
    );
  } else {
    isUS = false;
    notes.push(
      p.locations.length === 0
        ? "No location information — kept; verify US eligibility manually."
        : "Location(s) could not be resolved to a country — kept; verify US eligibility manually.",
    );
  }

  // 6. Paid.
  let isPaid: boolean | "UNKNOWN";
  if (p.compensation.payType === "UNPAID") {
    isPaid = false;
    reject("UNPAID");
    notes.push("Role is explicitly unpaid — rejected.");
  } else if (p.compensation.payType === "UNKNOWN") {
    isPaid = "UNKNOWN";
    notes.push("No compensation information — kept; confirm the role is paid.");
  } else {
    isPaid = true;
    const rawComp = p.compensation.rawText ? `: ${p.compensation.rawText}` : "";
    notes.push(`Paid role (${p.compensation.payType.toLowerCase()}${rawComp}).`);
  }

  return {
    eligible: !rejectReason,
    ...(rejectReason ? { rejectReason } : {}),
    seasonMatch,
    ...(seasonEvidence ? { seasonEvidence } : {}),
    ugEligibility,
    isUS,
    isPaid,
    notes,
  };
}

/**
 * Whether a rescore should reopen a previously auto-archived listing.
 *
 * A listing auto-rejected by a hard-reject that no longer applies (e.g. an
 * aggregator citizenship marker that has since been demoted) must not stay
 * Ineligible — the brief forbids marking Ineligible without conflicting
 * evidence. Only AUTO decisions (note begins "Auto-rejected:") are reopened;
 * a user's own manual ineligible decision is always left untouched.
 */
export function shouldReopenAutoRejection(
  decision: { state: string; note: string | null } | null,
  verdict: { band: string; hardReject: boolean; status: string },
): boolean {
  if (!decision || decision.state !== "MARKED_INELIGIBLE") return false;
  // Judge by the FIRST line: a pure auto note ("Auto-rejected: …" from ingest,
  // "Auto-archived at rescore: …" from a version bump) is reopenable; any note
  // that leads with the user's own words marks a human decision — untouchable.
  const firstLine = (decision.note ?? "").trim().split("\n", 1)[0];
  if (!/^Auto-(?:rejected:|archived at rescore:)/.test(firstLine)) return false;
  return verdict.band !== "INELIGIBLE" && !verdict.hardReject && verdict.status === "ACTIVE";
}
