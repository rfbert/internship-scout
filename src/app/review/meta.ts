import type {
  DecisionState,
  SourceKind,
  SponsorshipCategory,
  UgEligibility,
  WorkArrangement,
} from "@prisma/client";
import type { ColorToken } from "@/lib/format";
import type { DecisionAction } from "./types";

/**
 * Label maps for enums not covered by src/lib/format.ts.
 * Shared by the Review Queue, New Opportunities and Archive sections.
 *
 * SHARED-IMPORT CONTRACT (spec Part E): `/opportunities` and `/archive` (P4)
 * import `DECISION_LABELS`, `decisionTone`, `SOURCE_KIND_LABELS` and
 * `ARRANGEMENT_LABELS` from here. Those four are frozen — additions below them
 * are fine, removals and renames are not.
 */

export const DECISION_LABELS: Record<DecisionState, string> = {
  PENDING_REVIEW: "Pending review",
  ACCEPTED: "Accepted",
  SAVED_FOR_LATER: "Saved for later",
  DISCARDED: "Discarded",
  MARKED_INELIGIBLE: "Marked ineligible",
  MARKED_DUPLICATE: "Marked duplicate",
  ALREADY_APPLIED: "Already applied",
};

export const decisionTone = (
  s: DecisionState | null | undefined
): "accent" | "success" | "warning" | "danger" | "neutral" => {
  switch (s) {
    case "PENDING_REVIEW":
      return "accent";
    case "ACCEPTED":
      return "success";
    case "SAVED_FOR_LATER":
      return "warning";
    case "MARKED_INELIGIBLE":
      return "danger";
    case "DISCARDED":
    case "MARKED_DUPLICATE":
    case "ALREADY_APPLIED":
      return "neutral";
    default:
      return "neutral";
  }
};

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  GITHUB_REPO: "GitHub list",
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  SMARTRECRUITERS: "SmartRecruiters",
  WORKDAY: "Workday",
  COMPANY_PAGE: "Company page",
  URL_IMPORT: "URL import",
  CSV_IMPORT: "CSV import",
  MANUAL: "Manual",
};

export const ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  ONSITE: "Onsite",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
  UNKNOWN: "Arrangement unknown",
};

/* ── The Register's additions ──────────────────────────────────────────────
   Everything below is new with the Review Docket. It is additive: nothing
   above changed name, shape or value. */

/* ── The docket's order ────────────────────────────────────────────────────
   `SORT: SCORE` shipped as a `Chip` with no `onClick`: chip border, chip hover
   state, no behaviour — a control that only looked like one. It is real now,
   and it lives in the URL exactly like the archive's and the tracker's
   filters, so the order survives a reload, a Back, and a shared link.

   Declared here rather than in `page.tsx` because `review-list.tsx` is a
   client component and must not import from a server page module. */
export const REVIEW_SORTS = {
  score: { label: "Score", title: "Highest score first — the docket's default order." },
  deadline: {
    label: "Deadline",
    title: "Soonest deadline first. Records with no date on file sort last.",
  },
  posted: { label: "Posted", title: "Most recently posted first." },
} as const;

export type ReviewSort = keyof typeof REVIEW_SORTS;

export const DEFAULT_REVIEW_SORT: ReviewSort = "score";

export const isReviewSort = (v: unknown): v is ReviewSort =>
  typeof v === "string" && Object.hasOwn(REVIEW_SORTS, v);

/**
 * The SOURCE column prints the provenance in lowercase mono — a filename, not
 * a brand. The full label rides in `title` (`SOURCE_KIND_LABELS`), so the
 * abbreviation is never the only form on offer.
 */
export const SOURCE_KIND_SHORT: Record<SourceKind, string> = {
  GITHUB_REPO: "github-feed",
  GREENHOUSE: "greenhouse",
  LEVER: "lever",
  ASHBY: "ashby",
  SMARTRECRUITERS: "smartrec",
  WORKDAY: "workday",
  COMPANY_PAGE: "careers-page",
  URL_IMPORT: "url-import",
  CSV_IMPORT: "csv-import",
  MANUAL: "manual",
};

