import { describe, expect, it } from "vitest";
import {
  adjustment,
  adjustmentIsZero,
  adjustmentLabelFor,
  barTone,
  fmt1,
  fmt1Signed,
  ledgerRows,
  readSnapshotWeights,
  subtotal,
} from "@/lib/scoring-display";
import { DEFAULT_WEIGHTS, SCORE_COMPONENTS, type ScoreComponent } from "@/lib/constants";

/** The atelier mock's record: Q-04, IMC Trading, 73 · REACH. */
const MOCK_COMPONENTS: Record<ScoreComponent, number> = {
  roleAlignment: 70,
  sponsorship: 56,
  companyQuality: 80,
  careerValue: 80,
  ugEligibility: 100,
  compensation: 100,
  locationFit: 100,
  freshness: 100,
};

describe("readSnapshotWeights", () => {
  it("reads the new { weights, … } snapshot shape", () => {
    const w = readSnapshotWeights({
      weights: { ...DEFAULT_WEIGHTS, sponsorship: 25 },
      roleAlignmentScores: {},
      bandThresholds: [],
    });
    expect(w).toEqual(DEFAULT_WEIGHTS);
  });

  it("reads the legacy bare-weights row", () => {
    expect(readSnapshotWeights({ ...DEFAULT_WEIGHTS })).toEqual(DEFAULT_WEIGHTS);
  });

  it("honours a re-weighted profile rather than the app defaults", () => {
    const custom = { ...DEFAULT_WEIGHTS, roleAlignment: 10, sponsorship: 45 };
    expect(readSnapshotWeights({ weights: custom }).roleAlignment).toBe(10);
    expect(readSnapshotWeights({ weights: custom }).sponsorship).toBe(45);
  });

  it("falls back per component — a malformed snapshot degrades, never NaNs", () => {
    const w = readSnapshotWeights({ weights: { roleAlignment: "30", sponsorship: 25 } });
    expect(w.roleAlignment).toBe(DEFAULT_WEIGHTS.roleAlignment); // string is not a number
    expect(w.sponsorship).toBe(25);
    for (const c of SCORE_COMPONENTS) expect(Number.isFinite(w[c])).toBe(true);
  });

  it("survives null, undefined and non-objects", () => {
    for (const bad of [null, undefined, 7, "weights", []]) {
      expect(readSnapshotWeights(bad)).toEqual(DEFAULT_WEIGHTS);
    }
  });
});

describe("barTone — the three-step ramp", () => {
  it("splits at 75 and 45", () => {
    expect(barTone(100)).toBe("green");
    expect(barTone(75)).toBe("green");
    expect(barTone(74)).toBe("ochre");
    expect(barTone(45)).toBe("ochre");
    expect(barTone(44)).toBe("carmine");
    expect(barTone(0)).toBe("carmine");
  });

  it("reproduces the mock's colors", () => {
    expect(barTone(70)).toBe("ochre"); // roleAlignment
    expect(barTone(56)).toBe("ochre"); // sponsorship
    expect(barTone(80)).toBe("green"); // companyQuality, careerValue
  });
});

describe("ledgerRows", () => {
  const rows = ledgerRows(MOCK_COMPONENTS, DEFAULT_WEIGHTS);

  it("sorts by weight descending, ties by SCORE_COMPONENTS index", () => {
    expect(rows.map((r) => r.component)).toEqual([
      "roleAlignment",
      "sponsorship",
      "companyQuality",
      "careerValue",
      "ugEligibility", // ties at 3 with compensation — declared first
      "compensation",
      "locationFit", // ties at 2 with freshness — declared first
      "freshness",
    ]);
  });

  it("computes the mock's contributions exactly", () => {
    expect(rows.map((r) => r.contribution)).toEqual([21, 14, 16, 12, 3, 3, 2, 2]);
  });

  it("fills each bar at subscore/100, equal to contribution/weight", () => {
    for (const r of rows) {
      expect(r.fill).toBeCloseTo(r.subscore / 100, 10);
      if (r.weight > 0) expect(r.fill).toBeCloseTo(r.contribution / r.weight, 10);
    }
  });

  it("marks exactly one shortfall — SPONSORSHIP in the mock (25−14 beats 30−21)", () => {
    const flagged = rows.filter((r) => r.shortfall);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].component).toBe("sponsorship");
  });

  it("marks no shortfall when every component is perfect", () => {
    const perfect = Object.fromEntries(
      SCORE_COMPONENTS.map((c) => [c, 100]),
    ) as Record<ScoreComponent, number>;
    expect(ledgerRows(perfect, DEFAULT_WEIGHTS).some((r) => r.shortfall)).toBe(false);
  });

  it("re-orders when the profile is re-weighted", () => {
    const reweighted = { ...DEFAULT_WEIGHTS, roleAlignment: 5, freshness: 27 };
    const out = ledgerRows(MOCK_COMPONENTS, reweighted);
    expect(out[0].component).toBe("freshness");
  });

  it("always emits all eight components", () => {
    expect(rows).toHaveLength(SCORE_COMPONENTS.length);
  });
});

