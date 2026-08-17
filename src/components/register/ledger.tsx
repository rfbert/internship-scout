import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { TOKEN_BG, TOKEN_TEXT, type ColorToken } from "@/lib/format";

/* ══════════════════════════════════════════════════════════════════════════
   THE ONE TABLE IDIOM

   Nine surfaces used to render three different table treatments plus a
   card-per-row list. They all become this: a 34px single-line ruled row on a
   shared CSS grid, with the focused row washed `--sel` and hanging a carmine
   caret tab off the margin.

   Usage — declare the columns ONCE and hand the same array to both `Ledger`
   (which publishes the grid template as `--ledger-cols`) and `LedgerHead`
   (which prints the labels):

     const COLS: LedgerCol[] = [
       { label: "No.",            w: "56px",           align: "right" },
       { label: "Company — Role", w: "minmax(0,1fr)" },
       { label: "Score",          w: "74px",           align: "right", sort: "score" },
     ];

     <Ledger cols={COLS} minWidth={1180}>
       <LedgerHead cols={COLS} />
       <LedgerSection>
         <LedgerRow focused={i === cursor} onClick={…}>
           <LedgerCell align="right" mono>{accession}</LedgerCell>
           …
         </LedgerRow>
       </LedgerSection>
     </Ledger>
   ══════════════════════════════════════════════════════════════════════════ */

export interface LedgerCol {
  label: string;
  /** Sort key. Present ⇒ the head cell renders as a sort control. */
  sort?: string;
  align?: "left" | "right";
  /** Any grid track value: `"56px"`, `"minmax(0,1fr)"`. Defaults to `1fr`. */
  w?: string;
}

const template = (cols: LedgerCol[] | undefined) =>
  cols && cols.length > 0
    ? cols.map((c) => c.w ?? "minmax(0,1fr)").join(" ")
    : "repeat(auto-fit, minmax(0,1fr))";

/** Shared padding + grid so head cells and body cells cannot drift apart. */
const gridRow =
  "grid items-center gap-x-2.5 pl-2.5 pr-3.5 [grid-template-columns:var(--ledger-cols)]";

export function Ledger({
  cols,
  minWidth,
  children,
  className = "",
  label,
}: {
  /** The column template. Pass the same array to `LedgerHead`. */
  cols?: LedgerCol[];
  /** Below this width the ledger scrolls inside itself — the page never does. */
  minWidth?: number;
  children: ReactNode;
  className?: string;
  /** Accessible name for the table, e.g. "Applications by stage". */
  label?: string;
}) {
  const style = { "--ledger-cols": template(cols) } as CSSProperties;
  return (
    /* `register-scroll` paints the fold shade (globals.css) and carries the
       `--surface` fill the `bg-surface` class used to — the two cannot both set
       a background. When the ledger fits, the shade is fully covered and the
       sheet looks exactly as it did. */
    <div className={`register-scroll overflow-x-auto rounded border border-rule ${className}`}>
      <div
        role="table"
        aria-label={label}
        style={{ ...style, ...(minWidth ? { minWidth: `${minWidth}px` } : null) }}
      >
        {children}
      </div>
    </div>
  );
}

