import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* ── A column head does not truncate ───────────────────────────────────────
   `LedgerHead` sets `whitespace-nowrap` on the label and nothing clips it, so
   a track narrower than its own head does not ellipsise — it PRINTS OVER THE
   NEXT COLUMN. That is not a hypothetical: giving /companies a
   `minmax(0,1fr)` title track collapsed it to 100px at a 1100px viewport while
   `BEST ACTIVE LISTING` needed 140, and the head rendered straight through
   `LISTINGS`. Every other gate was green; only the screenshot showed it.

   The head is set in a MONOSPACE face, so its width is exactly
   characters × (glyph + tracking) and can be modelled without a browser. The
   constant below was measured in Chrome against the real head style
   (`font-mono text-[10.5px] font-semibold tracking-[0.1em]`) across labels of
   5, 8, 11 and 14 characters, which all came back at 7.36–7.40px per
   character. 7.4 is the conservative end.

   Scoped to the two ledgers this change touched. The other pages' column
   arrays belong to other work; widening the net here would fail their builds
   for a rule they never agreed to. */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Measured px per character of a ledger column head. Monospace, so exact. */
const HEAD_PX_PER_CHAR = 7.4;

const headWidth = (label: string) => Math.ceil(label.length * HEAD_PX_PER_CHAR);

interface Track {
  label: string;
  /** The narrowest this track can ever resolve to. */
  floor: number;
}

function columns(rel: string): Track[] {
  const block = /const COLS: LedgerCol\[\] = \[([\s\S]*?)\n\];/.exec(source(rel));
  if (!block) throw new Error(`${rel} no longer declares COLS as a single array literal.`);
  const entries = [...block[1].matchAll(/\{\s*label:\s*"([^"]*)",\s*w:\s*"([^"]+)"/g)];
  if (entries.length === 0) throw new Error(`${rel}: no { label, w } entries — rewrite this.`);
  return entries.map(([, label, w]) => {
    const fixed = /^(\d+)px$/.exec(w);
    if (fixed) return { label, floor: Number(fixed[1]) };
    const flex = /^minmax\((\d+)px,\s*[\d.]+fr\)$/.exec(w);
    if (flex) return { label, floor: Number(flex[1]) };
    throw new Error(
      `${rel}: column "${label}" has width "${w}". A track with no px floor can ` +
        `collapse under its own head — give it one, or rewrite this extractor.`
    );
  });
}

describe.each([
  ["/opportunities", "src/app/opportunities/page.tsx"],
  ["/companies", "src/app/companies/page.tsx"],
])("%s column heads", (_page, file) => {
  it("cannot collapse narrower than the label it prints", () => {
    for (const { label, floor } of columns(file)) {
      if (label === "") continue; // the actions column prints no head
      expect(floor, `"${label}" needs ~${headWidth(label)}px of head`).toBeGreaterThanOrEqual(
        headWidth(label)
      );
    }
  });
});
