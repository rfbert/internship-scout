import type { ReactNode } from "react";
import Link from "next/link";
import { TOKEN_TEXT, type BandColor } from "@/lib/format";

/**
 * The page head every one of the eleven surfaces opens with.
 *
 * NOTE: this module deliberately imports nothing from `@/components/ui` — that
 * file imports `Figure` from here (StatTile's deprecated body), and the classes
 * below are inlined to keep the two from cycling.
 */

export function PageFrame({
  eyebrow,
  title,
  figures,
  verbs,
}: {
  /** Mono caps, e.g. `REGISTER OF APPLICATIONS · SUMMER 2027 · F-1 AWARE`. */
  eyebrow: string;
  /** The page's own sentence, e.g. "The day, in order." */
  title: string;
  /** A `FigureStrip`, or the right-hand mono readout. */
  figures?: ReactNode;
  /** `Stamp` / `OutlineVerb` buttons, right-aligned on the title line. */
  verbs?: ReactNode;
}) {
  return (
    <div className="pb-3 pt-3.5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <div className="mb-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3">
            {eyebrow}
          </div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
        </div>
        {figures ? (
          <div className="ml-auto text-right font-mono text-[11px] leading-snug text-ink-2">
            {figures}
          </div>
        ) : null}
        {verbs ? (
          <div className={`flex flex-wrap items-center gap-1.5 ${figures ? "" : "ml-auto"}`}>
            {verbs}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The day's figures on ONE RULED LINE — never a card grid. Five to seven cells
 * separated by 1px feint rules; the strip itself is one bordered sheet.
 */
export function FigureStrip({ children }: { children: ReactNode }) {
  return (
    <div
      role="list"
      className="mb-4 flex items-stretch overflow-hidden rounded border border-rule bg-surface"
    >
      {children}
    </div>
  );
}

/**
 * One cell of the strip: a mono numeral and its two-line mono-caps label.
 * `tone` colors the numeral only — the label always names the thing, so color
 * is never the sole carrier (D3).
 */
export function Figure({
  value,
  label,
  sub,
  href,
  tone,
}: {
  value: ReactNode;
  /** Mono caps, e.g. `OVERDUE FOLLOW-UP`. */
  label: string;
  /** Optional second line, e.g. `NEXT 7 DAYS`. */
  sub?: string;
  /** Turns the cell into a link and prints a trailing `OPEN →`. */
  href?: string;
  tone?: BandColor;
}) {
  const inner = (
    <>
      {/* The reading pair — numeral and its label — is ONE flex item, so the
          only thing the outer line can push onto a second row is `OPEN →`.
          Wrapping them separately put "133" alone on the first row with
          "AWAITING REVIEW" under it, which is a worse break than the one being
          fixed. `grow` and not `flex-1`: `flex-1` is `flex: 1 1 0%`, whose
          hypothetical main size is ZERO, and an item that claims no width never
          triggers the line break this whole arrangement depends on. */}
      <span className="flex min-w-0 grow items-baseline gap-2">
        <b className={`font-mono text-[17px] font-semibold leading-none ${tone ? TOKEN_TEXT[tone] : ""}`}>
          {value}
        </b>
        <span className="min-w-0 wrap-anywhere font-mono text-[10px] font-medium uppercase leading-[1.3] tracking-[0.1em] text-ink-3">
          {label}
          {sub ? (
            <>
              <br />
              {sub}
            </>
          ) : null}
        </span>
      </span>
      {href ? (
        <span className="ml-auto self-center whitespace-nowrap font-mono text-[10px] font-medium tracking-[0.06em] text-blue">
          OPEN →
        </span>
      ) : null}
    </>
  );

  /* ── Why this line wraps, and why the label may break mid-word ────────────
     The label used to sit beside `OPEN →` on one shrink-to-fit line. Below
     about 1300px of viewport the cell stopped being wide enough for both, the
     label's box shrank under its own text, and the text kept its size and
     painted straight through the affordance: "AWAITING REVIEW" with "OPEN →"
     across the W, measured at 21.95px of glyph-on-glyph overlap at 1140.

     `scrollWidth === innerWidth` does not see this. Overflow inside a
     `min-w-0` flex item is not document overflow, so the page reported clean
     at every width while the first screen of the app was illegible. The check
     that finds it is a bounding-rect intersection between the label's PAINTED
     LINE BOXES (`Range.getClientRects()`, not the element's box, which is the
     shrunken one) and the affordance's box — see tests/unit/figure-cell.test.ts
     for the arithmetic and the browser sweep in the report for the rects.

     Two mechanisms, in order:

     1. `flex-wrap` decides the layout. A flex line breaks on items' MAX-content
        sizes before any shrinking happens, so `OPEN →` drops to its own row at
        exactly the width where it would otherwise have squeezed the label, and
        the label then gets the whole line. No breakpoint is involved, which
        matters: the collision was still present at 1280 and only cleared near
        1440, so any fixed breakpoint tuned to the reported 1180 onset would
        have left it in place at the most common laptop width.

     2. `wrap-anywhere` on the label is the backstop, and it is what makes the
        no-overlap claim true rather than merely likely. Mechanism 1 needs the
        cell to be at least as wide as numeral + label; narrower than that —
        a longer label, a five-digit count, a phone — and the label would shrink
        under its text again. `overflow-wrap: anywhere` breaks the word instead,
        so a glyph cannot leave the label's box on ANY input. A mid-word break
        is ugly; text printed through other text is a defect. */
  const cell =
    "flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1 border-l border-feint px-3.5 py-2.5 first:border-l-0";

  return href ? (
    <Link
      role="listitem"
      href={href}
      className={`${cell} transition-colors duration-[120ms] ease-out hover:bg-sel`}
    >
      {inner}
    </Link>
  ) : (
    <div role="listitem" className={cell}>
      {inner}
    </div>
  );
}
