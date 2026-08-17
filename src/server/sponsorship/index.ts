import type { SponsorshipCategory, SponsorshipConfidence } from "@prisma/client";
import type { SponsorshipRuleResult } from "@/lib/types";

export interface SponsorshipRuleInput {
  /** Full listing text (title + description + requirements) concatenated by the caller. */
  text: string;
  /** Aggregator legend markers from GitHub lists: 🇺🇸 citizenship, 🛂 no sponsorship. */
  markers?: { citizenshipRequired?: boolean; noSponsorship?: boolean };
  companyHasHistory?: boolean;
}

type Signal = "HARD_NEG" | "SOFT_NEG" | "POSITIVE";

interface PhraseRule {
  signal: Signal;
  category: SponsorshipCategory;
  confidence: SponsorshipConfidence;
  /** Lower wins when several rules of the same signal class match. */
  rank: number;
  pattern: RegExp;
}

interface Match {
  signal: Signal;
  category: SponsorshipCategory;
  confidence: SponsorshipConfidence;
  rank: number;
  start: number;
  end: number;
  /** Containing sentence, trimmed and clamped to MAX_QUOTE_LENGTH. */
  quote: string;
  /** Full containing sentence — used for strengthener detection. */
  sentence: string;
}

const rule = (
  signal: Signal,
  category: SponsorshipCategory,
  confidence: SponsorshipConfidence,
  rank: number,
  pattern: RegExp,
): PhraseRule => ({ signal, category, confidence, rank, pattern });

