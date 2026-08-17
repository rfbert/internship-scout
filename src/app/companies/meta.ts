import type {
  EvidenceKind,
  EvidenceReliability,
  ListingStatus,
} from "@prisma/client";
import type { ColorToken } from "@/lib/format";

/**
 * Label and color maps for the enums the Companies section prints and
 * `src/lib/format.ts` does not cover. Nothing outside `src/app/companies/**`
 * imports this file.
 *
 * The old five-word `Tone` vocabulary ("accent" / "success" / …) is gone: the
 * Register colors by `ColorToken`, and the word is always printed next to the
 * color, so no mark here carries meaning by hue alone (D3).
 */

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  H1B_FILINGS: "H-1B filings",
  EMPLOYER_STATEMENT: "Employer statement",
  UNIVERSITY_DOC: "University document",
  PRIOR_POSTING: "Prior posting",
  COMPANY_POLICY: "Company policy",
  VERIFIED_REPORT: "Verified report",
};

/** Mono-caps form for the evidence row's leading mark. */
export const EVIDENCE_KIND_MARKS: Record<EvidenceKind, string> = {
  H1B_FILINGS: "H-1B FILINGS",
  EMPLOYER_STATEMENT: "EMPLOYER STATEMENT",
  UNIVERSITY_DOC: "UNIVERSITY DOC",
  PRIOR_POSTING: "PRIOR POSTING",
  COMPANY_POLICY: "COMPANY POLICY",
  VERIFIED_REPORT: "VERIFIED REPORT",
};

export const RELIABILITY_LABELS: Record<EvidenceReliability, string> = {
  STRONG: "Strong",
  MODERATE: "Moderate",
  WEAK: "Weak",
};

/** Reliability reads on the same green / ochre ladder as confidence (B4). */
export const reliabilityColor = (r: EvidenceReliability): ColorToken => {
  switch (r) {
    case "STRONG":
      return "green";
    case "MODERATE":
      return "blue";
    case "WEAK":
      return "ochre";
  }
};

/** `▪` count for a reliability, mirroring the confidence pips of B4. */
export const RELIABILITY_PIPS: Record<EvidenceReliability, number> = {
  STRONG: 3,
  MODERATE: 2,
  WEAK: 1,
};

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  ACTIVE: "Active",
  CLOSED: "Closed",
  REMOVED: "Removed",
  EXPIRED: "Expired",
  DRAFT: "Draft",
};

export const listingStatusColor = (s: ListingStatus): ColorToken => {
  switch (s) {
    case "ACTIVE":
      return "green";
    case "DRAFT":
      return "blue";
    case "CLOSED":
    case "EXPIRED":
    case "REMOVED":
      return "ink-3";
  }
};

/**
 * How the index page summarises a company's evidence file in one mark. The
 * word always prints; the color only reinforces it.
 */
export const evidenceVerdict = (
  count: number,
  hasStrong: boolean
): { label: string; color: ColorToken; title: string } => {
  if (count === 0) {
    return {
      label: "NONE ON FILE",
      color: "ink-3",
      title: "No sponsorship evidence recorded for this company.",
    };
  }
  if (hasStrong) {
    return {
      label: "VERIFIED",
      color: "green",
      title:
        "At least one strong-reliability record on file. Company history never guarantees that a specific listing offers sponsorship.",
    };
  }
  return {
    label: "PARTIAL",
    color: "ochre",
    title:
      "Evidence on file, none of it strong-reliability. Treat as encouraging, not as a commitment.",
  };
};
