import type { PrismaClient, InternshipListing } from "@prisma/client";
import {
  buildDedupeKey,
  extractAtsJobId,
  jaccardTokens,
  normalizeUrl,
  trigramSimilarity,
} from "@/lib/normalize";
import type { NormalizedPosting } from "@/lib/types";
import { SEASON } from "@/lib/constants";

export type DedupMatch =
  | { kind: "URL" | "ATS_ID" | "KEY" | "FUZZY"; listing: InternshipListing }
  | { kind: "POSSIBLE"; listing: InternshipListing; similarity: number }
  | null;

/**
 * Matching cascade per docs/DEDUPLICATION.md. Returns the existing canonical
 * listing this posting refers to, a POSSIBLE near-match needing human confirm,
 * or null (genuinely new).
 */
export async function findExistingListing(
  prisma: PrismaClient,
  np: NormalizedPosting
): Promise<DedupMatch> {
  const urls = [np.normalizedPostingUrl];
  if (np.applyUrl) urls.push(normalizeUrl(np.applyUrl));

  // 1. Exact URL match on any known source sighting.
  const byUrl = await prisma.internshipSource.findFirst({
    where: { url: { in: urls } },
    include: { listing: true },
  });
  if (byUrl) return { kind: "URL", listing: canonicalOf(byUrl.listing) };

  // 2. ATS job-id match.
  const atsId =
    np.externalId ??
    extractAtsJobId(np.postingUrl) ??
    (np.applyUrl ? extractAtsJobId(np.applyUrl) : null);
  if (atsId) {
    const byId = await prisma.internshipSource.findFirst({
      where: { externalId: atsId },
      include: { listing: true },
    });
    if (byId) return { kind: "ATS_ID", listing: canonicalOf(byId.listing) };
  }

  // 3. Deterministic key.
  const key = buildDedupeKey({
    normalizedCompany: np.normalizedCompany,
    normalizedTitle: np.normalizedTitle,
    season: SEASON,
    primaryLocation: np.locations[0]?.rawText,
  });
  const byKey = await prisma.internshipListing.findUnique({ where: { dedupeKey: key } });
  if (byKey) return { kind: "KEY", listing: byKey };

  // 4. Fuzzy: same company + season, title token overlap.
  const company = await prisma.company.findUnique({
    where: { normalizedName: np.normalizedCompany },
    select: { id: true },
  });
  if (!company) return null;
  const candidates = await prisma.internshipListing.findMany({
    where: { companyId: company.id, season: SEASON, canonicalId: null, deletedAt: null },
    take: 200,
  });
  let best: { listing: InternshipListing; sim: number } | null = null;
  for (const c of candidates) {
    const sim = jaccardTokens(c.normalizedTitle, np.normalizedTitle);
    if (!best || sim > best.sim) best = { listing: c, sim };
  }
  if (!best) return null;
  if (best.sim >= 0.8) return { kind: "FUZZY", listing: best.listing };
  if (best.sim >= 0.6) {
    if (np.description && best.listing.description) {
      const dsim = trigramSimilarity(np.description, best.listing.description);
      if (dsim >= 0.85) return { kind: "FUZZY", listing: best.listing };
    }
    return { kind: "POSSIBLE", listing: best.listing, similarity: best.sim };
  }
  return null;
}

function canonicalOf(l: InternshipListing & { canonicalId?: string | null }): InternshipListing {
  // Callers re-fetch when the sighting row pointed at a merged duplicate.
  return l;
}

/** Resolve a listing to its canonical row (follows one merge hop). */
export async function resolveCanonical(
  prisma: PrismaClient,
  listing: InternshipListing
): Promise<InternshipListing> {
  if (!listing.canonicalId) return listing;
  const canonical = await prisma.internshipListing.findUnique({
    where: { id: listing.canonicalId },
  });
  return canonical ?? listing;
}

/** Canonical-source preference order (lower = preferred). docs/DEDUPLICATION.md */
export function sourceTier(kind: string): number {
  switch (kind) {
    case "COMPANY_PAGE":
      return 1;
    case "GREENHOUSE":
    case "LEVER":
    case "ASHBY":
    case "SMARTRECRUITERS":
    case "WORKDAY":
      return 2;
    case "URL_IMPORT":
    case "CSV_IMPORT":
    case "MANUAL":
      return 4;
    case "GITHUB_REPO":
      return 5;
    default:
      return 6;
  }
}
