import { describe, expect, it } from "vitest";
import {
  COMPARATORS,
  advancePastDecided,
  caretAtIndex,
  flattenVisible,
  groupRowsByBand,
  openingCaret,
  resolveCaret,
  sectionIsOpen,
} from "@/app/review/order";
import type { ReviewRow } from "@/app/review/types";

/* ── What this file is defending ───────────────────────────────────────────
   The docket paints its rows grouped into the band ladder, with the ineligible
   section closed. The caret used to be a flat index into the SORTED array
   instead, so under `?sort=posted` it drew itself on the row rendered 33rd of
   133 while claiming to be on the first one, and `j` moved it 49 rows.

   Every test below is a statement about the order the READER sees. The invariant
   the module exists to keep is that there is exactly one such order —
   `flattenVisible` — and that the caret can only ever be on a row inside it. */

let seq = 0;
const row = (p: Partial<ReviewRow> & { band: ReviewRow["band"] }): ReviewRow => {
  const n = ++seq;
  return {
    decisionId: `d${n}`,
    listingId: p.listingId ?? `l${n}`,
    queuedAt: "2026-08-01T00:00:00.000Z",
    decisionNote: null,
    companyName: "Co",
    title: "Role",
    isSample: false,
    roleCategory: null,
    location: null,
    workArrangement: null,
    compensationText: null,
    score: null,
    // No `band` default: the parameter type requires one, so `...p` below
    // always supplies it and a default here is dead (TS2783).
    sponsorshipCategory: null,
    sponsorshipConfidence: null,
    sourceKind: null,
    topPositive: null,
    topConcern: null,
    deadline: null,
    deadlineIsEstimated: false,
    postingUrl: null,
    applyUrl: null,
    description: null,
    explanations: [],
    assessment: null,
    postedAt: null,
    discoveredAt: "2026-08-01T00:00:00.000Z",
    season: null,
    seasonEvidence: null,
    ugEligibility: null,
    scoreDetail: null,
    ...p,
  } as ReviewRow;
};

const ids = (rows: ReviewRow[]) => rows.map((r) => r.listingId);
const NONE: ReadonlySet<string> = new Set();

