import type {
  RoleCategory,
  ScoreBand,
  SourceKind,
  SponsorshipCategory,
  SponsorshipConfidence,
  UgEligibility,
  WorkArrangement,
} from "@prisma/client";
import type { ScoreComponent } from "@/lib/constants";
import type { AdjustmentLabel } from "@/lib/scoring-display";

/**
 * The assessment ledger's inputs, resolved on the server from the score row
 * that `page.tsx` already fetches (spec A1). No extra query and no extra
 * round-trip: `l.scores[0]` is included by the existing `include`, and this
 * maps eight more of its columns.
 *
 * `weights` is already resolved through `readSnapshotWeights` server-side, so
 * the client never has to reason about the two snapshot shapes and the raw
 * `weightsSnapshot` JSON never crosses the wire.
 */
export interface ReviewScoreDetail {
  components: Record<ScoreComponent, number>;
  weights: Record<ScoreComponent, number>;
  overall: number;
  band: ScoreBand;
  /** Printed as `RULES V<n>` in the ledger caption. */
  analysisVersion: number;
  /** `SEASON ADJUSTMENT` when a season MISSING explanation exists, else `ROUNDING`. */
  adjustmentLabel: AdjustmentLabel;
  /** One line: `recommendedAction`, or the top CONCERN explanation. */
  rationale: string | null;
}

/** JSON-safe row passed from the server page to the client review list. */
export interface ReviewRow {
  decisionId: string;
  listingId: string;
  queuedAt: string; // ISO
  decisionNote: string | null;
  companyName: string;
  title: string;
  isSample: boolean;
  roleCategory: RoleCategory;
  location: string | null;
  workArrangement: WorkArrangement;
  compensationText: string | null;
  score: number | null;
  band: ScoreBand | null;
  sponsorshipCategory: SponsorshipCategory | null;
  sponsorshipConfidence: SponsorshipConfidence | null;
  sourceKind: SourceKind | null;
  topPositive: string | null;
  topConcern: string | null;
  deadline: string | null; // ISO
  deadlineIsEstimated: boolean;
  postingUrl: string | null;
  applyUrl: string | null;
  /** Truncated to 1200 chars server-side. */
  description: string | null;
  explanations: Array<{ kind: string; text: string; rank: number }>;
  assessment: {
    explanation: string;
    matchedText: string[];
    conflictingInfo: string | null;
    /** Where the quoted language came from, e.g. `posting §Eligibility`. */
    evidenceSource: string | null;
    /** ISO. When the evidence was retrieved — printed under the quote. */
    retrievedAt: string | null;
  } | null;
  /** ISO. The posting's own date when known; `discoveredAt` is the fallback. */
  postedAt: string | null;
  discoveredAt: string; // ISO
  /** `SUMMER_2027` etc. — printed as words in the evidence panel. */
  season: string;
  seasonEvidence: string | null;
  ugEligibility: UgEligibility;
  /** Null when the listing has never been scored. */
  scoreDetail: ReviewScoreDetail | null;
}

export interface DiscardReasonOption {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
}

/** Every verdict the review docket can stamp on a record. */
export type DecisionAction =
  | "accept"
  | "save"
  | "discard"
  | "ineligible"
  | "duplicate"
  | "already_applied";

/**
 * VERDICT MEMORY (spec C2). A decided record leaves `PENDING_REVIEW` and so
 * leaves the server query — but the docket must keep showing what you did to
 * it during this sitting. The client holds the verdict, the moment it was
 * stamped, and the row itself, and keeps rendering from the props in hand.
 * Zero query changes.
 */
export interface Verdict {
  action: DecisionAction;
  /** `Date.now()` at the moment the decision returned. Feeds the session meter. */
  at: number;
  /** `A-0217`, once known. See the note in `queue-row.tsx`. */
  accession?: string;
}
