import { describe, expect, it } from "vitest";
import {
  NotationMode as PrismaNotationMode,
  ScoreBand,
  SponsorshipCategory,
  SponsorshipConfidence,
} from "@prisma/client";
import {
  DEFAULT_NOTATION,
  ESTIMATED_ARIA,
  ESTIMATED_SUFFIX,
  NOTATION_MODES,
  type NotationMode,
  bandAria,
  bandText,
  bandTitle,
  confidenceTitle,
  pipGlyphs,
  sponsorshipAria,
  sponsorshipText,
  sponsorshipTitle,
} from "@/lib/notation";
import {
  BAND_CODES,
  BAND_LABELS,
  BAND_PLAIN,
  CONFIDENCE_LABELS,
  PIP_SPEC,
  SPONSORSHIP_CODES,
  SPONSORSHIP_LABELS,
  SPONSORSHIP_PLAIN,
  bandColor,
} from "@/lib/format";
import { BAND_ORDER, BAND_THRESHOLDS } from "@/lib/constants";

/** Every value the schema can actually store, read from the generated enum. */
const BANDS = Object.values(ScoreBand);
const CATEGORIES = Object.values(SponsorshipCategory);
const CONFIDENCES = Object.values(SponsorshipConfidence);

describe("the notation mode the app falls back to", () => {
  // Both fallbacks in readUiPrefs return this, and so does every unmigrated
  // row. If it ever became COMPACT, a database hiccup would answer with codes
  // the reader has no key for — the one thing the guard exists to prevent.
  it("is the spelled-out grammar, never the coded one", () => {
    expect(DEFAULT_NOTATION).toBe("PLAIN");
  });

  it("mirrors the column default in prisma/schema.prisma", () => {
    // notationMode NotationMode @default(PLAIN). A row the database defaulted
    // and a row that predates the column must render identically.
    expect(DEFAULT_NOTATION).toBe(PrismaNotationMode.PLAIN);
  });

  it("is a mode the app can actually be switched into", () => {
    expect(NOTATION_MODES).toContain(DEFAULT_NOTATION);
  });

  // notation.ts declares its own union instead of importing the generated one,
  // deliberately — but that means nothing in the compiler couples the two. Add
  // a mode to the schema and forget this list and the resolvers below fall
  // through to their PLAIN branch for it, silently, with no type error.
  it("enumerates exactly the modes the Prisma enum declares", () => {
    expect([...NOTATION_MODES].sort()).toEqual(Object.values(PrismaNotationMode).sort());
  });

  // The module claims the two types are "assignable in both directions". These
  // two lines are the assertion; they are checked by tsc, not at runtime.
  it("stays assignable to and from the generated enum", () => {
    const fromPrisma: NotationMode = PrismaNotationMode.COMPACT;
    const toPrisma: PrismaNotationMode = DEFAULT_NOTATION;
    expect([fromPrisma, toPrisma]).toEqual(["COMPACT", "PLAIN"]);
  });
});

/* ── The band ladder ───────────────────────────────────────────────────────
   The recurring misreading, written into src/lib/format.ts as a correction to
   the original spec: REACH sounds aspirational, so it gets read as a strong
   outcome. It is not. It is the second-worst band a scored listing can hold. A
   reorder that "fixes" it upward would silently promote the weakest half of
   the pile into the reader's attention, and nothing else in the app would
   complain — the bands are stored, not derived, so no scoring test would move. */
