import { createHash } from "crypto";

const COMPANY_SUFFIXES =
  /\b(inc|inc\.|llc|l\.l\.c\.|ltd|ltd\.|corp|corp\.|corporation|co|co\.|group|holdings|international)\b/gi;

const COMPANY_ALIASES: Record<string, string> = {
  "meta platforms": "meta",
  "alphabet": "google",
  "amazon web services": "amazon",
  aws: "amazon",
  "jump trading group": "jump trading",
};

export function normalizeCompany(name: string): string {
  let n = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&.-]/gu, " ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (COMPANY_ALIASES[n]) n = COMPANY_ALIASES[n];
  return n;
}

const TITLE_NOISE: RegExp[] = [
  /[-–—(]?\s*summer\s*20?27\s*[)]?/gi,
  /[-–—(]?\s*20?27\s*summer\s*[)]?/gi,
  /[-–—(]?\s*(intern(ship)?)\s*[)]?$/gi,
  /\b(us|usa|united states)\b/gi,
  /\s+/g,
];

export function normalizeTitle(title: string): string {
  let t = title.toLowerCase().replace(/[^\p{L}\p{N}\s/&+-]/gu, " ");
  for (const rx of TITLE_NOISE.slice(0, 4)) t = t.replace(rx, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t || title.toLowerCase().trim();
}

export function normalizeLocation(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(remote|hybrid|onsite|on-site)\b/g, "")
    .replace(/[^\p{L}\p{N}\s,]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TRACKING_PARAMS = [
  /^utm_/i,
  /^gh_src$/i,
  /^lever-/i,
  /^src$/i,
  /^source$/i,
  /^ref$/i,
  /^jr_id$/i,
  /^iis(n)?$/i,
  /^mode$/i,
];

/** Lowercase host, strip tracking params, drop trailing slash & fragments. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";
    const keep: Array<[string, string]> = [];
    u.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAMS.some((rx) => rx.test(k))) keep.push([k, v]);
    });
    u.search = "";
    keep
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([k, v]) => u.searchParams.append(k, v));
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return url.trim();
  }
}

/** Extract a stable ATS job id from known URL shapes, if present. */
export function extractAtsJobId(url: string): string | null {
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/gh_jid=(\d+)/i, (m) => `greenhouse:${m[1]}`],
    [/greenhouse\.io\/(?:embed\/job_app\?.*token=(\d+)|[^/]+\/jobs\/(\d+))/i, (m) => `greenhouse:${m[1] ?? m[2]}`],
    [/jobs\.lever\.co\/[^/]+\/([0-9a-f-]{36})/i, (m) => `lever:${m[1]}`],
    [/jobs\.ashbyhq\.com\/[^/]+\/([0-9a-f-]{36})/i, (m) => `ashby:${m[1]}`],
    [/myworkdayjobs\.com\/.*_(R-?\d+(?:-\d+)?)\b/i, (m) => `workday:${m[1].toUpperCase()}`],
    [/smartrecruiters\.com\/.*\/(\d{9,})/i, (m) => `smartrecruiters:${m[1]}`],
  ];
  for (const [rx, fmt] of patterns) {
    const m = url.match(rx);
    if (m) return fmt(m);
  }
  return null;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Deterministic dedupe key for a canonical listing. */
export function buildDedupeKey(input: {
  normalizedCompany: string;
  normalizedTitle: string;
  season: string;
  primaryLocation?: string;
}): string {
  return [
    input.normalizedCompany,
    input.normalizedTitle,
    input.season.toLowerCase(),
    normalizeLocation(input.primaryLocation ?? ""),
  ].join("|");
}

/** Token-set Jaccard similarity (0..1) — used for fuzzy title matching. */
export function jaccardTokens(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(Boolean));
  const tb = new Set(b.split(/\s+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Character-trigram cosine-ish similarity (0..1) — description comparison. */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const g = new Map<string, number>();
    const t = s.toLowerCase().replace(/\s+/g, " ").trim();
    for (let i = 0; i < t.length - 2; i++) {
      const k = t.slice(i, i + 3);
      g.set(k, (g.get(k) ?? 0) + 1);
    }
    return g;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, v] of ga) na += v * v;
  for (const [, v] of gb) nb += v * v;
  for (const [k, v] of ga) {
    const w = gb.get(k);
    if (w) dot += v * w;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