describe("the column closes by construction", () => {
  it("subtotal is the scorer's raw", () => {
    const raw =
      SCORE_COMPONENTS.reduce((acc, c) => acc + MOCK_COMPONENTS[c] * DEFAULT_WEIGHTS[c], 0) / 100;
    expect(subtotal(ledgerRows(MOCK_COMPONENTS, DEFAULT_WEIGHTS))).toBeCloseTo(raw, 10);
  });

  it("subtotal + adjustment === overall, for any overall", () => {
    const sub = subtotal(ledgerRows(MOCK_COMPONENTS, DEFAULT_WEIGHTS));
    for (const overall of [73, 61, 100, 0, 85]) {
      expect(sub + adjustment(overall, sub)).toBeCloseTo(overall, 10);
    }
  });

  it("absorbs the unpersisted season penalty: 73 shown against a subtotal of 73", () => {
    const sub = subtotal(ledgerRows(MOCK_COMPONENTS, DEFAULT_WEIGHTS));
    expect(sub).toBe(73);
    // An EXPLICIT-season record scores its raw: the adjustment row disappears.
    expect(adjustmentIsZero(adjustment(73, sub))).toBe(true);
    // An UNKNOWN-season record loses 12: the row shows exactly −12.
    expect(fmt1Signed(adjustment(61, sub))).toBe("-12");
  });

  it("hides the row only when the ROUNDED adjustment is zero", () => {
    expect(adjustmentIsZero(0)).toBe(true);
    expect(adjustmentIsZero(0.04)).toBe(true);
    expect(adjustmentIsZero(-0.04)).toBe(true);
    expect(adjustmentIsZero(0.4)).toBe(false);
    expect(adjustmentIsZero(-8)).toBe(false);
  });
});

describe("adjustmentLabelFor", () => {
  it("names the season penalty when a MISSING season explanation is present", () => {
    expect(
      adjustmentLabelFor([
        { kind: "CONCERN", text: "Generalist role profile" },
        { kind: "MISSING", text: "Season not confirmed — could be a different cycle" },
      ]),
    ).toBe("SEASON ADJUSTMENT");

    expect(
      adjustmentLabelFor([
        { kind: "MISSING", text: "Season inferred from the source list, not stated in the posting" },
      ]),
    ).toBe("SEASON ADJUSTMENT");
  });

  it("falls back to ROUNDING", () => {
    expect(adjustmentLabelFor([{ kind: "MISSING", text: "No sponsorship information" }])).toBe(
      "ROUNDING",
    );
    expect(adjustmentLabelFor([])).toBe("ROUNDING");
    expect(adjustmentLabelFor(null)).toBe("ROUNDING");
    expect(adjustmentLabelFor(undefined)).toBe("ROUNDING");
  });

  it("does not treat a season mention of another kind as the penalty", () => {
    expect(adjustmentLabelFor([{ kind: "POSITIVE", text: "Season not confirmed" }])).toBe(
      "ROUNDING",
    );
  });
});

describe("fmt1", () => {
  it("trims a trailing .0", () => {
    expect(fmt1(21)).toBe("21");
    expect(fmt1(21.0)).toBe("21");
    expect(fmt1(-8)).toBe("-8");
  });

  it("keeps one decimal when there is one", () => {
    expect(fmt1(13.5)).toBe("13.5");
    expect(fmt1(72.34)).toBe("72.3");
    expect(fmt1(72.35)).toBe("72.4");
  });

  it("never prints a negative zero", () => {
    expect(fmt1(-0.01)).toBe("0");
    expect(fmt1(-0)).toBe("0");
  });

  it("signs the adjustment row", () => {
    expect(fmt1Signed(0.4)).toBe("+0.4");
    expect(fmt1Signed(-12)).toBe("-12");
    expect(fmt1Signed(0)).toBe("+0");
  });
});