export function LedgerHead({
  cols,
  onSort,
  sortKey,
  sortDir,
}: {
  cols: LedgerCol[];
  /** Omit for a static head. Present ⇒ columns with a `sort` become buttons. */
  onSort?: (key: string) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}) {
  return (
    <div role="rowgroup">
      <div role="row" className={`${gridRow} h-[28px] border-b border-rule`}>
        {cols.map((c) => {
          const active = !!c.sort && c.sort === sortKey;
          const cls = `font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap ${
            active ? "text-ink" : "text-ink-3"
          } ${c.align === "right" ? "text-right" : ""}`;
          return (
            <div
              key={c.label}
              role="columnheader"
              aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
              className="min-w-0"
            >
              {c.sort && onSort ? (
                <button
                  type="button"
                  onClick={() => onSort(c.sort as string)}
                  className={`${cls} w-full hover:text-ink ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  {c.label}
                  {active ? <span aria-hidden>{sortDir === "asc" ? " ▲" : " ▼"}</span> : null}
                </button>
              ) : (
                <span className={cls}>{c.label}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A run of rows under one `SectionRule`. Keeps the ARIA table tree legal. */
export function LedgerSection({ children }: { children: ReactNode }) {
  return <div role="rowgroup">{children}</div>;
}

/**
 * A full-width block inside the ledger — a `SectionRule` between groups, or a
 * pulled worksheet under the focused row. `role="row"` wrapping a single
 * `role="cell"` keeps the ARIA table tree legal: a rowgroup may only own rows,
 * and a row may own cells.
 *
 * This is what lets ONE ledger carry several groups under ONE head. Rendering a
 * fresh `Ledger` + `LedgerHead` per group instead reprints the column names on
 * every group — `/analytics` printed `STAGE · APPLICATIONS · % OF APPLIED`
 * three times in one viewport before this existed here.
 */
export function LedgerFullRow({ children }: { children: ReactNode }) {
  return (
    <div role="row">
      <div role="cell">{children}</div>
    </div>
  );
}

export function LedgerRow({
  focused = false,
  struck = false,
  onClick,
  onKeyDown,
  tick,
  children,
  className = "",
  title,
  ariaLabel,
}: {
  /** The caret is here: `--sel` wash plus a 3px carmine tab on the margin. */
  focused?: boolean;
  /** A pre-struck record (INELIGIBLE, discarded) — the title is struck through. */
  struck?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** Left edge group tick — how group membership survives in FLAT mode. */
  tick?: ColorToken;
  children: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const interactive = !!onClick || !!onKeyDown;
  return (
    <div
      role="row"
      title={title}
      aria-label={ariaLabel}
      aria-selected={interactive ? focused : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={[
        gridRow,
        "relative h-[34px] border-b border-feint last:border-b-0",
        focused ? "bg-sel" : "hover:bg-sel/45",
        struck ? "[&_[data-row-title]]:line-through [&_[data-row-title]]:decoration-carmine" : "",
        className,
      ].join(" ")}
    >
      {focused ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-carmine" />
      ) : tick ? (
        <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${TOKEN_BG[tick]}`} />
      ) : null}
      {children}
    </div>
  );
}

/**
 * One cell. `mono` is the data face (numbers, dates, codes); leave it off for
 * prose. Everything is single-line and ellipsised — the whole density argument
 * is that a row is 34px, not 100px.
 *
 * ── COLOR A CELL WITH `tone`, NEVER WITH `className` ──────────────────────
 * `tone` exists because `className={TOKEN_TEXT[t]}` DID NOT WORK and failed
 * silently. `mono` puts `text-ink-2` on this same element; two utilities from
 * the same Tailwind namespace on one element are a specificity tie, so the
 * winner is whichever Tailwind emits LAST — and it emits color utilities in
 * alphabetical order. Measured in the browser:
 *
 *     text-ink-2 + text-carmine → ink-2     text-ink-2 + text-ochre  → ochre
 *     text-ink-2 + text-green   → ink-2     text-ink-2 + text-ink-3  → ink-3
 *     text-ink-2 + text-blue    → ink-2
 *
 * So every cell that asked for carmine, green or blue got ink-2 instead, while
 * ochre came through — which meant the SEVERE state was the one that vanished
 * and the middle one survived. On `/runs` a FAILED run printed in exactly the
 * ink of a SUCCESS one; on `/runs/[id]` an ERROR event printed as an INFO one;
 * on `/` and `/calendar` a deadline inside seven days lost its carmine and
 * only the 21-day ochre warning showed. Passing `tone` resolves the color HERE
 * and emits exactly ONE text-color utility, so there is nothing to tie.
 */
export function LedgerCell({
  children,
  align = "left",
  mono = false,
  muted = false,
  tone,
  title,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  muted?: boolean;
  /** Semantic color for the whole cell. Wins over `mono`/`muted` defaults. */
  tone?: ColorToken;
  /** Full text for a cell truncated on screen. */
  title?: string;
  className?: string;
}) {
  const color = tone ? TOKEN_TEXT[tone] : muted ? "text-ink-3" : mono ? "text-ink-2" : "";
  return (
    <div
      role="cell"
      title={title}
      className={[
        "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
        mono ? "font-mono text-[11px] tabular-nums" : "text-[13px]",
        color,
        align === "right" ? "text-right" : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/**
 * The 24px micro-row — run events, closed-out lists, correspondence. Same
 * grid, half the weight.
 */
export function LedgerMicroRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="row"
      className={`${gridRow} h-[24px] border-b border-feint last:border-b-0 ${className}`}
    >
      {children}
    </div>
  );
}