describe("where REACH actually sits on the band ladder", () => {
  it("is the second-lowest scored band, floored at 45", () => {
    const floors = BAND_THRESHOLDS.map((t) => t.band);
    expect(floors.at(-2)).toBe("REACH");
    expect(BAND_THRESHOLDS.find((t) => t.band === "REACH")?.min).toBe(45);
  });

  it("scores below WORTH_REVIEWING and above only LOW_PRIORITY", () => {
    const floorOf = (band: ScoreBand) => BAND_THRESHOLDS.find((t) => t.band === band)?.min;
    expect(floorOf("REACH")).toBeLessThan(floorOf("WORTH_REVIEWING")!);
    expect(floorOf("REACH")).toBeGreaterThan(floorOf("LOW_PRIORITY")!);
  });

  it("is ranked below every band except LOW_PRIORITY and INELIGIBLE", () => {
    expect(BAND_ORDER.slice(BAND_ORDER.indexOf("REACH"))).toEqual([
      "REACH",
      "LOW_PRIORITY",
      "INELIGIBLE",
    ]);
  });

  // Colour is the fastest read on the page; a green REACH would say "good"
  // before the word did. Ochre is the caution token.
  it("wears a caution colour, not a success one", () => {
    expect(bandColor("REACH")).toBe("ochre");
    expect(bandColor("REACH")).not.toBe(bandColor("EXCEPTIONAL"));
  });
});

describe("the band ladder as a whole", () => {
  it("ranks all seven bands, in one order, with nothing left out", () => {
    expect(BANDS).toHaveLength(7);
    expect([...BAND_ORDER].sort()).toEqual([...BANDS].sort());
  });

  // The scored ladder is the six bands a number can land in. INELIGIBLE is a
  // verdict, not a threshold — it is reached by a hard reject, so a floor for
  // it would let a merely-low score be printed as ineligible.
  it("keeps INELIGIBLE off the score thresholds entirely", () => {
    expect(BAND_THRESHOLDS.map((t) => t.band)).not.toContain("INELIGIBLE");
    expect(BAND_THRESHOLDS).toHaveLength(BANDS.length - 1);
  });

  it("descends strictly, so exactly one band can claim any score", () => {
    const mins = BAND_THRESHOLDS.map((t) => t.min);
    for (let i = 1; i < mins.length; i++) {
      expect(mins[i], `${BAND_THRESHOLDS[i].band} vs ${BAND_THRESHOLDS[i - 1].band}`).toBeLessThan(
        mins[i - 1]
      );
    }
    expect(mins.at(-1)).toBe(0); // the ladder has a floor; no score falls through
  });
});

describe("visible band notation", () => {
  it("spells the band out in PLAIN and prints its register code in COMPACT", () => {
    expect(bandText("EXCEPTIONAL", "PLAIN")).toBe("EXCEPTIONAL");
    expect(bandText("EXCEPTIONAL", "COMPACT")).toBe("EXC");
    expect(bandText("WORTH_REVIEWING", "PLAIN")).toBe("WORTH REVIEWING");
    expect(bandText("WORTH_REVIEWING", "COMPACT")).toBe("WRV");
    expect(bandText("REACH", "PLAIN")).toBe("REACH");
    expect(bandText("REACH", "COMPACT")).toBe("RCH");
  });

  // A band with no entry in one of the maps renders as `undefined` in the
  // ledger cell — a lookup miss, not a crash, so nothing else would catch it.
  it("resolves every band in both modes", () => {
    for (const band of BANDS) {
      expect(bandText(band, "PLAIN"), band).toBe(BAND_PLAIN[band]);
      expect(bandText(band, "COMPACT"), band).toBe(BAND_CODES[band]);
      expect(bandText(band, "PLAIN"), band).toBeTruthy();
      expect(bandText(band, "COMPACT"), band).toBeTruthy();
    }
  });

  it("gives every band its own code, so no code names two bands", () => {
    expect(new Set(Object.values(BAND_CODES)).size).toBe(BANDS.length);
    expect(new Set(Object.values(BAND_PLAIN)).size).toBe(BANDS.length);
  });

  // An unscored record is a blank in the ledger, not a verdict. The placeholder
  // must not be mode-dependent: a COMPACT reader would otherwise learn a second
  // vocabulary for "nothing here".
  it("prints the same em placeholder for an unscored record in both modes", () => {
    for (const mode of NOTATION_MODES) {
      expect(bandText(null, mode), mode).toBe("—");
      expect(bandText(undefined, mode), mode).toBe("—");
    }
  });
});

