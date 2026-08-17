import { describe, expect, it } from "vitest";
import {
  settingsBodySchema,
  validateSettingsSemantics,
  type SettingsBody,
} from "@/app/api/settings/validation";
import { BAND_THRESHOLDS, ROLE_ALIGNMENT_SCORES } from "@/lib/constants";

const parse = (body: unknown) => settingsBodySchema.safeParse(body);

const validRoles = { ...ROLE_ALIGNMENT_SCORES };
const validBands = BAND_THRESHOLDS.map(({ band, min }) => ({ band, min }));

describe("settings body schema", () => {
  it("accepts an empty patch (all fields optional)", () => {
    expect(parse({}).success).toBe(true);
  });

  it("accepts null for every new knob — null clears the override", () => {
    const r = parse({
      graduationDate: null,
      targetSeason: null,
      sponsorshipRequired: null,
      roleAlignmentScores: null,
      bandThresholds: null,
    });
    expect(r.success).toBe(true);
  });

  describe("targetSeason", () => {
    it("accepts any TERM_YYYY cycle the pattern generator supports", () => {
      for (const s of ["SUMMER_2027", "SUMMER_2028", "FALL_2027", "WINTER_2028", "SPRING_2029"]) {
        expect(parse({ targetSeason: s }).success).toBe(true);
      }
    });

    it("rejects malformed seasons", () => {
      for (const s of ["AUTUMN_2027", "summer_2027", "SUMMER_27", "SUMMER-2027", "2027_SUMMER", ""]) {
        expect(parse({ targetSeason: s }).success).toBe(false);
      }
    });
  });

  describe("graduationDate", () => {
    it("accepts an ISO date", () => {
      expect(parse({ graduationDate: "2028-06-15" }).success).toBe(true);
    });

    it("rejects non-ISO and impossible dates", () => {
      for (const d of ["June 2028", "2028-13-01", "2028-06-15T00:00:00Z", "15-06-2028"]) {
        expect(parse({ graduationDate: d }).success).toBe(false);
      }
    });
  });

  describe("sponsorshipRequired", () => {
    it("accepts booleans", () => {
      expect(parse({ sponsorshipRequired: true }).success).toBe(true);
      expect(parse({ sponsorshipRequired: false }).success).toBe(true);
    });

    it("rejects non-booleans", () => {
      expect(parse({ sponsorshipRequired: "yes" }).success).toBe(false);
      expect(parse({ sponsorshipRequired: 1 }).success).toBe(false);
    });
  });

  describe("notationMode", () => {
    it("accepts both grammars", () => {
      expect(parse({ notationMode: "PLAIN" }).success).toBe(true);
      expect(parse({ notationMode: "COMPACT" }).success).toBe(true);
    });

    it("rejects anything else — an unknown grammar would render as blank codes", () => {
      for (const m of ["plain", "Compact", "TERSE", "", null, 1, true]) {
        expect(parse({ notationMode: m }).success).toBe(false);
      }
    });

    it("is optional, and null does NOT clear it — the column is NOT NULL", () => {
      expect(parse({}).success).toBe(true);
      expect(parse({ notationMode: null }).success).toBe(false);
    });

    it("needs no cross-field rule", () => {
      expect(validateSettingsSemantics({ notationMode: "COMPACT" })).toBeNull();
    });
  });

  describe("roleAlignmentScores", () => {
    it("accepts the full 13-category record", () => {
      expect(parse({ roleAlignmentScores: validRoles }).success).toBe(true);
    });

    it("rejects a missing category", () => {
      const partial: Partial<typeof validRoles> = { ...validRoles };
      delete partial.AI_ENGINEERING;
      expect(parse({ roleAlignmentScores: partial }).success).toBe(false);
    });

    it("rejects an unknown category", () => {
      expect(
        parse({ roleAlignmentScores: { ...validRoles, QUANT_TRADING: 50 } }).success
      ).toBe(false);
    });

    it("rejects out-of-range and non-integer scores", () => {
      expect(parse({ roleAlignmentScores: { ...validRoles, RESEARCH: 101 } }).success).toBe(false);
      expect(parse({ roleAlignmentScores: { ...validRoles, RESEARCH: -1 } }).success).toBe(false);
      expect(parse({ roleAlignmentScores: { ...validRoles, RESEARCH: 40.5 } }).success).toBe(false);
    });
  });

  describe("bandThresholds shape", () => {
    it("accepts the full default ladder", () => {
      expect(parse({ bandThresholds: validBands }).success).toBe(true);
    });

    it("rejects a short list", () => {
      expect(parse({ bandThresholds: validBands.slice(0, 5) }).success).toBe(false);
    });

    it("rejects an unknown band or out-of-range minimum", () => {
      expect(
        parse({ bandThresholds: [...validBands.slice(1), { band: "GODLIKE", min: 99 }] }).success
      ).toBe(false);
      expect(
        parse({
          bandThresholds: validBands.map((t) =>
            t.band === "EXCEPTIONAL" ? { ...t, min: 101 } : t
          ),
        }).success
      ).toBe(false);
    });
  });
});

