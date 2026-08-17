import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* ── Why this test reads source text instead of importing the constants ────
   Same reason as tests/unit/ledger-width.test.ts, which pins the number this
   file spends: `src/app/opportunities/page.tsx` is an async Server Component
   that imports the Prisma client at module scope, and the local .env points at
   production. The declarations under test are one-line literals with a fixed
   shape, so a regex over the source reads the same fact for free — and the
   extractors below THROW rather than silently pass if a shape changes.

   What this pins is the arithmetic the column budget rests on: the ten tracks
   plus the grid's own chrome have to fit inside MIN_WIDTH, and the column that
   identifies the record has to keep a floor inside that fit. Before this test
   existed, `Company — Role` resolved to 178px at the 1440px reference width —
   enough for "Quantbot Technologies — Q…" and not enough to tell that row from
   "Quantbot Technologies — M…" directly above it. */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const OPPORTUNITIES = "src/app/opportunities/page.tsx";
const LEDGER = "src/components/register/ledger.tsx";

/** The Tailwind spacing scale: `2.5` is 0.625rem is 10px. */
const spacingPx = (step: string) => Number(step) * 4;

/**
 * The horizontal space a `Ledger` row spends on itself — the shared `gridRow`
 * padding plus one gap between each pair of columns. Read out of ledger.tsx so
 * that restyling the row cannot quietly invalidate the budget below.
 */
function rowChromePx(columns: number): number {
  const grid = /const gridRow =\s*\n?\s*"([^"]+)"/.exec(source(LEDGER));
  if (!grid) throw new Error(`${LEDGER} no longer declares gridRow as a string literal.`);
  const cls = grid[1];

  const read = (prefix: string) => {
    const m = new RegExp(`(?:^| )${prefix}-([0-9.]+)(?: |$)`).exec(cls);
    if (!m) throw new Error(`gridRow no longer sets ${prefix}-*: "${cls}"`);
    return spacingPx(m[1]);
  };

  return read("pl") + read("pr") + read("gap-x") * (columns - 1);
}

interface Track {
  label: string;
  /** The px floor: a fixed track's width, or a `minmax()` track's minimum. */
  floor: number;
  /** True for `minmax(Npx,1fr)` — a track that absorbs the leftover space. */
  flexible: boolean;
}

/** Reads the `COLS` array out of a page's source as widths, or throws. */
function columns(rel: string): Track[] {
  const block = /const COLS: LedgerCol\[\] = \[([\s\S]*?)\n\];/.exec(source(rel));
  if (!block) {
    throw new Error(`${rel} no longer declares COLS as a single array literal.`);
  }
  const entries = [...block[1].matchAll(/\{\s*label:\s*"([^"]*)",\s*w:\s*"([^"]+)"/g)];
  if (entries.length === 0) {
    throw new Error(`${rel}: no { label, w } entries found — rewrite this extractor.`);
  }
  return entries.map(([, label, w]) => {
    const fixed = /^(\d+)px$/.exec(w);
    if (fixed) return { label, floor: Number(fixed[1]), flexible: false };
    const flex = /^minmax\((\d+)px,\s*1fr\)$/.exec(w);
    if (flex) return { label, floor: Number(flex[1]), flexible: true };
    throw new Error(
      `${rel}: column "${label}" has width "${w}", which this budget cannot add up. ` +
        `Use "<n>px" or "minmax(<n>px,1fr)", or rewrite this extractor — do not delete the pin.`
    );
  });
}

function ledgerMinWidth(rel: string): number {
  const match = /\bMIN_WIDTH\s*=\s*(\d+)\s*;/.exec(source(rel));
  if (!match) throw new Error(`${rel} no longer declares MIN_WIDTH as a plain integer literal.`);
  return Number(match[1]);
}

/** The column that names the record. Everything else is an attribute of it. */
const IDENTITY = "Company — Role";

/* 300px is where "Quantbot Technologies — Quantitative Trading Int…" stops
   being the same printed string as its sibling row. Below that the ledger has
   rows it cannot tell apart, which is worse than any column being narrow. */
const IDENTITY_FLOOR = 300;

describe("the /opportunities column budget", () => {
  const cols = columns(OPPORTUNITIES);
  const chrome = rowChromePx(cols.length);
  const trackSpace = ledgerMinWidth(OPPORTUNITIES) - chrome;

  it("spends every track inside MIN_WIDTH", () => {
    const total = cols.reduce((n, c) => n + c.floor, 0);
    expect(
      total,
      `tracks ${total}px + chrome ${chrome}px must fit ${ledgerMinWidth(OPPORTUNITIES)}px`
    ).toBeLessThanOrEqual(trackSpace);
  });

  it("keeps exactly one flexible track, and it is the identifying column", () => {
    const flexible = cols.filter((c) => c.flexible);
    expect(flexible.map((c) => c.label)).toEqual([IDENTITY]);
  });

  it("floors the identifying column", () => {
    const identity = cols.find((c) => c.label === IDENTITY);
    expect(identity, `no "${IDENTITY}" column — did it get renamed?`).toBeDefined();
    expect(identity!.floor).toBeGreaterThanOrEqual(IDENTITY_FLOOR);
  });

  /* The floor is only a floor. What the reader actually gets at the reference
     width is the leftover, and that is the number that was 178px. */
  it("gives the identifying column the leftover, and the leftover clears the floor", () => {
    const others = cols.filter((c) => c.label !== IDENTITY).reduce((n, c) => n + c.floor, 0);
    expect(trackSpace - others).toBeGreaterThanOrEqual(IDENTITY_FLOOR);
  });

  /* A record's name should not be narrower than the widest thing said ABOUT
     it. This is what stops the budget drifting back one 8px trim at a time. */
  it("makes the identifying column the widest track on the row", () => {
    const others = cols.filter((c) => c.label !== IDENTITY);
    const widest = Math.max(...others.map((c) => c.floor));
    const identity = cols.find((c) => c.label === IDENTITY)!;
    expect(identity.floor).toBeGreaterThan(widest);
  });
});
