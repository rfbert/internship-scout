import type { ReactNode } from "react";
import { TOKEN_BG, type ColorToken } from "@/lib/format";

/**
 * THE ONE FILTER CHIP. Replaces the three implementations that existed before
 * (`tracker-client.tsx`, `opportunities/filter-chips.tsx`,
 * `archive/archive-filters.tsx`).
 *
 * Bordered mono caps, 2px radius, a colored LEADING TICK — never a fill. Active
 * inverts to an ink stamp, which is the same "this is authoritative" mark the
 * primary verb uses.
 *
 * `aria-pressed` is preserved from the controls this replaces (D7).
 */
export function Chip({
  label,
  count,
  tick,
  active = false,
  onClick,
  title,
}: {
  label: string;
  /** Live count, right of the label. `0` still prints — a blank count is indistinguishable from a bug. */
  count?: number;
  /** Leading 2px tick, e.g. the band's color or the stage group's. */
  tick?: ColorToken;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const cls = [
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-[3px] font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] transition-colors duration-[120ms] ease-out",
    active
      ? "border-ink bg-ink text-paper"
      : "border-rule bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
  ].join(" ");

  const inner = (
    <>
      {tick ? (
        <span aria-hidden className={`h-2.5 w-[3px] shrink-0 rounded-none ${TOKEN_BG[tick]}`} />
      ) : null}
      {label}
      {count != null ? (
        <span className={active ? "text-paper/70" : "text-ink-3"}>{count}</span>
      ) : null}
    </>
  );

  if (!onClick) {
    return (
      <span className={cls} title={title}>
        {inner}
      </span>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={title} className={cls}>
      {inner}
    </button>
  );
}

/** One ruled toolbar line of chips. Wraps; never scrolls horizontally. */
export function ChipRow({
  children,
  label,
  right,
}: {
  children: ReactNode;
  /** Accessible group name, e.g. "Filter by band". */
  label?: string;
  /** Right-aligned tail, e.g. a result count or a "More filters" disclosure. */
  right?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5 border-b border-feint py-2"
    >
      {children}
      {right ? <div className="ml-auto flex items-center gap-2">{right}</div> : null}
    </div>
  );
}
