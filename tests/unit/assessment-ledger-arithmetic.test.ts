import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, SCORE_COMPONENTS, type ScoreComponent } from "@/lib/constants";
import { adjustment, ledgerRows, subtotal } from "@/lib/scoring-display";
import {
  adjustmentVanishes,
  fmt2,
  fmt2Signed,
} from "@/components/register/assessment-ledger";

/* ── What this file pins ───────────────────────────────────────────────────
   The assessment ledger's claim is that its arithmetic is auditable: a reader
   adds the visible contribution column, adds the visible adjustment, and gets
   the visible score. That claim is about the PRINTED strings, not about the
   floats behind them — it broke once already at one decimal, where 23.75 and
   8.25 printed as 23.8 and 8.3 and pushed a column that really summed to 79.9
   up to a visible 80.0.

   So these tests add the printed strings back up, exactly as a reader would.

   The guarantee holds over integer subscores and integer weights, which is
   the whole domain the app can produce: `ListingScore`'s eight component
   columns are `Int`, and `settingsBodySchema.scoringWeights` validates every
   weight as `z.number().int()` summing to 100. */

const asRecord = (values: number[]): Record<ScoreComponent, number> =>
  Object.fromEntries(SCORE_COMPONENTS.map((c, i) => [c, values[i]])) as Record<
    ScoreComponent,
    number
  >;

/** Adds a column of printed decimal strings the way a reader does. */
const addColumn = (printed: string[]): number =>
  Math.round(printed.reduce((acc, s) => acc + Number(s) * 100, 0)) / 100;

/** A deterministic 32-bit LCG — a fixed seed keeps failures reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Eight non-negative integers summing to exactly 100, like the write path. */
function randomWeights(rand: () => number): Record<ScoreComponent, number> {
  const raw = SCORE_COMPONENTS.map(() => Math.floor(rand() * 30));
  const total = raw.reduce((a, b) => a + b, 0);
  if (total === 0) return { ...DEFAULT_WEIGHTS };
  // Largest-remainder apportionment to 100, so the result is integral AND exact.
  const exact = raw.map((r) => (r * 100) / total);
  const floors = exact.map(Math.floor);
  let short = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (short <= 0) break;
    floors[i] += 1;
    short -= 1;
  }
  return asRecord(floors);
}

describe("fmt2", () => {
  it("always prints two decimals, so the column is a column", () => {
    expect(fmt2(3)).toBe("3.00");
    expect(fmt2(23.75)).toBe("23.75");
    expect(fmt2(8.25)).toBe("8.25");
    expect(fmt2(0)).toBe("0.00");
  });

  it("never prints a negative zero", () => {
    expect(fmt2(-0)).toBe("0.00");
    expect(fmt2(-0.0004)).toBe("0.00");
  });

  it("signs the adjustment row explicitly", () => {
    expect(fmt2Signed(0.1)).toBe("+0.10");
    expect(fmt2Signed(-12)).toBe("-12.00");
    expect(fmt2Signed(0)).toBe("+0.00");
  });
});

describe("the adjustment row is hidden only when it prints as zero", () => {
  it("hides a true zero", () => {
    expect(adjustmentVanishes(0)).toBe(true);
    expect(adjustmentVanishes(-0.004)).toBe(true);
  });

  /* The shared `adjustmentIsZero` suppresses anything under 0.05 — correct at
     one decimal, and at two decimals it would hide a gap the column shows. */
  it("keeps a hundredths-scale gap that one-decimal rounding would have hidden", () => {
    expect(adjustmentVanishes(0.03)).toBe(false);
    expect(adjustmentVanishes(-0.04)).toBe(false);
    expect(fmt2Signed(0.03)).toBe("+0.03");
  });
});

describe("the visible ledger closes", () => {
  /* The exact record the reviewer checked: TikTok Q-01, score 80. Eight
     printed contributions that used to add to 80.0 over a subtotal of 79.9. */
  const Q01_SUBSCORES = asRecord([
    55, // careerValue    of 15 → 8.25
    95, // sponsorship    of 25 → 23.75
    85, // roleAlignment  of 30 → 25.50
    71, // companyQuality of 20 → 14.20
    60, // ugEligibility  of 3  → 1.80
    100, // compensation  of 3  → 3.00
    100, // locationFit   of 2  → 2.00
    70, // freshness      of 2  → 1.40
  ]);

  it("prints the record that failed the audit so that it adds up", () => {
    const rows = ledgerRows(Q01_SUBSCORES, DEFAULT_WEIGHTS);
    const printed = rows.map((r) => fmt2(r.contribution));
    expect(printed.sort()).toEqual(
      ["25.50", "23.75", "14.20", "8.25", "1.80", "3.00", "2.00", "1.40"].sort()
    );

    const sub = subtotal(rows);
    expect(fmt2(sub)).toBe("79.90");
    expect(addColumn(printed)).toBe(Number(fmt2(sub)));

    const adj = adjustment(80, sub);
    expect(fmt2Signed(adj)).toBe("+0.10");
    expect(addColumn([...printed, fmt2(adj)])).toBe(80);
  });

  it("closes for every integer profile, over 400 random weightings", () => {
    const rand = lcg(0x5eed);
    for (let n = 0; n < 400; n += 1) {
      const weights = randomWeights(rand);
      const components = asRecord(SCORE_COMPONENTS.map(() => Math.floor(rand() * 101)));
      const rows = ledgerRows(components, weights);
      const printed = rows.map((r) => fmt2(r.contribution));
      const sub = subtotal(rows);

      // 1 · the column a reader adds equals the subtotal that is printed.
      expect(addColumn(printed), JSON.stringify({ weights, components })).toBe(
        Number(fmt2(sub))
      );

      // 2 · subtotal plus the printed adjustment equals the printed score.
      const overall = Math.max(0, Math.min(100, Math.round(sub) - (n % 3) * 6));
      const adj = adjustment(overall, sub);
      const withAdj = adjustmentVanishes(adj) ? printed : [...printed, fmt2Signed(adj)];
      expect(addColumn(withAdj), JSON.stringify({ overall, sub })).toBe(overall);
    }
  });

  /* Rule 2 above is only honest if the hidden case is actually reachable —
     otherwise the branch that suppresses the row is never exercised. */
  it("exercises the suppressed-adjustment branch", () => {
    const rows = ledgerRows(asRecord([100, 100, 100, 100, 100, 100, 100, 100]), DEFAULT_WEIGHTS);
    const sub = subtotal(rows);
    expect(fmt2(sub)).toBe("100.00");
    expect(adjustmentVanishes(adjustment(100, sub))).toBe(true);
  });
});