describe("the band ladder", () => {
  it("prints sections in ladder order however the rows arrive", () => {
    // Deliberately fed bottom-up: first-appearance order would invert this.
    const groups = groupRowsByBand([
      row({ band: "INELIGIBLE", listingId: "bad" }),
      row({ band: "LOW_PRIORITY", listingId: "low" }),
      row({ band: "HIGH_PRIORITY", listingId: "high" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["HIGH_PRIORITY", "LOW_PRIORITY", "INELIGIBLE"]);
  });

  it("sits unscored records above ineligible, not at the very bottom", () => {
    const groups = groupRowsByBand([
      row({ band: "INELIGIBLE", listingId: "bad" }),
      row({ band: null, listingId: "unscored" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["UNSCORED", "INELIGIBLE"]);
  });

  it("keeps ineligible LAST, which is what makes collapsing it safe", () => {
    // Every band at once. If ineligible were ever not the tail, opening or
    // closing its section would renumber rows above it.
    const groups = groupRowsByBand([
      row({ band: "INELIGIBLE" }),
      row({ band: "REACH" }),
      row({ band: "EXCEPTIONAL" }),
      row({ band: null }),
      row({ band: "STRONG" }),
    ]);
    expect(groups[groups.length - 1].key).toBe("INELIGIBLE");
  });

  it("collapses only the ineligible section", () => {
    const groups = groupRowsByBand([row({ band: "REACH" }), row({ band: "INELIGIBLE" })]);
    expect(sectionIsOpen(groups[0], NONE)).toBe(true);
    expect(sectionIsOpen(groups[1], NONE)).toBe(false);
    expect(sectionIsOpen(groups[1], new Set(["INELIGIBLE"]))).toBe(true);
  });
});

describe("the rendered order", () => {
  const docket = [
    row({ band: "HIGH_PRIORITY", listingId: "h1" }),
    row({ band: "INELIGIBLE", listingId: "x1" }),
    row({ band: "LOW_PRIORITY", listingId: "lo1" }),
    row({ band: "HIGH_PRIORITY", listingId: "h2" }),
    row({ band: "INELIGIBLE", listingId: "x2" }),
  ];

  it("is the ladder, flattened, with collapsed sections contributing nothing", () => {
    const visible = flattenVisible(groupRowsByBand(docket), NONE);
    expect(ids(visible)).toEqual(["h1", "h2", "lo1"]);
  });

  it("appends the collapsible section when it is opened, disturbing nothing above", () => {
    const groups = groupRowsByBand(docket);
    const closed = flattenVisible(groups, NONE);
    const open = flattenVisible(groups, new Set(["INELIGIBLE"]));
    expect(ids(open)).toEqual(["h1", "h2", "lo1", "x1", "x2"]);
    // The prefix is untouched — the reason an index into `visible` is stable
    // across a toggle.
    expect(ids(open).slice(0, closed.length)).toEqual(ids(closed));
  });

  it("never yields a row the reader cannot see", () => {
    const visible = flattenVisible(groupRowsByBand(docket), NONE);
    expect(ids(visible)).not.toContain("x1");
    expect(ids(visible)).not.toContain("x2");
  });
});

describe("the caret", () => {
  const visible = [
    row({ band: "HIGH_PRIORITY", listingId: "a" }),
    row({ band: "HIGH_PRIORITY", listingId: "b" }),
    row({ band: "LOW_PRIORITY", listingId: "c" }),
  ];

  it("opens on the FIRST PAINTED ROW when nothing is selected", () => {
    // This is the regression: `{ id: null }` used to mean "index 0 of the
    // sorted array", which under ?sort=posted was the 33rd row on screen.
    expect(resolveCaret(visible, { id: null, at: 0 })).toBe(0);
  });

  it("follows its record when the docket re-orders under it", () => {
    const resorted = [visible[2], visible[0], visible[1]];
    // Caret was on "b" at index 2; after the re-sort "b" is index 2 again by
    // coincidence, so use "a" which genuinely moves.
    expect(resolveCaret(visible, { id: "a", at: 0 })).toBe(0);
    expect(resolveCaret(resorted, { id: "a", at: 0 })).toBe(1);
  });

  it("falls back to the remembered position when its record stops being visible", () => {
    // "c" collapsed away or left the docket; the caret degrades to a NEARBY
    // row rather than snapping to the top of a long docket.
    const shorter = [visible[0], visible[1]];
    expect(resolveCaret(shorter, { id: "c", at: 2 })).toBe(1);
  });

  it("is -1 only when there is genuinely nothing to see", () => {
    expect(resolveCaret([], { id: "a", at: 0 })).toBe(-1);
  });

  it("clamps at both ends instead of running off the docket", () => {
    expect(caretAtIndex(visible, -1)).toEqual({ id: "a", at: 0 });
    expect(caretAtIndex(visible, 99)).toEqual({ id: "c", at: 2 });
    expect(caretAtIndex([], 0)).toEqual({ id: null, at: 0 });
  });

  it("steps one PAINTED row at a time", () => {
    // j from the first row lands on the second row on screen — not on the
    // second row of the sorted array, which is the bug.
    const at = resolveCaret(visible, { id: null, at: 0 });
    expect(caretAtIndex(visible, at + 1).id).toBe("b");
    expect(caretAtIndex(visible, at - 1).id).toBe("a");
  });
});

describe("advancing after a verdict", () => {
  const visible = [
    row({ band: "HIGH_PRIORITY", listingId: "a" }),
    row({ band: "HIGH_PRIORITY", listingId: "b" }),
    row({ band: "HIGH_PRIORITY", listingId: "c" }),
  ];

  it("skips rows this sitting has already decided", () => {
    const decided = new Set(["b"]);
    expect(advancePastDecided(visible, 0, (id) => decided.has(id))?.id).toBe("c");
  });

  it("holds still at the end rather than wrapping to the top", () => {
    const decided = new Set(["b", "c"]);
    expect(advancePastDecided(visible, 0, (id) => decided.has(id))).toBeNull();
    expect(advancePastDecided(visible, 2, () => false)).toBeNull();
  });
});

describe("the ?listing= deep link", () => {
  const docket = [
    row({ band: "HIGH_PRIORITY", listingId: "h1" }),
    row({ band: "INELIGIBLE", listingId: "x1" }),
    row({ band: "LOW_PRIORITY", listingId: "lo1" }),
  ];

  it("seats the caret in RENDERED order, not in the order rows arrived", () => {
    // "lo1" arrives third but paints second, because the ineligible section
    // sinks below it.
    const o = openingCaret(docket, "lo1");
    expect(o.caret).toEqual({ id: "lo1", at: 1 });
    expect(o.deepLinked).toBe(true);
  });

  it("opens the collapsible section when the link points inside it", () => {
    // Otherwise the deep link lands on a row that is never painted, which is
    // what the flat index used to do silently.
    const o = openingCaret(docket, "x1");
    expect([...o.openBands]).toEqual(["INELIGIBLE"]);
    expect(o.caret.id).toBe("x1");
    const visible = flattenVisible(groupRowsByBand(docket), o.openBands);
    expect(visible[o.caret.at].listingId).toBe("x1");
  });

  it("opens on the first painted row with no link, and with an unknown one", () => {
    for (const link of [undefined, "not-on-this-docket"]) {
      const o = openingCaret(docket, link);
      expect(o.deepLinked).toBe(false);
      expect(o.caret).toEqual({ id: null, at: 0 });
      expect(resolveCaret(flattenVisible(groupRowsByBand(docket), o.openBands), o.caret)).toBe(0);
    }
  });
});

describe("the comparators", () => {
  const a = row({ band: "STRONG", listingId: "a", score: 50, deadline: "2026-09-01", postedAt: "2026-08-01" });
  const b = row({ band: "STRONG", listingId: "b", score: 90, deadline: null, postedAt: "2026-08-09" });
  const c = row({ band: "STRONG", listingId: "c", score: 70, deadline: "2026-08-15", postedAt: null });

  const sorted = (k: keyof typeof COMPARATORS) => ids([a, b, c].slice().sort(COMPARATORS[k]));

  it("orders by score, highest first", () => {
    expect(sorted("score")).toEqual(["b", "c", "a"]);
  });

  it("orders by deadline soonest first, with no date on file sinking last", () => {
    expect(sorted("deadline")).toEqual(["c", "a", "b"]);
  });

  it("orders by posted newest first, with no date on file sinking last", () => {
    expect(sorted("posted")).toEqual(["b", "a", "c"]);
  });

  it("breaks every tie by score, so no order is left to the query's whim", () => {
    // All three deadlines unknown — the live docket's actual state. Without
    // the tie-break this would fall back to arrival order.
    const flat = [
      row({ band: "STRONG", listingId: "p", score: 10 }),
      row({ band: "STRONG", listingId: "q", score: 80 }),
      row({ band: "STRONG", listingId: "r", score: 40 }),
    ];
    expect(ids(flat.slice().sort(COMPARATORS.deadline))).toEqual(["q", "r", "p"]);
    expect(ids(flat.slice().sort(COMPARATORS.posted))).toEqual(["q", "r", "p"]);
  });

  it("is idempotent, which is what lets the client re-sort the server's array", () => {
    // The docket sorts on both sides; if a second application moved anything,
    // the first client render would disagree with the server's HTML.
    for (const k of ["score", "deadline", "posted"] as const) {
      const once = [a, b, c].slice().sort(COMPARATORS[k]);
      expect(ids(once.slice().sort(COMPARATORS[k]))).toEqual(ids(once));
    }
  });
});
