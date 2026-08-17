import type { ScoreBand } from "@prisma/client";
import { BAND_LABELS } from "@/lib/format";
import type { ReviewSort } from "./meta";
import type { ReviewRow } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   THE DOCKET'S ORDER — one module, because it used to be three that disagreed

   `page.tsx` sorted the rows, `review-list.tsx` grouped them into the band
   ladder, and the caret indexed the SORTED array while the reader looked at
   the GROUPED one. Under `?sort=score` those two arrays coincide and nothing
   showed; under `?sort=posted` they do not, and `selected = 0` drew its caret
   on the row rendered 33rd of 133. Measured, before this file existed:

     /review                first rendered Q-01, caret on Q-01 (position 1)
     /review?sort=deadline  first rendered Q-01, caret on Q-01 (position 1)
     /review?sort=posted    first rendered Q-05, caret on Q-01 (position 33)

   Everything that decides what order the docket is in now lives here, as pure
   functions over `ReviewRow[]`, and `tests/unit/review-order.test.ts` pins
   them. The rule the whole file exists to keep: THE READER'S ORDER IS THE ONLY
   ORDER. `flattenVisible` produces it, and the caret indexes that and nothing
   else.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Comparators ───────────────────────────────────────────────────────────
   Declared here rather than in `page.tsx` because BOTH sides need them now.
   The server sorts the pending rows it fetched; the client re-sorts the
   sitting, which also contains records it has already decided and that have
   therefore left the server's query. One definition, so the two orders cannot
   drift — and on the first render the client's sort is a no-op over an array
   the server already sorted with this exact function. */

/** Nulls sink in every order: an unknown date is not an urgent one. */
const nullsLast = (a: string | null, b: string | null, cmp: (x: string, y: string) => number) =>
  a == null ? (b == null ? 0 : 1) : b == null ? -1 : cmp(a, b);

const byScore = (a: ReviewRow, b: ReviewRow) => (b.score ?? -1) - (a.score ?? -1);

/**
 * Every order is a TOTAL order, with score as the tie-break.
 *
 * Without it the tail of a date sort falls back to whatever order the query
 * returned, which is `queuedAt asc` — so on a docket where no listing has a
 * deadline on file (the common case: not one of the 133 pending records does
 * right now) `Deadline` would silently reshuffle the queue into intake order
 * for no reason a reader could see. "Soonest first, then best first" is both
 * the obvious reading and a stable one.
 */
export const COMPARATORS: Record<ReviewSort, (a: ReviewRow, b: ReviewRow) => number> = {
  score: byScore,
  // Soonest first — the one about to close is the one worth deciding now.
  deadline: (a, b) =>
    nullsLast(a.deadline, b.deadline, (x, y) => x.localeCompare(y)) || byScore(a, b),
  // Newest first.
  posted: (a, b) =>
    nullsLast(a.postedAt, b.postedAt, (x, y) => y.localeCompare(x)) || byScore(a, b),
};

/* ── The band ladder ─────────────────────────────────────────────────────── */

/**
 * The canonical band ladder, taken from the declaration order of `BAND_LABELS`
 * so there is exactly one place it is written down.
 */
export const BAND_LADDER = Object.keys(BAND_LABELS) as ScoreBand[];

/**
 * The one band whose section ships collapsed. It is the LAST rung of the
 * ladder (`BAND_LABELS` ends `INELIGIBLE`) and `bandRank` keeps it there, so
 * the collapsible section is always the tail of the docket — which is why
 * opening or closing it can never renumber a row above it.
 */
export const COLLAPSIBLE_BAND: ScoreBand = "INELIGIBLE";

export const bandGroupKey = (band: ReviewRow["band"]): string => band ?? "UNSCORED";

export const isCollapsible = (band: ReviewRow["band"]): boolean => band === COLLAPSIBLE_BAND;

/**
 * Where a band's section sits on the docket. Unscored records still need a
 * decision, so they sit just above INELIGIBLE rather than at the very bottom
 * with the group that has already been decided against.
 */
export function bandRank(band: ReviewRow["band"]): number {
  if (band == null) return BAND_LADDER.indexOf(COLLAPSIBLE_BAND) - 0.5;
  const i = BAND_LADDER.indexOf(band);
  return i === -1 ? BAND_LADDER.length : i;
}

export interface BandGroup {
  key: string;
  band: ReviewRow["band"];
  rows: ReviewRow[];
}

/**
 * Group the docket by band.
 *
 * No row carries its index into the caller's array any more, and that is the
 * point: an index into the ungrouped list was the thing the caret was reading,
 * and it is not a position on screen. Ask `flattenVisible` for positions.
 */
