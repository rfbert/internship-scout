import type { ReactNode } from "react";
import { Keycap } from "./keycap";

/**
 * The map key. Every working surface ends in a fixed 36px strip: notation
 * legend on the left, keycaps on the right.
 *
 * Two rules that keep it honest:
 *  1. The legend prints FULL WORDS in both notation modes, and lists only the
 *     notations actually present on the current surface. A legend for marks
 *     that are not on screen is noise.
 *  2. A printed keycap must correspond to a binding that already exists (D1).
 *     Where the keys are only a reminder of another page's bindings, say so in
 *     the `Keys` label — do not imply a live binding.
 *
 * `.register-footnote` is hidden by the print stylesheet (A8).
 */
export function Footnote({ legend, keys }: { legend: ReactNode; keys: ReactNode }) {
  return (
    <div className="register-footnote fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper">
      <div className="mx-auto flex h-[var(--footnote-h)] max-w-[1800px] items-center gap-4 px-[var(--gutter)] pl-[calc(var(--margin-rule)+var(--gutter))]">
        <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] tracking-[0.04em] text-ink-3">
          {legend}
        </div>
        <div className="ml-auto whitespace-nowrap font-mono text-[11px] tracking-[0.04em] text-ink-3">
          {keys}
        </div>
      </div>
    </div>
  );
}

export interface LegendItem {
  /** The mark as it appears on screen: `EXC`, `~`, `HIST`. */
  mark: string;
  /**
   * Its full-word meaning: `exceptional`, `prior sponsor`, or — for the
   * certainty stroke, which every surface glosses identically —
   * `ESTIMATED_GLOSS` from `@/lib/notation`.
   */
  meaning: string;
}

export function Legend({ items, title }: { items: LegendItem[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <span>
      {title ? <span className="font-medium text-ink-2">{title}: </span> : null}
      {items.map((it, i) => (
        <span key={it.mark}>
          {i > 0 ? " · " : null}
          <span className="font-medium text-ink-2">{it.mark}</span> {it.meaning}
        </span>
      ))}
    </span>
  );
}

export function Keys({
  items,
  label,
}: {
  items: { key: string; label: string }[];
  /** Say where the bindings live when they are not on this page. */
  label?: string;
}) {
  return (
    <span>
      {label ? <span className="mr-2 text-ink-3">{label}</span> : null}
      {items.map((it) => (
        <span key={it.key} className="ml-2">
          <Keycap>{it.key}</Keycap> {it.label}
        </span>
      ))}
    </span>
  );
}