const RULES: PhraseRule[] = [
  // ── Hard reject: citizenship / permanent residency (both exclude F-1 students) ──
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /must\s+be\s+(?:a\s+)?u\.?s\.?\s+citizen/gi),
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /u\.?s\.?\s+citizenship\s+(?:is\s+)?required/gi),
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /requires?\s+u\.?s\.?\s+citizenship/gi),
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /\bcitizens\s+only\b/gi),
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /must\s+be\s+(?:a\s+)?(?:u\.?s\.?\s+)?(?:lawful\s+)?permanent\s+resident/gi),
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /green\s*card\s+holders?\s+only/gi),
  // ── Hard reject: export control / "U.S. Person" (ITAR & EAR) ──
  // A "U.S. Person" is a citizen, permanent resident or protected individual —
  // an F-1 student on CPT/OPT does not qualify, so these roles are closed.
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /u\.?s\.?\s*person(?:\s+status)?\s+(?:is\s+)?(?:required|status)/gi),
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /must\s+(?:be|qualify\s+as)\s+(?:an?\s+)?u\.?s\.?\s*person/gi),
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /applicants?\s+must\s+be\s+u\.?s\.?\s*persons?/gi),
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /\bu\.?s\.?\s*persons?\b[^.\n]{0,40}\b(?:itar|ear)\b/gi),
  rule("HARD_NEG", "CITIZENSHIP_REQUIRED", "CONFIRMED", 0, /\b(?:itar|ear)\b[^.\n]{0,40}\bu\.?s\.?\s*persons?\b/gi),
  // ── Hard reject: security clearance (implies citizenship) ──
  // Real postings put qualifiers between the words: "Active US Security
  // clearance", "Active Full Scope Poly Level clearance", "active TS/SCI
  // clearance". Allow up to a few tokens before "clearance".
  rule("HARD_NEG", "CLEARANCE_REQUIRED", "CONFIRMED", 1, /\bactive\b[^.\n]{0,40}\bclearance\b/gi),
  rule("HARD_NEG", "CLEARANCE_REQUIRED", "CONFIRMED", 1, /ability\s+to\s+obtain[^.\n]{0,40}\bclearance\b/gi),
  rule("HARD_NEG", "CLEARANCE_REQUIRED", "CONFIRMED", 1, /\bclearance\b[^.\n]{0,20}\b(?:is\s+)?required\b/gi),
  rule("HARD_NEG", "CLEARANCE_REQUIRED", "CONFIRMED", 1, /\b(?:ts\/sci|top\s+secret|full\s+scope\s+poly\w*|polygraph)\b[^.\n]{0,30}\bclearance\b/gi),
  rule("HARD_NEG", "CLEARANCE_REQUIRED", "CONFIRMED", 1, /\bclearance\b[^.\n]{0,30}\b(?:ts\/sci|top\s+secret|full\s+scope\s+poly\w*)\b/gi),
  // ── Hard reject: sponsorship explicitly refused ──
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /must\s+not\s+require\s+(?:visa\s+)?sponsorship\s+now\s+or\s+in\s+the\s+future/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /without\s+the\s+need\s+for\s+(?:visa\s+)?sponsorship\s+now\s+or\s+in\s+the\s+future/gi),
  // Reversed word order: "without a current or future need for visa sponsorship".
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /without\s+(?:a\s+)?current\s+or\s+future\s+(?:need\s+for\s+)?(?:visa\s+)?sponsorship/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /(?:not\s+(?:require|need)|no)\s+(?:visa\s+)?sponsorship\s+(?:now\s+or\s+in\s+the\s+future|currently\s+or\s+in\s+the\s+future)/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /we\s+do\s+not\s+(?:currently\s+)?(?:offer\s+|provide\s+)?sponsor/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /does\s+not\s+(?:offer|provide)\s+(?:visa\s+|h[-\s]?1b\s+)?sponsorship/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /unable\s+to\s+sponsor/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /(?:will\s+not|won'?t)\s+sponsor/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /can\s?not\s+sponsor/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /no\s+visa\s+sponsorship/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /does\s+not\s+sponsor\s+(?:employment\s+)?visas?/gi),
  // ATS boilerplate variants: "not able to sponsor", "not eligible for visa/
  // immigration sponsorship", "cannot provide sponsorship". The lookbehind keeps
  // the hedged "may/might not be able to sponsor" from hard-rejecting.
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /(?<!may\s)(?<!might\s)\bnot\s+(?:be\s+)?able\s+to\s+(?:sponsor|provide\s+(?:visa\s+)?sponsorship)/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /not\s+eligible\s+for\s+(?:visa|immigration|work\s+authorization|h[-\s]?1b)\s+sponsorship/gi),
  rule("HARD_NEG", "EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE", 2, /can\s?not\s+(?:provide|offer)\s+(?:visa\s+)?sponsorship/gi),
  // ── Hard reject: permanent/unrestricted authorization (F-1 CPT/OPT is restricted) ──
  rule("HARD_NEG", "UNRESTRICTED_AUTH_REQUIRED", "CONFIRMED", 3, /permanent[,\s]+unrestricted\s+work\s+authorization/gi),
  rule("HARD_NEG", "UNRESTRICTED_AUTH_REQUIRED", "CONFIRMED", 3, /unrestricted\s+authorization\s+to\s+work/gi),
  // ── Positive: sponsorship offered ──
  rule("POSITIVE", "SPONSORSHIP_OFFERED", "HIGH", 0, /visa\s+sponsorship\s+(?:is\s+)?available/gi),
  rule("POSITIVE", "SPONSORSHIP_OFFERED", "HIGH", 0, /\bwill\s+sponsor\b/gi),
  rule("POSITIVE", "SPONSORSHIP_OFFERED", "HIGH", 0, /sponsorship\s+(?:is\s+)?(?:provided|offered)/gi),
  // Lookbehind keeps "no/not offer/without … h-1b sponsorship" from reading as positive.
  rule("POSITIVE", "SPONSORSHIP_OFFERED", "HIGH", 0, /(?<!\b(?:no|not|without)\s(?:\w+\s){0,2})h[-\s]?1b\s+sponsorship/gi),
  // ── Positive: CPT/OPT. Acronyms matched case-sensitively so the common word
  // "opt" (opt in / opt out) never triggers. ──
  rule("POSITIVE", "CPT_OPT_ACCEPTED", "HIGH", 1, /\bCPT\b/g),
  rule("POSITIVE", "CPT_OPT_ACCEPTED", "HIGH", 1, /\bOPT\b/g),
  rule("POSITIVE", "CPT_OPT_ACCEPTED", "HIGH", 1, /\bF-1\b/gi),
  rule("POSITIVE", "CPT_OPT_ACCEPTED", "HIGH", 1, /international\s+students?\s+(?:are\s+)?(?:welcome|encouraged)/gi),
  // ── Positive: future possibility only ──
  rule("POSITIVE", "FUTURE_POSSIBLE", "MODERATE", 2, /may\s+be\s+eligible\s+for\s+(?:visa\s+)?sponsorship/gi),
  rule("POSITIVE", "FUTURE_POSSIBLE", "MODERATE", 2, /sponsorship\s+(?:may\s+be\s+|will\s+be\s+|is\s+)?considered/gi),
  // ── Flag-not-reject: internship "no sponsorship" language usually refers to H-1B,
  // which F-1 CPT internships do not need. Escalated to a hard reject only when the
  // "now or in the future" strengthener appears in the same sentence. ──
  rule("SOFT_NEG", "UNCERTAIN", "LOW", 0, /sponsorship\s+(?:is\s+)?not\s+available(?:\s+for\s+this\s+(?:role|position|internship))?/gi),
  rule("SOFT_NEG", "UNCERTAIN", "LOW", 0, /no\s+sponsorship\s+for\s+this\s+(?:role|position|internship)/gi),
  rule("SOFT_NEG", "UNCERTAIN", "LOW", 0, /no\s+h[-\s]?1b\s+sponsorship/gi),
];