/**
 * VERDICT STAMPS. Always plain English, in both notation modes (spec A5): the
 * notation switch governs classification vocabulary — bands and sponsorship —
 * never what you decided. `FILED` is not a code you learn; it is the word.
 */
export const VERDICT_LABELS: Record<DecisionAction, string> = {
  accept: "FILED",
  save: "SET ASIDE",
  discard: "STRUCK",
  ineligible: "STRUCK · INELIGIBLE",
  duplicate: "STRUCK · DUPLICATE",
  already_applied: "ALREADY APPLIED",
};

/** What the toast says, and what the row's `title` spells out in a sentence. */
export const VERDICT_SENTENCES: Record<DecisionAction, string> = {
  accept: "Filed to the tracker",
  save: "Set aside for later",
  discard: "Struck from the docket",
  ineligible: "Struck as ineligible",
  duplicate: "Struck as a duplicate",
  already_applied: "Marked already applied",
};

export const verdictColor = (action: DecisionAction): ColorToken => {
  switch (action) {
    case "accept":
      return "green";
    case "save":
      return "ochre";
    case "already_applied":
      return "ink-3";
    default:
      return "carmine";
  }
};

/** `SUMMER_2027` → `SUMMER 2027`. The season is a word, never an enum key. */
export const seasonWords = (season: string): string => season.replace(/_/g, " ");

/**
 * `UgEligibility` has no label map in `src/lib/format.ts` and that file is
 * FOUNDATION-owned, so the six words live here — the eligibility line on the
 * worksheet is the only surface that prints them. If a second page ever needs
 * them, file the map to FOUNDATION rather than copying it.
 */
export const UG_ELIGIBILITY_LABELS: Record<UgEligibility, string> = {
  UNDERGRAD_EXPLICIT: "Undergraduate eligible",
  UNDERGRAD_LIKELY: "Undergraduates likely eligible",
  AMBIGUOUS: "Undergraduate eligibility unclear",
  GRAD_PREFERRED: "Graduate students preferred",
  GRAD_ONLY: "Graduate students only",
  PHD_ONLY: "PhD only",
};

/** Green when the door is open, ochre when it is ajar, carmine when shut. */
export const ugEligibilityColor = (u: UgEligibility): ColorToken => {
  switch (u) {
    case "UNDERGRAD_EXPLICIT":
    case "UNDERGRAD_LIKELY":
      return "green";
    case "AMBIGUOUS":
    case "GRAD_PREFERRED":
      return "ochre";
    default:
      return "carmine";
  }
};

/**
 * Why a record arrived pre-struck. `INELIGIBLE` is stamped by the eligibility
 * gates before you ever see the row, so the verdict cell names the gate that
 * closed instead of printing a bare band.
 */
export const preStruckReason = (
  category: SponsorshipCategory | null | undefined
): string | null => {
  switch (category) {
    case "CITIZENSHIP_REQUIRED":
      return "CITIZENSHIP";
    case "CLEARANCE_REQUIRED":
      return "CLEARANCE";
    case "UNRESTRICTED_AUTH_REQUIRED":
      return "US AUTH";
    case "EXPLICITLY_UNAVAILABLE":
      return "NO SPONSORSHIP";
    case "USER_INELIGIBLE":
      return "PROFILE";
    default:
      return null;
  }
};

/**
 * The keys the docket actually binds (D1) — nothing is printed on a keycap
 * that is not live. Shared so the empty state and the full docket cannot
 * advertise different shortcuts.
 */
export const REVIEW_KEYS: { key: string; label: string }[] = [
  { key: "J", label: "next" },
  { key: "K", label: "prev" },
  { key: "A", label: "accept" },
  { key: "S", label: "shortlist" },
  { key: "D", label: "discard" },
  { key: "O", label: "open" },
  { key: "N", label: "note" },
];
