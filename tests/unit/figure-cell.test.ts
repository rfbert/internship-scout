import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* ══════════════════════════════════════════════════════════════════════════
   THE FIGURE CELL — label and affordance must not share the same pixels

   WHAT THIS TEST IS, AND WHAT IT IS NOT.

   The defect is geometric: below roughly 1300px of viewport the `Figure`
   cell stopped being wide enough for its label and its `OPEN →` at once, the
   label's box shrank under its own text, and the text painted straight through
   the affordance. Measured in a real browser before the fix, as the horizontal
   intersection between the label's painted line boxes and the affordance's
   box:

       1100 → 14.27px    1140 → 21.95px    1180 → 16.23px
       1190 → 14.81px    1280 →  1.95px    1440 →  0px

   and 0px at every one of those widths afterwards, in both themes.

   NONE OF THAT IS OBSERVABLE HERE. These are `node`-environment unit tests;
   jsdom does no layout, so there is no box to intersect and no font to measure.
   The geometric proof is the browser sweep above, and re-running it means
   re-running the browser.

   What IS enforceable here is that the MECHANISMS which produce that geometry
   are still in the file. Each assertion below corresponds to one of them, and
   removing any one reintroduces the collision — that is the whole reason they
   are pinned rather than trusted to a comment. This repo has already shipped a
   fix whose own prose was wrong about what it did.

   The verification note that matters, recorded so the next reader does not
   repeat it: an earlier pass checked `scrollWidth === innerWidth` and called
   this clean. OVERLAP DOES NOT CHANGE scrollWidth. Text overflowing inside a
   `min-w-0` flex item is not document overflow — the measured page reported
   1090 ≤ 1100 while carrying 14.27px of glyph-on-glyph collision on the first
   screen of the app.
   ══════════════════════════════════════════════════════════════════════════ */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FRAME = "src/components/register/page-frame.tsx";
const source = readFileSync(path.join(ROOT, FRAME), "utf8");

/** The `const cell = "…"` class string the Figure applies to every cell. */
function cellClasses(): string {
  const m = /const cell =\s*\n?\s*"([^"]+)";/.exec(source);
  if (!m) {
    throw new Error(
      `${FRAME} no longer declares \`const cell\` as a single string literal. ` +
        `Rewrite this extractor against the new shape — do not delete the pins.`
    );
  }
  return m[1];
}

/** The `Figure` function body, so assertions cannot drift into other exports. */
function figureBody(): string {
  const start = source.indexOf("export function Figure(");
  if (start === -1) throw new Error(`${FRAME} no longer exports a \`Figure\` function.`);
  return source.slice(start);
}

describe("the Figure cell's line", () => {
  /* MECHANISM 1. A flex line breaks on its items' max-content sizes BEFORE any
     shrinking happens, so `OPEN →` drops to its own row at exactly the width
     where it would otherwise have squeezed the label — and the label then gets
     the whole line. Without `flex-wrap` there is no second row to drop to and
     the label is shrunk instead. */
  it("wraps, so the affordance has a second row to fall to", () => {
    expect(cellClasses()).toMatch(/\bflex-wrap\b/);
  });

  it("still lays the cell out as a flex row", () => {
    const c = cellClasses();
    expect(c).toMatch(/(^|\s)flex(\s|$)/);
    expect(c).toMatch(/\bflex-1\b/);
  });

  /* A wrapped affordance needs vertical separation from the line above, or the
     two rows touch and read as one overlapping line — the appearance this fix
     exists to remove. */
  it("separates the two rows", () => {
    expect(cellClasses()).toMatch(/\bgap-y-/);
  });
});

describe("the numeral and its label", () => {
  /* MECHANISM 2. They travel as ONE flex item. Wrapping them separately put
     the numeral alone on the first row with its label underneath — a worse
     break than the one being fixed, and one that appeared at every width where
     the cell was tight. */
  it("are grouped into a single flex item", () => {
    expect(figureBody()).toMatch(/<span className="flex min-w-0 grow items-baseline gap-2">/);
  });

  /* `flex-1` is `flex: 1 1 0%`, whose hypothetical main size is ZERO. An item
     that claims no width never triggers the line break mechanism 1 depends on,
     so the group MUST use `grow` (flex-basis: auto) instead. This is the single
     easiest thing to "tidy" into a bug. */
  it("claim their content width, so the line can know it is full", () => {
    const group = /<span className="([^"]*grow[^"]*)">/.exec(figureBody());
    expect(group, "the numeral+label group span").not.toBeNull();
    expect(group![1]).not.toMatch(/\bflex-1\b/);
    expect(group![1]).toMatch(/\bgrow\b/);
  });
});

describe("the label's overflow backstop", () => {
  /* MECHANISM 3, and the one that makes "cannot overlap" true rather than
     merely likely. Mechanism 1 needs the cell to be at least as wide as
     numeral + label; narrower than that — a longer label, a five-digit count,
     a phone — and the label shrinks under its text again. `overflow-wrap:
     anywhere` breaks the word instead, so a glyph cannot leave the label's box
     on ANY input. Verified in the browser: computed `overflow-wrap` on the
     rendered label is "anywhere".

     A mid-word break is ugly. Text printed through other text is a defect. */
  it("cannot let a glyph escape the label's box", () => {
    const label = /<span className="min-w-0 ([^"]+)">\s*\{label\}/.exec(figureBody());
    expect(label, "the label span").not.toBeNull();
    expect(label![1]).toMatch(/\bwrap-anywhere\b/);
  });
});

describe("the OPEN affordance", () => {
  /* It is right-aligned by an auto margin, which resolves per flex LINE — so
     the same class right-aligns it whether it sits beside the label or alone
     on the row below. */
  it("stays right-aligned on whichever row it lands", () => {
    const open = /<span className="(ml-auto[^"]*)">\s*\n?\s*OPEN/.exec(figureBody());
    expect(open, "the OPEN affordance span").not.toBeNull();
    expect(open![1]).toMatch(/\bml-auto\b/);
    expect(open![1]).toMatch(/\bwhitespace-nowrap\b/);
  });

  /* The affordance is rendered only for a cell that links somewhere; a plain
     cell must not grow a second row for an arrow it does not have. */
  it("is rendered only when the cell links somewhere", () => {
    expect(figureBody()).toMatch(/\{href \?[\s\S]{0,400}OPEN →/);
  });
});