describe("the band's plain-English expansion", () => {
  // SYNTHESIS §2.1: the title carries the expansion in BOTH modes, because a
  // COMPACT reader is exactly the reader who cannot decode the visible mark.
  it("is the full label whatever the mode, and never just the code again", () => {
    for (const band of BANDS) {
      expect(bandTitle(band), band).toBe(BAND_LABELS[band]);
      expect(bandTitle(band).toUpperCase(), band).not.toBe(bandText(band, "COMPACT"));
    }
  });

  it("says the record is unscored rather than going blank", () => {
    expect(bandTitle(null)).toBe("Not yet scored");
    expect(bandTitle(undefined)).toBe("Not yet scored");
  });
});

describe("the band's accessible name", () => {
  it("reads the word, never the code, and prefixes the score when there is one", () => {
    expect(bandAria("STRONG", 72)).toBe("Score 72, Strong");
    expect(bandAria("REACH")).toBe("Reach");
    expect(bandAria("REACH", null)).toBe("Reach");
    expect(bandAria(null, null)).toBe("Not yet scored");
  });

  // `score == null` and not `!score`. A listing really can score 0, and a
  // truthiness check would announce it as unscored — the one number where
  // "no score" and "the score" are the most different things.
  it("announces a score of zero as a score, not as a missing one", () => {
    expect(bandAria("INELIGIBLE", 0)).toBe("Score 0, Ineligible");
    expect(bandAria("LOW_PRIORITY", 0)).not.toBe(bandAria("LOW_PRIORITY", null));
  });
});

describe("visible sponsorship notation", () => {
  it("resolves every one of the eleven categories in both modes", () => {
    expect(CATEGORIES).toHaveLength(11);
    for (const category of CATEGORIES) {
      expect(sponsorshipText(category, "PLAIN"), category).toBe(SPONSORSHIP_PLAIN[category]);
      expect(sponsorshipText(category, "COMPACT"), category).toBe(SPONSORSHIP_CODES[category]);
      expect(sponsorshipText(category, "PLAIN"), category).toBeTruthy();
      expect(sponsorshipText(category, "COMPACT"), category).toBeTruthy();
    }
  });

  it("gives every category its own mark within each mode", () => {
    expect(new Set(Object.values(SPONSORSHIP_PLAIN)).size).toBe(CATEGORIES.length);
    expect(new Set(Object.values(SPONSORSHIP_CODES)).size).toBe(CATEGORIES.length);
  });

  // Deliberately unlike the band placeholder. An unscored band is a blank cell;
  // un-analyzed sponsorship is a fact about the record the reader has to know,
  // so it is stated in words rather than dashed out.
  it("states that sponsorship was not analyzed instead of dashing the cell", () => {
    expect(sponsorshipText(null, "PLAIN")).toBe("NOT ANALYZED");
    expect(sponsorshipText(null, "COMPACT")).toBe("N/A");
    expect(sponsorshipText(undefined, "PLAIN")).toBe("NOT ANALYZED");
    expect(sponsorshipText(undefined, "COMPACT")).toBe("N/A");
  });

  // "No sponsorship info found" (NO_INFO) and "not analyzed yet" are different
  // claims: one is an answer, the other is the absence of one. If the
  // placeholder ever collided with a real category's mark the reader could not
  // tell "we looked and found nothing" from "we never looked".
  it("uses a placeholder no real category also prints", () => {
    for (const mode of NOTATION_MODES) {
      const placeholder = sponsorshipText(null, mode);
      const real = CATEGORIES.map((c) => sponsorshipText(c, mode));
      expect(real, `${mode}: ${placeholder}`).not.toContain(placeholder);
    }
  });
});