export function groupRowsByBand(rows: ReviewRow[]): BandGroup[] {
  const groups: BandGroup[] = [];
  const byBand = new Map<string, BandGroup>();
  for (const row of rows) {
    const key = bandGroupKey(row.band);
    let g = byBand.get(key);
    if (!g) {
      g = { key, band: row.band, rows: [] };
      byBand.set(key, g);
      groups.push(g);
    }
    g.rows.push(row);
  }
  /* Sections print in BAND ORDER, never in the order the bands happen to turn
     up. Ineligible sinking to the bottom was always the point — its rows can
     out-score a genuinely reviewable one (a PhD-only role still scores on role
     fit), which otherwise parks a dead group mid-queue — but first-appearance
     order for everything else only looked right because the docket was always
     sorted by score. Order by deadline and the sections would shuffle. */
  return groups.sort((a, b) => bandRank(a.band) - bandRank(b.band));
}

/** Is this section painted open? Everything but the collapsible band always is. */
export const sectionIsOpen = (g: BandGroup, openBands: ReadonlySet<string>): boolean =>
  !isCollapsible(g.band) || openBands.has(g.key);

/**
 * EVERY ROW ON SCREEN, TOP TO BOTTOM — the reader's order, and the only array
 * the caret is allowed to index. A collapsed section contributes nothing,
 * because a row inside one is not somewhere the caret can be seen.
 */
export function flattenVisible(groups: BandGroup[], openBands: ReadonlySet<string>): ReviewRow[] {
  const out: ReviewRow[] = [];
  for (const g of groups) {
    if (sectionIsOpen(g, openBands)) out.push(...g.rows);
  }
  return out;
}

/* ── The caret ─────────────────────────────────────────────────────────────
   An id AND an index, and the pair is deliberate:

     id — what the caret is ON. This is what survives a re-sort: click
          `Deadline` and the caret stays on the record you were reading rather
          than on whatever record has now slid into that slot.
     at — where that record last sat. The fallback for the two ways a record
          stops being visible (its section is collapsed, or it left the docket
          undecided), so the caret degrades to a NEARBY row instead of
          snapping to the top of a 133-row docket.

   `resolveCaret` is total: on a non-empty docket it always returns an index of
   a row that is actually painted. There is no state in which the caret is
   nowhere. */

export interface Caret {
  id: string | null;
  at: number;
}

export const EMPTY_CARET: Caret = { id: null, at: 0 };

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

/** The caret's index into `visible`, or `-1` only when there is nothing to see. */
export function resolveCaret(visible: ReviewRow[], caret: Caret): number {
  if (visible.length === 0) return -1;
  if (caret.id != null) {
    const at = visible.findIndex((r) => r.listingId === caret.id);
    if (at >= 0) return at;
  }
  return clamp(caret.at, visible.length - 1);
}

/** A caret pinned to the row at `at` in the reader's order, bounds included. */
export function caretAtIndex(visible: ReviewRow[], at: number): Caret {
  if (visible.length === 0) return EMPTY_CARET;
  const i = clamp(at, visible.length - 1);
  return { id: visible[i].listingId, at: i };
}

/**
 * The next row the reader can see that this sitting has NOT decided yet —
 * where the caret goes after a verdict is stamped. Returns the caret unchanged
 * when everything below is already decided, so the last decision of a sitting
 * does not throw the caret back to the top.
 */
export function advancePastDecided(
  visible: ReviewRow[],
  from: number,
  isDecided: (listingId: string) => boolean
): Caret | null {
  for (let i = from + 1; i < visible.length; i++) {
    if (!isDecided(visible[i].listingId)) return caretAtIndex(visible, i);
  }
  return null;
}

/**
 * Where the sitting opens: which sections are expanded, and where the caret
 * starts — both resolved against the order the reader will actually SEE.
 *
 * A `?listing=` deep link into the collapsible section OPENS that section. A
 * deep link that lands on a row nobody can see is not a deep link, and the old
 * behaviour was exactly that: the index was found in the ungrouped array and
 * the row it pointed at was never painted.
 */
export function openingCaret(
  rows: ReviewRow[],
  highlightId?: string
): { openBands: Set<string>; caret: Caret; deepLinked: boolean } {
  const target = highlightId ? rows.find((r) => r.listingId === highlightId) : undefined;
  const openBands = new Set<string>();
  if (target && isCollapsible(target.band)) openBands.add(bandGroupKey(target.band));
  if (!target) return { openBands, caret: EMPTY_CARET, deepLinked: false };
  const visible = flattenVisible(groupRowsByBand(rows), openBands);
  const at = visible.findIndex((r) => r.listingId === target.listingId);
  return {
    openBands,
    caret: at >= 0 ? { id: target.listingId, at } : EMPTY_CARET,
    deepLinked: at >= 0,
  };
}