const STRENGTHENER = /now\s+or\s+in\s+the\s+future/i;
// "clearance is not required" / "no security clearance required" / "does not
// require an active security clearance" — a negated clearance mention must
// never fire the clearance hard-reject.
const CLEARANCE_NEGATION_RX =
  /\b(?:no|not|without)\b(?:\s+\w+){0,4}\s+clearance\b|\bclearance\b[^.\n]{0,24}\bnot\s+required\b|\bclearance\s+is\s+not\b/i;
const STEM_TERMS = /\b(?:software|engineer(?:ing)?|computer\s+science|machine\s+learning|artificial\s+intelligence|data)\b/i;
// Uppercase-only so prose words ("ai", "ml") never trigger.
const STEM_ACRONYMS = /\b(?:AI|ML)\b/;

const MARKER_CITIZENSHIP_QUOTE = "Source marker 🇺🇸: U.S. citizenship required";
const MARKER_NO_SPONSORSHIP_QUOTE = "Source marker 🛂: does not offer sponsorship";

/**
 * Reconstruct aggregator markers from a prior assessment's stored quotes.
 * Markers are not persisted raw, so the 🇺🇸 / 🛂 quote left in `matchedText` is
 * the record. Keyed off the emoji (not the category) so a citizenship marker is
 * never mistaken for a no-sponsorship one across rescores.
 */
export function reconstructMarkersFromQuotes(quotes: string[]): {
  citizenshipRequired?: boolean;
  noSponsorship?: boolean;
} {
  const markers: { citizenshipRequired?: boolean; noSponsorship?: boolean } = {};
  if (quotes.some((q) => q.includes("🇺🇸"))) markers.citizenshipRequired = true;
  if (quotes.some((q) => q.includes("🛂"))) markers.noSponsorship = true;
  return markers;
}

const MAX_QUOTE_LENGTH = 200;

/**
 * The persisted explanation, with non-blocking warnings folded in. The schema
 * has no warnings column, and a caveat that only lives in memory is a caveat
 * the user never sees — so it rides along in the explanation text.
 */
export function explanationWithWarnings(s: SponsorshipRuleResult): string {
  if (!s.warnings?.length) return s.explanation;
  return [s.explanation, ...s.warnings.map((w) => `⚠ ${w}`)].join("\n");
}

const HARD_EXPLANATIONS: Partial<Record<SponsorshipCategory, string>> = {
  CITIZENSHIP_REQUIRED:
    "The listing requires U.S. citizenship or permanent residency, which excludes F-1 international students.",
  CLEARANCE_REQUIRED:
    "The listing requires a security clearance, which in practice requires U.S. citizenship and excludes F-1 international students.",
  EXPLICITLY_UNAVAILABLE:
    "The listing explicitly states that visa sponsorship is not offered.",
  UNRESTRICTED_AUTH_REQUIRED:
    "The listing requires permanent, unrestricted work authorization, which F-1 students on CPT or OPT do not hold.",
};

const POSITIVE_EXPLANATIONS: Partial<Record<SponsorshipCategory, string>> = {
  SPONSORSHIP_OFFERED:
    "The listing states that visa sponsorship is available for this role. Confirm the specifics with the employer before relying on it.",
  CPT_OPT_ACCEPTED:
    "The listing references CPT/OPT or welcomes international students, which suggests F-1 students can participate. Confirm the details with the recruiter.",
  FUTURE_POSSIBLE:
    "The listing suggests sponsorship may be possible but does not commit to it. Treat this as a possibility, not a promise.",
};

const FLAG_TEXT_EXPLANATION =
  "The listing says sponsorship is not available, but F-1 CPT internships do not require employer H-1B sponsorship — the phrase likely refers to H-1B. Verify with the recruiter before discarding.";
const FLAG_MARKER_EXPLANATION =
  "The source list marks this role as offering no sponsorship, but F-1 CPT internships do not require employer H-1B sponsorship — the marker likely refers to H-1B. Verify with the recruiter before discarding.";
