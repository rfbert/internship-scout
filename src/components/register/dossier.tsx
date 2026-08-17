import type { ReactNode } from "react";
import { MarginRule } from "@/components/shell";

/**
 * A PULLED RECORD — the focused row lifted out of the ledger for depth on
 * demand. It carries the page's own carmine double margin-rule on its left
 * edge: the same mark as the page margin, saying "this is a record lifted from
 * the same ledger", not a modal from somewhere else.
 *
 * Shadow lives here and nowhere else in the app — the only thing that leaves
 * the page plane is the record you pulled.
 *
 * The `role="dialog" aria-modal` contract and the Escape handler belong to the
 * PAGE (D1/D7): the tracker's dossier owns the keydown effect that was in
 * `drawer.tsx`. This primitive is the frame.
 */
export function Dossier({
  children,
  onClose,
  className = "",
  label,
}: {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  /** Accessible name, e.g. `Record A-0102 — Anthropic`. */
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className={`relative ml-6 mr-3.5 mb-3.5 mt-2.5 rounded border border-rule border-l-carmine bg-surface shadow-[var(--shadow-pulled)] ${className}`}
    >
      <MarginRule inset />
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close record"
          className="absolute right-2 top-1.5 z-10 font-mono text-[13px] leading-none text-ink-3 hover:text-ink"
        >
          ×
        </button>
      ) : null}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr_1fr]">{children}</div>
    </div>
  );
}

/**
 * The review worksheet: the same pulled card in a two-column split — assessment
 * ledger left, evidence right, with the decision bar spanning both.
 */
export function Worksheet({
  children,
  onClose,
  className = "",
  label,
}: {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className={`relative ml-6 mr-3.5 mb-3.5 mt-2.5 rounded border border-rule border-l-carmine bg-surface shadow-[var(--shadow-pulled)] ${className}`}
    >
      <MarginRule inset />
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close record"
          className="absolute right-2 top-1.5 z-10 font-mono text-[13px] leading-none text-ink-3 hover:text-ink"
        >
          ×
        </button>
      ) : null}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.25fr]">{children}</div>
    </div>
  );
}

/** One panel of a `Dossier`/`Worksheet`, with its mono-caps head. */
export function DossierPanel({
  title,
  children,
  className = "",
  /** Span every column — the decision bar at the foot of the worksheet. */
  full = false,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  full?: boolean;
}) {
  return (
    <section
      className={`min-w-0 border-l border-feint px-4 pb-3.5 pt-3 first:border-l-0 max-lg:border-l-0 max-lg:border-t max-lg:first:border-t-0 ${
        full ? "col-span-full border-l-0 border-t border-feint" : ""
      } ${className}`}
    >
      {title ? (
        <h3 className="mb-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}
