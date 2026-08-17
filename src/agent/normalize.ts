import type { PayType, WorkArrangement } from "@prisma/client";
import {
  normalizeCompany,
  normalizeTitle,
  normalizeUrl,
  sha256,
} from "@/lib/normalize";
import type { NormalizedPosting, RawPosting } from "@/lib/types";

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
    " "
  )
);

const STATE_NAMES: Record<string, string> = {
  california: "CA", texas: "TX", "new york": "NY", washington: "WA", massachusetts: "MA",
  illinois: "IL", georgia: "GA", florida: "FL", colorado: "CO", oregon: "OR", virginia: "VA",
  pennsylvania: "PA", arizona: "AZ", michigan: "MI", minnesota: "MN", "north carolina": "NC",
  ohio: "OH", utah: "UT", tennessee: "TN", nevada: "NV", maryland: "MD", connecticut: "CT",
  wisconsin: "WI", indiana: "IN", missouri: "MO", "new jersey": "NJ", delaware: "DE",
  nebraska: "NE", arkansas: "AR", "district of columbia": "DC",
};

// Countries and cities are separate because they rank differently against a
// US state code (see the override in parseLocation).
const NON_US_COUNTRY_MARKERS =
  /\b(united kingdom|uk\b|germany|canada(?!\s*\+)|netherlands|india|singapore|japan|china|australia|ireland|france|israel|mexico(?! city, us)|brazil|cayman)\b/i;
const NON_US_CITY_MARKERS =
  /\b(london|berlin|toronto|vancouver|amsterdam|tokyo|shanghai|sydney|dublin|paris|tel aviv)\b/i;

// Same check as classifyLocation in src/server/eligibility (not exported from
// there). Case-sensitive on purpose: lowercase "in"/"or"/"me" are words.
function hasUsStateCode(raw: string): boolean {
  const tokens = raw.match(/\b[A-Z]{2}\b/g);
  return tokens !== null && tokens.some((t) => US_STATES.has(t));
}

// Canadian province codes are disjoint from US state codes, so they can break
// the "Toronto, ON, CA" tie: the trailing ISO country token reads as
// California, but a province code alongside it is decisive for Canada — as
// long as every US-state hit is the ambiguous "CA" itself.
const CA_PROVINCES = new Set("ON BC QC AB MB SK NS NB NL PE YT NT NU".split(" "));

function readsAsCanada(raw: string): boolean {
  const tokens = raw.match(/\b[A-Z]{2}\b/g) ?? [];
  return (
    tokens.some((t) => CA_PROVINCES.has(t)) &&
    tokens.filter((t) => US_STATES.has(t)).every((t) => t === "CA")
  );
}

export interface ParsedLocation {
  rawText: string;
  city?: string;
  state?: string;
  country: string;
  isRemote: boolean;
}

export function parseLocation(raw: string): ParsedLocation {
  const text = raw.replace(/\s+/g, " ").trim();
  const isRemote = /\bremote\b/i.test(text);
  const lower = text.toLowerCase();

  if (
    (NON_US_COUNTRY_MARKERS.test(lower) || NON_US_CITY_MARKERS.test(lower)) &&
    !/\b(us|usa|united states)\b/i.test(lower)
  ) {
    // A named foreign country always wins ("Perth, WA, Australia" is not
    // Washington), but a bare foreign-city name yields to a US state code in
    // the same text: "Vancouver, WA" / "Dublin, OH" are the US towns sharing
    // the name. Mirrors classifyLocation in src/server/eligibility (v6 fix).
    if (
      NON_US_COUNTRY_MARKERS.test(lower) ||
      !hasUsStateCode(text) ||
      readsAsCanada(text)
    ) {
      if (readsAsCanada(text)) {
        return { rawText: text, country: "CA", isRemote };
      }
      return { rawText: text, country: guessCountry(lower), isRemote };
    }
  }

  // "City, ST" or "City, State Name"
  const m = text.match(/^([^,]+),\s*([A-Za-z .]+?)(?:\s*\+\d+)?$/);
  if (m) {
    const cityRaw = m[1].replace(/\bremote\b\s*-?\s*/i, "").trim();
    const statePart = m[2].trim();
    const code = statePart.toUpperCase();
    if (US_STATES.has(code)) {
      return { rawText: text, city: cityRaw || undefined, state: code, country: "US", isRemote };
    }
    const mapped = STATE_NAMES[statePart.toLowerCase()];
    if (mapped) {
      return { rawText: text, city: cityRaw || undefined, state: mapped, country: "US", isRemote };
    }
  }
  if (/\b(usa|united states|us)\b/i.test(lower) || isRemote) {
    return { rawText: text, country: "US", isRemote };
  }
  // Unknown format — a Canadian province beside only-"CA" state hits means the
  // ISO country token, not California ("Mississauga, ON, CA").
  if (readsAsCanada(text)) return { rawText: text, country: "CA", isRemote };
  // Otherwise assume US only if it contains a known state code token.
  const tokens = text.toUpperCase().split(/[^A-Z]+/);
  const st = tokens.find((t) => US_STATES.has(t));
  if (st) return { rawText: text, state: st, country: "US", isRemote };
  return { rawText: text, country: "UNKNOWN", isRemote };
}