const FLAG_CITIZENSHIP_MARKER_EXPLANATION =
  "A community-maintained source list flags this role as citizenship-required, but that marker is not authoritative and the official posting was not retrieved — these markers are frequently stale or role-generic. This is not a confirmed requirement. Verify against the official posting or recruiter before ruling it out.";
const CPT_NOT_MENTIONED_WARNING =
  "CPT is not explicitly mentioned in the posting; confirm CPT acceptance when you apply (pre-graduation internships typically use CPT).";
const CONFLICT_EXPLANATION =
  "The listing mixes positive and negative sponsorship signals, so no automatic conclusion is drawn. Manual review is needed — verify with the recruiter.";
const HISTORY_EXPLANATION =
  "The listing itself says nothing about sponsorship, but the company has a verified sponsorship history. Treat this as encouraging rather than a commitment for this role.";
const NO_INFO_EXPLANATION =
  "No work-authorization or sponsorship language was found in the listing.";

const BOUNDARY_CHARS = new Set(["\n", "\r", "!", "?", ";", ":", "•", "|"]);

function isSentenceBoundary(text: string, i: number): boolean {
  const ch = text[i];
  if (BOUNDARY_CHARS.has(ch)) return true;
  if (ch !== ".") return false;
  const prev = text[i - 1] ?? "";
  const next = text[i + 1] ?? "";
  if (/\d/.test(prev) && /\d/.test(next)) return false; // decimal, e.g. "3.5 GPA"
  // A single-letter token before the period ("U.S.", "e.g.") is an abbreviation.
  if (/[A-Za-z]/.test(prev)) {
    const prev2 = text[i - 2] ?? "";
    if (prev2 === "" || prev2 === "." || !/[A-Za-z0-9]/.test(prev2)) return false;
  }
  return true;
}

function sentenceBounds(text: string, start: number, end: number): [number, number] {
  let s = start;
  while (s > 0 && !isSentenceBoundary(text, s - 1)) s--;
  let e = end;
  while (e < text.length && !isSentenceBoundary(text, e)) e++;
  if (e < text.length && /[.!?]/.test(text[e])) e++;
  return [s, e];
}

function clampQuote(sentence: string, matchOffset: number): string {
  const trimmed = sentence.trim();
  if (trimmed.length <= MAX_QUOTE_LENGTH) return trimmed;
  const lead = sentence.length - sentence.trimStart().length;
  const offset = Math.max(0, matchOffset - lead);
  const begin = Math.max(0, Math.min(offset - 60, trimmed.length - MAX_QUOTE_LENGTH));
  return trimmed.slice(begin, begin + MAX_QUOTE_LENGTH).trim();
}

function pickBest(matches: Match[]): Match {
  return [...matches].sort((a, b) => a.rank - b.rank || a.start - b.start)[0];
}

function collectQuotes(
  matches: Match[],
  markerCitizenship: boolean,
  markerNoSponsorship: boolean,
): string[] {
  const quotes: string[] = [];
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.quote && !quotes.includes(m.quote)) quotes.push(m.quote);
  }
  if (markerCitizenship) quotes.push(MARKER_CITIZENSHIP_QUOTE);
  if (markerNoSponsorship) quotes.push(MARKER_NO_SPONSORSHIP_QUOTE);
  return quotes;
}

function futurePotential(
  category: SponsorshipCategory,
  hardReject: boolean,
  hasHistory: boolean,
): SponsorshipRuleResult["futureSponsorshipPotential"] {
  if (hardReject) return "UNLIKELY"; // history never upgrades an explicit refusal
  if (category === "SPONSORSHIP_OFFERED" || category === "CPT_OPT_ACCEPTED") return "LIKELY";
  if (hasHistory) return "LIKELY";
  if (category === "FUTURE_POSSIBLE" || category === "NO_INFO") return "POSSIBLE";
  return "UNKNOWN";
}

