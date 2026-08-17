import type { ScoreBand } from "@prisma/client";
import type { ScoreComponent } from "@/lib/constants";
import { WELL_TEXT, WELL_VAR } from "@/lib/format";
import { Band } from "./notation";
import {
  adjustment,
  ledgerRows,
  subtotal,
  type AdjustmentLabel,
} from "@/lib/scoring-display";
import { Well } from "./well";

/* ── The printed column has to survive being added up ──────────────────────
   A contribution is (subscore × weight) ÷ 100. Subscores are `Int` columns on
   `ListingScore`, and the settings write path validates every weight as an
   integer (src/app/api/settings/validation.ts), so each contribution lands on
   an exact multiple of 0.01 and TWO decimals prints it with no rounding at
   all — the visible column then sums to the visible subtotal exactly.

   ONE decimal did not. A 95 subscore against a weight of 25 is 23.75 and
   printed as `23.8`; 55 against 15 is 8.25 and printed as `8.3`. On the
   record the reviewer checked, the eight printed numbers added to 80.0 above
   a subtotal line reading 79.9 — so the one component in the app whose whole
   claim is that its arithmetic is auditable failed the audit, on rounding
   alone. The maths is untouched; only how much of it is shown has changed.

   Enforced in tests/unit/assessment-ledger-arithmetic.test.ts. */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Always two decimals: `3` → "3.00", `23.75` → "23.75". */
export function fmt2(n: number): string {
  const r = round2(n);
  // A negative zero in a ledger column is a rendering bug, not a value.
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

/** `fmt2` with an explicit sign — for the adjustment row. */
export function fmt2Signed(n: number): string {
  const body = fmt2(n);
  return body.startsWith("-") ? body : `+${body}`;
}

/**
 * True when the adjustment prints as `+0.00` and is therefore not information.
 *
 * This threshold belongs to the DISPLAY precision, not to the value: the
 * shared `adjustmentIsZero` suppresses anything under 0.05, which at one
 * decimal is right and at two decimals would hide a real 0.03 gap and reopen
 * the column that this component just closed.
 */
export function adjustmentVanishes(value: number): boolean {
  return Math.abs(round2(value)) < 0.005;
}

/**
 * THE ASSESSMENT LEDGER — eight components × weight → contribution, totalled
 * to the score, with the arithmetic VISIBLE (spec A1).
 *
 * Why the adjustment line exists: `scoreListing` subtracts a season penalty
 * (0 / 8 / 12) that is never persisted, then clamps and rounds. Eight integer
 * contributions therefore cannot sum to the stored score. Deriving the
 * adjustment as `overall − subtotal` makes the column close exactly by
 * construction — one honest line absorbing the penalty, the clamp and the
 * rounding — instead of eight subtly-wrong numbers.
 *
 * The row rendered in its bar's color is the SHORTFALL: the component with the
 * largest `weight − contribution`. It names what held the score down, which is
 * exactly what the examiner's rationale underneath says in words. That is why
 * the highlight is informational rather than decorative.
 *
 * Sits in a `Well` (SYNTHESIS §3.4 supersedes the mock, which predates it), so
 * every bar uses the well palette.
 */
export function AssessmentLedger({
  components,
  weights,
  overall,
  band,
  adjustmentLabel,
  rationale,
  rulesVersion,
}: {
  components: Record<ScoreComponent, number>;
  /** From `readSnapshotWeights(score.weightsSnapshot)` — NEVER DEFAULT_WEIGHTS. */
  weights: Record<ScoreComponent, number>;
  overall: number;
  band: ScoreBand;
  /** `adjustmentLabelFor(score.explanations)`. */
  adjustmentLabel: AdjustmentLabel;
  /** One line: `ListingScore.recommendedAction`, or the top CONCERN. */
  rationale?: string;
  /** e.g. `6`, printed as `RULES V6` in the caption. */
  rulesVersion?: number;
}) {
  const rows = ledgerRows(components, weights);
  const sub = subtotal(rows);
  const adj = adjustment(overall, sub);
  const showAdj = !adjustmentVanishes(adj);

  return (
    <Well
      label="Assessment ledger"
      right={rulesVersion != null ? `RULES V${rulesVersion}` : undefined}
    >
      <table className="w-full border-collapse">
        <caption className="sr-only">
          Score components, each weight and its contribution, totalling {overall}.
        </caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.component}>
              <td
                className={`whitespace-nowrap py-[3px] pr-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.04em] ${
                  r.shortfall ? WELL_TEXT[r.tone] : "text-well-fg"
                }`}
              >
                {r.label}
              </td>
              <td className="whitespace-nowrap py-[3px] pr-2 text-right font-mono text-[10.5px] text-well-muted">
                of {r.weight}
              </td>
              <td className="w-[96px] py-[3px]">
                <span className="block h-1 rounded-[1px] bg-well-grid">
                  <span
                    className="block h-1 rounded-[1px]"
                    style={{ width: `${r.fill * 100}%`, background: WELL_VAR[r.tone] }}
                  />
                </span>
              </td>
              <td
                className={`whitespace-nowrap py-[3px] pl-2.5 text-right font-mono text-[11px] font-semibold tabular-nums ${
                  r.shortfall ? WELL_TEXT[r.tone] : "text-well-fg"
                }`}
              >
                {fmt2(r.contribution)}
              </td>
            </tr>
          ))}

          <tr>
            <td colSpan={3} className="pt-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-well-muted">
              Σ Subtotal
            </td>
            <td className="pt-2 text-right font-mono text-[11px] tabular-nums text-well-muted">
              {fmt2(sub)}
            </td>
          </tr>

          {showAdj ? (
            <tr>
              <td colSpan={3} className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-well-muted">
                {adjustmentLabel}
              </td>
              <td className="text-right font-mono text-[11px] tabular-nums text-well-muted">
                {fmt2Signed(adj)}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="mt-2 flex items-baseline border-b-[3px] border-t border-double border-b-well-fg border-t-well-fg py-1.5 font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] text-well-fg">
        <span>Score</span>
        <span className="ml-auto tabular-nums">{overall}</span>
        <span aria-hidden className="mx-1.5 text-well-muted">
          ·
        </span>
        <Band band={band} well />
      </div>

      {rationale ? (
        <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-well-muted">{rationale}</p>
      ) : null}
    </Well>
  );
}
