import type { ScoreComponent } from "./constants";
import { DEFAULT_WEIGHTS, SCORE_COMPONENTS } from "./constants";
import { SCORE_COMPONENT_LABELS, type ColorToken } from "./format";

/**
 * The assessment ledger's visible arithmetic (spec A1).
 *
 * `scoreListing` computes  raw = Σ (subscore × weight) / 100,  then subtracts a
 * season penalty (0 / 8 / 12) that is NEVER PERSISTED, then clamps and rounds.
 * So eight integer contributions can never "sum to the score". This module
 * renders the real chain instead, and derives the adjustment line as
 * `overall − subtotal` — which makes the column close exactly by construction,
 * absorbing the penalty, the clamp and the rounding in one honest line.
 *
 * Pure. No React, no Prisma. Unit-tested in tests/unit/scoring-display.test.ts.
 */

export type AdjustmentLabel = "SEASON ADJUSTMENT" | "ROUNDING";

export interface LedgerRow {
  component: ScoreComponent;
  /** Mono-caps label, e.g. "ROLE ALIGNMENT". */
  label: string;
  /** Weight from the score's own snapshot — never DEFAULT_WEIGHTS at render. */
  weight: number;
  /** The stored 0–100 subscore. */
  subscore: number;
  /** subscore × weight / 100, unrounded. Format with `fmt1`. */
  contribution: number;
  /** Bar fill fraction, 0–1. Identical to contribution / weight. */
  fill: number;
  /** Bar color, from the well palette only. */
  tone: ColorToken;
  /**
   * True on exactly one row: the component with the largest
   * `weight − contribution`. Its label and value print in the bar's color —
   * it names what held the score down, which is what the examiner's rationale
   * underneath says in words.
   */
  shortfall: boolean;
}

/**
 * Reads the weights that actually produced this score.
 *
 * `buildWeightsSnapshot` writes `{ weights, roleAlignmentScores, bandThresholds }`,
 * but rows written before that change carry the BARE weights record. Accept
 * both, and fall back per-component to the app default for anything missing —
 * a malformed snapshot must degrade to a readable ledger, not to NaN.
 */
export function readSnapshotWeights(snapshot: unknown): Record<ScoreComponent, number> {
  const src =
    snapshot && typeof snapshot === "object" && "weights" in (snapshot as object)
      ? (snapshot as { weights: unknown }).weights
      : snapshot; // legacy bare-weights row

  const out = {} as Record<ScoreComponent, number>;
  for (const c of SCORE_COMPONENTS) {
    const v = (src as Record<string, unknown> | null)?.[c];
    out[c] = typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_WEIGHTS[c];
  }
  return out;
}

/** Three-step ramp on the subscore, from the well palette only (A1). */
export function barTone(subscore: number): ColorToken {
  if (subscore >= 75) return "green";
  if (subscore >= 45) return "ochre";
  return "carmine";
}

/**
 * Ledger rows, sorted by weight descending, ties broken by the component's
 * index in SCORE_COMPONENTS. Deterministic rule, not a hard-coded list: a
 * re-weighted profile reorders the ledger correctly.
 */
export function ledgerRows(
  components: Record<ScoreComponent, number>,
  weights: Record<ScoreComponent, number>,
): LedgerRow[] {
  const rows: LedgerRow[] = SCORE_COMPONENTS.map((component) => {
    const weight = weights[component] ?? 0;
    const subscore = components[component] ?? 0;
    return {
      component,
      label: SCORE_COMPONENT_LABELS[component],
      weight,
      subscore,
      contribution: (subscore * weight) / 100,
      fill: Math.max(0, Math.min(1, subscore / 100)),
      tone: barTone(subscore),
      shortfall: false,
    };
  });

  rows.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return SCORE_COMPONENTS.indexOf(a.component) - SCORE_COMPONENTS.indexOf(b.component);
  });

  // Exactly one shortfall highlight: the largest weight − contribution. Ties go
  // to the row that already sorts first, so the mark is stable across renders.
  let best = -Infinity;
  let bestIndex = -1;
  rows.forEach((r, i) => {
    const gap = r.weight - r.contribution;
    if (gap > best) {
      best = gap;
      bestIndex = i;
    }
  });
  if (bestIndex >= 0 && best > 0) rows[bestIndex].shortfall = true;

  return rows;
}

/** Σ contribution — this IS `raw` in the scorer, before penalty/clamp/round. */
export function subtotal(rows: ReadonlyArray<Pick<LedgerRow, "contribution">>): number {
  return rows.reduce((acc, r) => acc + r.contribution, 0);
}

/**
 * The one honest line: `overall − subtotal`. Signed. The caller HIDES the row
 * when `fmt1` of this value is "0" — a zero adjustment is not information.
 */
export function adjustment(overall: number, sub: number): number {
  return overall - sub;
}

/** True when the adjustment row should be suppressed (rounds to 0.0). */
export function adjustmentIsZero(value: number): boolean {
  return Math.abs(round1(value)) < 0.05;
}

const SEASON_EXPLANATION_RX = /^Season (not confirmed|inferred)/;

/**
 * `SEASON ADJUSTMENT` when the score carries a MISSING-kind explanation about
 * the season (that is the penalty the line is absorbing), otherwise `ROUNDING`.
 */
export function adjustmentLabelFor(
  explanations: ReadonlyArray<{ kind?: string | null; text?: string | null }> | null | undefined,
): AdjustmentLabel {
  const hit = (explanations ?? []).some(
    (e) => e?.kind === "MISSING" && SEASON_EXPLANATION_RX.test(e?.text ?? ""),
  );
  return hit ? "SEASON ADJUSTMENT" : "ROUNDING";
}

function round1(n: number): number {
  // Nudge away from binary-float ties so 0.05 rounds up, not down.
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

/** 1 dp with a trailing `.0` trimmed: 21.0 → "21", 13.55 → "13.6", -8.0 → "-8". */
export function fmt1(n: number): string {
  const r = round1(n);
  // `-0` prints as "0": a negative zero in a ledger column is a rendering bug.
  const safe = Object.is(r, -0) ? 0 : r;
  return Number.isInteger(safe) ? String(safe) : safe.toFixed(1);
}

/** Same as `fmt1`, with an explicit sign — for the adjustment row. */
export function fmt1Signed(n: number): string {
  const body = fmt1(n);
  return body.startsWith("-") ? body : `+${body}`;
}
