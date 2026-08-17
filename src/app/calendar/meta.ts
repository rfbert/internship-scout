import type { DeadlineKind } from "@prisma/client";
import type { ColorToken } from "@/lib/format";

/*
 * Deadline-kind notation for the diary.
 *
 * The full-word labels are NOT here any more: `DEADLINE_KIND_LABELS` lives in
 * `@/lib/format` (FOUNDATION pre-moved it), and this file's private copy was a
 * duplicate that had already drifted — its `ASSESSMENT_DEADLINE` read
 * "Assessment deadline" while the shared map reads "Assessment". One map now.
 *
 * What is local is this surface's own vocabulary: the mono-caps CODE printed in
 * the ledger's KIND column, and the classification color that ticks the row.
 */

/** Mono-caps code for the ledger's KIND column. Ten characters is the ceiling. */
export const DEADLINE_KIND_CODES: Record<DeadlineKind, string> = {
  APPLICATION_DEADLINE: "APPLY BY",
  SUGGESTED_APPLY_BY: "APPLY SOON",
  FOLLOW_UP: "FOLLOW-UP",
  ASSESSMENT_DEADLINE: "ASSESSMENT",
  INTERVIEW: "INTERVIEW",
  REFERRAL_REMINDER: "REFERRAL",
  OFFER_DEADLINE: "OFFER",
};

/**
 * The row's left tick — a *classification* mark, not an urgency one. Urgency is
 * carried separately by the section the row sits in and by the DUE / IN cells
 * (B4: <7d carmine, <21d ochre, overdue carmine plus the literal word).
 *
 * Value-for-value the grouping the old `deadlineKindTone` expressed, repointed
 * from the legacy five-tone Badge vocabulary onto Register tokens
 * (accent → blue, success → green, danger → carmine, neutral → ink-3). The KIND
 * word always prints immediately beside the tick, so color is never the sole
 * carrier of meaning (D3).
 */
export const deadlineKindColor = (k: DeadlineKind): ColorToken => {
  switch (k) {
    case "APPLICATION_DEADLINE":
    case "ASSESSMENT_DEADLINE":
      return "blue";
    case "OFFER_DEADLINE":
      return "carmine";
    case "INTERVIEW":
      return "green";
    default:
      return "ink-3";
  }
};
