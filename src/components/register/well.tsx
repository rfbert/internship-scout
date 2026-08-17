import type { ReactNode } from "react";

/**
 * An INSTRUMENT WELL — the dark panel every chart, spectrum, tape, gauge and
 * quoted-evidence block sits in.
 *
 * The well is THEME-INVARIANT by design: an oscilloscope screen is black in a
 * lit lab too. The data layer must not change color when the theme flips, so
 * `--well-*` are literal hex values in both themes, and marks inside a well may
 * only ever use the well palette — never a single accent hue (SYNTHESIS §2.6).
 *
 * `.register-well` is the print hook: on paper the well inverts to white with a
 * rule border so the marks stay legible (A8).
 */
export function Well({
  label,
  children,
  className = "",
  right,
}: {
  /** Mono-caps caption printed inside the well's top-left. */
  label?: string;
  children: ReactNode;
  className?: string;
  /** Right-aligned tail of the caption line, e.g. a retrieval timestamp. */
  right?: ReactNode;
}) {
  // The edge is `--well-edge`, not `--rule`. In day the fill does all the work
  // — a near-black panel on ledger paper is a 16:1 step and the border barely
  // matters. In night the panel and the page are the same darkness (1.02:1),
  // the fill says nothing, and `--rule` left the boundary at 1.64:1: the well
  // dissolved into the page. `--well-edge` is the one theme-aware token in the
  // well palette, and legitimately so — the edge is chrome, while the rule the
  // rest of this file obeys ("the data layer must not change color") is about
  // the marks inside. Still no `dark:` variant: the theme override is
  // [data-theme], not prefers-color-scheme, and the two disagree the moment a
  // user forces a theme against their OS. light-dark() follows color-scheme,
  // so it tracks the override correctly where a `dark:` variant would not.
  return (
    <div
      className={`register-well rounded border border-well-edge bg-well-bg p-3 text-well-fg ${className}`}
    >
      {label || right ? (
        <div className="mb-2 flex items-baseline gap-3">
          {label ? (
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-well-muted">
              {label}
            </span>
          ) : null}
          {right ? (
            <span className="ml-auto font-mono text-[10.5px] text-well-muted">{right}</span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Quoted posting language. Not a well — a quotation is prose evidence, so it
 * sits on `--inset` with a rule flag, the way a pulled quote does on paper.
 * (The well is for INSTRUMENTS: anything with a bar, tick or gauge.)
 */
export function Quote({
  children,
  source,
}: {
  children: ReactNode;
  /** e.g. `posting §Eligibility · retrieved AUG 08`. */
  source?: ReactNode;
}) {
  return (
    <blockquote className="mt-2 border-l-2 border-rule bg-inset px-2.5 py-2 text-[11.5px] italic text-ink-2">
      {children}
      {source ? (
        <cite className="mt-1 block font-mono text-[10px] not-italic text-ink-3">{source}</cite>
      ) : null}
    </blockquote>
  );
}