function guessCountry(lower: string): string {
  if (/united kingdom|london|\buk\b/.test(lower)) return "GB";
  if (/germany|berlin/.test(lower)) return "DE";
  if (/canada|toronto|vancouver/.test(lower)) return "CA";
  if (/netherlands|amsterdam/.test(lower)) return "NL";
  return "NON_US";
}

export interface ParsedCompensation {
  payType: PayType;
  minAmount?: number;
  maxAmount?: number;
  period?: "hour" | "month" | "total";
  rawText?: string;
}

export function parseCompensation(raw?: string): ParsedCompensation {
  if (!raw || !raw.trim()) return { payType: "UNKNOWN" };
  const text = raw.trim();
  if (/unpaid|no pay|volunteer/i.test(text)) return { payType: "UNPAID", rawText: text };

  const nums = [...text.matchAll(/\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?/gi)]
    .map((m) => parseFloat(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1))
    .filter((n) => n > 0);
  if (nums.length === 0) return { payType: "UNKNOWN", rawText: text };

  const period: ParsedCompensation["period"] = /\/\s*(hr|hour)|per\s*hour|hourly/i.test(text)
    ? "hour"
    : /\/\s*(mo|month)|per\s*month|monthly/i.test(text)
      ? "month"
      : /total|stipend/i.test(text)
        ? "total"
        : nums[0] < 250
          ? "hour"
          : nums[0] < 30000
            ? "month"
            : "total";

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return {
    payType: period === "total" && /stipend/i.test(text) ? "STIPEND" : period === "month" ? "MONTHLY" : "HOURLY",
    minAmount: min,
    maxAmount: max > min ? max : undefined,
    period,
    rawText: text,
  };
}

export function deriveArrangement(locations: ParsedLocation[], remoteHint?: boolean): WorkArrangement {
  if (locations.length === 0) return remoteHint ? "REMOTE" : "UNKNOWN";
  const anyRemote = remoteHint || locations.some((l) => l.isRemote);
  const anyOnsite = locations.some((l) => !l.isRemote && (l.city || l.state));
  if (anyRemote && anyOnsite) return "HYBRID";
  if (anyRemote) return "REMOTE";
  if (anyOnsite) return "ONSITE";
  return "UNKNOWN";
}

export function normalizePosting(raw: RawPosting): NormalizedPosting {
  const locations = raw.locations
    .flatMap((l) => l.split(/<br\s*\/?>|\n/i))
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseLocation);
  const description = raw.description?.trim() || undefined;
  return {
    externalId: raw.externalId,
    title: raw.title.trim(),
    normalizedTitle: normalizeTitle(raw.title),
    companyName: raw.companyName.trim(),
    normalizedCompany: normalizeCompany(raw.companyName),
    companyWebsite: raw.companyWebsite,
    locations: locations.map((l, i) => ({ ...l, isPrimary: i === 0 })) as NormalizedPosting["locations"],
    workArrangement: deriveArrangement(locations, raw.remoteHint),
    description,
    descriptionHash: description ? sha256(description) : undefined,
    postingUrl: raw.postingUrl,
    normalizedPostingUrl: normalizeUrl(raw.postingUrl),
    applyUrl: raw.applyUrl,
    postedAt: raw.postedAt,
    compensation: parseCompensation(raw.compensationText),
    markers: raw.markers ?? {},
    ageDays: raw.ageDays,
    raw: raw.raw,
  };
}

/** Cheap keyword relevance (0-100) used for filters, not for scoring. */
export function keywordRelevance(text: string): { ai: number; pm: number } {
  const t = text.toLowerCase();
  let ai = 0;
  let pm = 0;
  for (const [rx, pts] of [
    [/\b(ai|artificial intelligence)\b/, 35],
    [/machine learning|\bml\b/, 30],
    [/\bllm|genai|generative ai|agentic|deep learning|computer vision|nlp\b/, 25],
    [/applied scientist|research/, 10],
  ] as Array<[RegExp, number]>) {
    if (rx.test(t)) ai += pts;
  }
  for (const [rx, pts] of [
    [/product manag|product intern|\bapm\b/, 55],
    [/\bpm\b/, 20],
    [/roadmap|user research|go-to-market/, 15],
    [/technical program manager|\btpm\b/, 30],
  ] as Array<[RegExp, number]>) {
    if (rx.test(t)) pm += pts;
  }
  return { ai: Math.min(100, ai), pm: Math.min(100, pm) };
}
