import type { ScoreBand, SponsorshipCategory, SponsorshipConfidence } from "@prisma/client";
import {
  BAND_CODES,
  BAND_LABELS,
  BAND_PLAIN,
  CONFIDENCE_LABELS,
  PIP_SPEC,
  SPONSORSHIP_CODES,
  SPONSORSHIP_LABELS,
  SPONSORSHIP_PLAIN,
} from "./format";

/**
 * Notation grammar resolvers. Pure and React-free, so the email builder can
 * share `bandText(b, "PLAIN")` with the UI (A5, A6).
 *
 * Structurally identical to the Prisma `NotationMode` enum — assignable in both
 * directions — but declared here so this module has no generated-client
 * dependency and stays importable from scripts and tests.
 */
export type NotationMode = "PLAIN" | "COMPACT";

export const NOTATION_MODES: readonly NotationMode[] = ["PLAIN", "COMPACT"];

export const DEFAULT_NOTATION: NotationMode = "PLAIN";

/** Visible band notation. Plain spells the band out; Compact prints its code. */
export function bandText(band: ScoreBand | null | undefined, mode: NotationMode): string {
  if (!band) return "—";
  return mode === "COMPACT" ? BAND_CODES[band] : BAND_PLAIN[band];
}

/**
 * The `title` every band element carries — the plain-English expansion, in BOTH
 * modes (SYNTHESIS §2.1). A Compact-mode reader must never have to guess.
 */
export function bandTitle(band: ScoreBand | null | undefined): string {
  return band ? BAND_LABELS[band] : "Not yet scored";
}

/** Accessible name for a band mark: always the full word, never the code. */
export function bandAria(band: ScoreBand | null | undefined, score?: number | null): string {
  const word = bandTitle(band);
  return score == null ? word : `Score ${score}, ${word}`;
}

export function sponsorshipText(
  category: SponsorshipCategory | null | undefined,
  mode: NotationMode,
): string {
  if (!category) return mode === "COMPACT" ? "N/A" : "NOT ANALYZED";
  return mode === "COMPACT" ? SPONSORSHIP_CODES[category] : SPONSORSHIP_PLAIN[category];
}

/** Always the full SPONSORSHIP_LABELS sentence, in both modes (B4). */
export function sponsorshipTitle(category: SponsorshipCategory | null | undefined): string {
  return category ? SPONSORSHIP_LABELS[category] : "Sponsorship not yet analyzed";
}

export function confidenceTitle(confidence: SponsorshipConfidence | null | undefined): string {
  return CONFIDENCE_LABELS[confidence ?? "UNKNOWN"];
}

/**
 * Accessible name for a sponsorship mark, carrying the pip COUNT in words —
 * the pips themselves are aria-hidden decoration over the same fact (D3).
 */
export function sponsorshipAria(
  category: SponsorshipCategory | null | undefined,
  confidence: SponsorshipConfidence | null | undefined,
): string {
  const pips = PIP_SPEC[confidence ?? "UNKNOWN"].pips;
  return `${sponsorshipTitle(category)}. ${confidenceTitle(confidence)} (${pips} of 3).`;
}

/** `▪` glyphs for a confidence level. Render aria-hidden. */
export function pipGlyphs(confidence: SponsorshipConfidence | null | undefined): string {
  return "▪".repeat(PIP_SPEC[confidence ?? "UNKNOWN"].pips);
}

/**
 * The certainty stroke's third leg. The other two — the `~` prefix and the 1px
 * dashed underline — are rendered by <Estimated>; all three, everywhere,
 * always: one convention learned once.
 */
export const ESTIMATED_ARIA = "estimated";

/** Email's degraded form of the stroke: `~` prefix plus a literal suffix. */
export const ESTIMATED_SUFFIX = "(estimated)";

/**
 * THE ONE GLOSS OF `~`. Wherever the certainty stroke is spelled out — a
 * footnote legend, a tooltip, the email footer — it is spelled out with these
 * words and no others.
 *
 * It used to be five different sentences ("estimated date — verify before
 * relying", "verify on the posting", "estimated date", "estimated", and two
 * more in the email), which is five different caveats as far as a reader is
 * concerned. This is the app's most load-bearing caveat; it gets one wording.
 *
 * Kept short on purpose: the footnote strip is one nowrap line with an
 * ellipsis, so a longer sentence does not read as more careful — it reads as
 * a truncated one.
 */
export const ESTIMATED_GLOSS = "estimated — not a confirmed date";

/**
 * The same sentence cut at its dash: `["estimated", "not a confirmed date"]`.
 *
 * Exactly one surface needs it — the deadline worksheet's checkbox, which
 * DEMONSTRATES the mark by drawing the dashed underline under `~ estimated`
 * the way a dated value wears it, and cannot do that with the sentence in one
 * piece. The split lives here, beside the words, so the wording still has one
 * home and a future edit cannot leave the two halves disagreeing.
 */
export const ESTIMATED_GLOSS_PARTS = ESTIMATED_GLOSS.split(" — ") as [string, string];

/* ── Record numbering (A2) ─────────────────────────────────────────────────
   Two numbers, two jobs — exactly the register metaphor. `A-0217` is the
   ACCESSION number: the record's permanent identity in the archive, derived
   from creation order by `accessionMap()` in src/server/accession.ts. `Q-04`
   is the DOCKET number: a positional label for one review sitting, assigned
   client-side at mount and frozen for the session.

   Both formatters live HERE, not in src/server/accession.ts, because client
   components need them and that module imports Prisma. `@/server/accession`
   re-exports formatAccession for server callers. */

export const formatAccession = (ordinal: number) => `A-${String(ordinal).padStart(4, "0")}`;

export const formatQueueNo = (index: number) => `Q-${String(index + 1).padStart(2, "0")}`;