describe("the sponsorship title and confidence wording", () => {
  it("is the full sentence for every category, in both modes", () => {
    for (const category of CATEGORIES) {
      expect(sponsorshipTitle(category), category).toBe(SPONSORSHIP_LABELS[category]);
    }
  });

  it("names the absence of an analysis rather than returning empty", () => {
    expect(sponsorshipTitle(null)).toBe("Sponsorship not yet analyzed");
    expect(sponsorshipTitle(undefined)).toBe("Sponsorship not yet analyzed");
  });

  // The confidence column is nullable; the enum is not. Missing confidence is
  // read as UNKNOWN rather than indexing the map with null and yielding
  // `undefined`, which would print "undefined" into a title attribute.
  it("reads a missing confidence as UNKNOWN", () => {
    expect(confidenceTitle(null)).toBe(CONFIDENCE_LABELS.UNKNOWN);
    expect(confidenceTitle(undefined)).toBe("Unknown");
    for (const c of CONFIDENCES) expect(confidenceTitle(c), c).toBe(CONFIDENCE_LABELS[c]);
  });
});

describe("confidence pips", () => {
  it("draws between one and three marks, never none", () => {
    // Zero pips is an empty string, which renders as an invisible mark: the
    // reader sees a gap and cannot tell it apart from a layout bug.
    for (const c of CONFIDENCES) {
      const glyphs = pipGlyphs(c);
      expect(glyphs.length, c).toBeGreaterThanOrEqual(1);
      expect(glyphs.length, c).toBeLessThanOrEqual(3);
      expect(glyphs, c).toBe("▪".repeat(PIP_SPEC[c].pips));
    }
  });

  it("draws a single mark when confidence is missing entirely", () => {
    expect(pipGlyphs(null)).toBe("▪");
    expect(pipGlyphs(undefined)).toBe("▪");
  });

  // D3: the pips are aria-hidden decoration, so the count has to survive in
  // words on the parent label. If the two ever disagreed, a sighted reader and
  // a screen-reader user would be told different things about the same mark.
  it("says the same count in words that it draws in glyphs", () => {
    for (const category of [...CATEGORIES, null]) {
      for (const confidence of [...CONFIDENCES, null]) {
        const aria = sponsorshipAria(category, confidence);
        expect(aria, `${category}/${confidence}`).toContain(
          `(${pipGlyphs(confidence).length} of 3)`
        );
      }
    }
  });

  it("composes the mark's whole accessible name from category, confidence and count", () => {
    expect(sponsorshipAria("SPONSORSHIP_OFFERED", "HIGH")).toBe(
      "Sponsorship offered. High confidence (3 of 3)."
    );
    expect(sponsorshipAria("CITIZENSHIP_REQUIRED", "MODERATE")).toBe(
      "US citizenship required. Moderate confidence (2 of 3)."
    );
    expect(sponsorshipAria(null, null)).toBe("Sponsorship not yet analyzed. Unknown (1 of 3).");
  });

  // Recorded rather than endorsed: EXPLICITLY_UNAVAILABLE is a certainty, but
  // it lives in the confidence enum and draws one pip, so the mark reads
  // "Explicitly unavailable (1 of 3)" — a sure fact wearing a low-confidence
  // count. Pinned so a change to it is a deliberate one.
  it("still draws one pip for an explicit refusal", () => {
    expect(PIP_SPEC.EXPLICITLY_UNAVAILABLE.pips).toBe(1);
    expect(sponsorshipAria("EXPLICITLY_UNAVAILABLE", "EXPLICITLY_UNAVAILABLE")).toBe(
      "No sponsorship (explicit). Explicitly unavailable (1 of 3)."
    );
  });
});

// The certainty stroke has three legs across two surfaces: `~`, the dashed
// underline and the word. Email cannot draw the underline, so it substitutes a
// literal suffix — which only works if it says the same word the screen reader
// does. Drift here means the same estimate is named two different things.
describe("the estimated-value stroke", () => {
  it("says the same word on screen and in email", () => {
    expect(ESTIMATED_SUFFIX).toContain(ESTIMATED_ARIA);
    expect(ESTIMATED_ARIA).toBe("estimated");
    expect(ESTIMATED_SUFFIX).toBe("(estimated)");
  });
});