export function assessSponsorshipRules(input: SponsorshipRuleInput): SponsorshipRuleResult {
  const text = input.text ?? "";
  const markerCitizenship = input.markers?.citizenshipRequired === true;
  const markerNoSponsorship = input.markers?.noSponsorship === true;
  const hasHistory = input.companyHasHistory === true;

  const hard: Match[] = [];
  const soft: Match[] = [];
  let positives: Match[] = [];

  for (const r of RULES) {
    for (const m of text.matchAll(r.pattern)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const [s, e] = sentenceBounds(text, start, end);
      const sentence = text.slice(s, e);
      if (r.category === "CLEARANCE_REQUIRED" && CLEARANCE_NEGATION_RX.test(sentence)) continue;
      const match: Match = {
        signal: r.signal,
        category: r.category,
        confidence: r.confidence,
        rank: r.rank,
        start,
        end,
        sentence,
        quote: clampQuote(sentence, start - s),
      };
      if (r.signal === "SOFT_NEG" && STRENGTHENER.test(sentence)) {
        hard.push({
          ...match,
          signal: "HARD_NEG",
          category: "EXPLICITLY_UNAVAILABLE",
          confidence: "EXPLICITLY_UNAVAILABLE",
          rank: 2,
        });
      } else if (r.signal === "HARD_NEG") hard.push(match);
      else if (r.signal === "SOFT_NEG") soft.push(match);
      else positives.push(match);
    }
  }

  // A "positive" phrase inside a negated span (e.g. "no visa sponsorship available")
  // is an artifact of overlapping patterns, not a real signal.
  const negatives = [...hard, ...soft];
  positives = positives.filter(
    (p) => !negatives.some((n) => p.start < n.end && n.start < p.end),
  );

  const matchedText = collectQuotes(
    [...hard, ...soft, ...positives],
    markerCitizenship,
    markerNoSponsorship,
  );
  const stemOptRelevant =
    STEM_TERMS.test(text) || STEM_ACRONYMS.test(text) ? true : undefined;
  const hasNegative =
    hard.length > 0 || soft.length > 0 || markerCitizenship || markerNoSponsorship;

  let category: SponsorshipCategory;
  let confidence: SponsorshipConfidence;
  let hardReject = false;
  let conflictingInfo: string | undefined;
  let explanation: string;

  if (positives.length > 0 && hasNegative) {
    const pos = pickBest(positives);
    const neg = hard.length > 0 ? pickBest(hard) : soft.length > 0 ? pickBest(soft) : undefined;
    const negQuote =
      neg?.quote ??
      (markerCitizenship ? MARKER_CITIZENSHIP_QUOTE : MARKER_NO_SPONSORSHIP_QUOTE);
    category = "UNCERTAIN";
    confidence = "LOW";
    conflictingInfo = `Positive signal "${pos.quote}" conflicts with negative signal "${negQuote}".`;
    explanation = CONFLICT_EXPLANATION;
  } else if (hard.length > 0) {
    // Only role-specific hard TEXT (e.g. "must be a U.S. citizen") is authoritative
    // enough to reject. An aggregator citizenship marker is NOT — it falls through
    // to the flag branch below, so a stale community emoji can never mark Ineligible.
    hardReject = true;
    const best = pickBest(hard);
    category = best.category;
    confidence = best.confidence;
    explanation = HARD_EXPLANATIONS[category] ?? NO_INFO_EXPLANATION;
  } else if (soft.length > 0 || markerNoSponsorship || markerCitizenship) {
    category = "UNCERTAIN";
    confidence = "LOW";
    explanation =
      soft.length > 0
        ? FLAG_TEXT_EXPLANATION
        : markerCitizenship
          ? FLAG_CITIZENSHIP_MARKER_EXPLANATION
          : FLAG_MARKER_EXPLANATION;
  } else if (positives.length > 0) {
    const best = pickBest(positives);
    category = best.category;
    confidence = best.confidence;
    explanation = POSITIVE_EXPLANATIONS[best.category] ?? NO_INFO_EXPLANATION;
  } else if (hasHistory) {
    category = "COMPANY_HISTORY";
    confidence = "MODERATE";
    explanation = HISTORY_EXPLANATION;
  } else {
    category = "NO_INFO";
    confidence = "UNKNOWN";
    explanation = NO_INFO_EXPLANATION;
  }

  // Non-blocking caveats. Akuna's posting says OPT/STEM but not CPT — a pre-grad
  // internship uses CPT, so flag the gap without downgrading eligibility.
  const warnings: string[] = [];
  if (category === "CPT_OPT_ACCEPTED" && !/\bCPT\b/.test(text)) {
    warnings.push(CPT_NOT_MENTIONED_WARNING);
  }

  return {
    category,
    confidence,
    hardReject,
    matchedText,
    conflictingInfo,
    cptCompatible: !hardReject,
    optCompatible: !hardReject,
    stemOptRelevant,
    futureSponsorshipPotential: futurePotential(category, hardReject, hasHistory),
    explanation,
    ...(warnings.length ? { warnings } : {}),
  };
}