describe("validateSettingsSemantics", () => {
  const semantic = (body: SettingsBody) => validateSettingsSemantics(body);

  it("passes a fully valid body", () => {
    expect(
      semantic({
        scoringWeights: {
          careerValue: 15,
          sponsorship: 25,
          roleAlignment: 30,
          companyQuality: 20,
          ugEligibility: 3,
          compensation: 3,
          locationFit: 2,
          freshness: 2,
        },
        timezone: "America/Los_Angeles",
        bandThresholds: validBands,
      })
    ).toBeNull();
  });

  it("rejects weights that do not sum to 100, naming the sum", () => {
    const err = semantic({
      scoringWeights: {
        careerValue: 20,
        sponsorship: 25,
        roleAlignment: 30,
        companyQuality: 20,
        ugEligibility: 3,
        compensation: 3,
        locationFit: 2,
        freshness: 2,
      },
    });
    expect(err).toContain("must sum to exactly 100");
    expect(err).toContain("105");
  });

  it("rejects an unknown timezone", () => {
    expect(semantic({ timezone: "America/Corvallis" })).toContain("Unknown timezone");
  });

  it("rejects duplicated bands", () => {
    // Six entries, but EXCEPTIONAL twice and HIGH_PRIORITY missing.
    const dup = validBands.map((t) =>
      t.band === "HIGH_PRIORITY" ? { band: "EXCEPTIONAL" as const, min: 75 } : t
    );
    expect(semantic({ bandThresholds: dup })).toContain("exactly once");
  });

  it("rejects a non-descending ladder, naming the offending pair", () => {
    const bad = validBands.map((t) => (t.band === "STRONG" ? { ...t, min: 80 } : t));
    const err = semantic({ bandThresholds: bad });
    expect(err).toContain("strictly descending");
    expect(err).toContain("STRONG");
    expect(err).toContain("HIGH_PRIORITY");
  });

  it("rejects equal neighbours — the upper band would be unreachable", () => {
    const bad = validBands.map((t) => (t.band === "HIGH_PRIORITY" ? { ...t, min: 85 } : t));
    expect(semantic({ bandThresholds: bad })).toContain("strictly descending");
  });

  it("rejects a moved LOW_PRIORITY floor — scoring falls through to it at any score", () => {
    const bad = validBands.map((t) => (t.band === "LOW_PRIORITY" ? { ...t, min: 10 } : t));
    expect(semantic({ bandThresholds: bad })).toContain("LOW_PRIORITY");
  });

  it("accepts a custom valid ladder", () => {
    const custom = [
      { band: "EXCEPTIONAL" as const, min: 90 },
      { band: "HIGH_PRIORITY" as const, min: 80 },
      { band: "STRONG" as const, min: 60 },
      { band: "WORTH_REVIEWING" as const, min: 40 },
      { band: "REACH" as const, min: 20 },
      { band: "LOW_PRIORITY" as const, min: 0 },
    ];
    expect(semantic({ bandThresholds: custom })).toBeNull();
  });
});
