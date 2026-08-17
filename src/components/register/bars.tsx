import { WELL_VAR, type ColorToken } from "@/lib/format";

/**
 * THE ONE BAR COMPONENT.
 *
 * `src/app/page.tsx:91-109` and `src/app/analytics/page.tsx:101-119` were the
 * same nineteen lines twice. Both are deleted in favour of this; the
 * integration sweep asserts this file holds the only definition of it.
 *
 * Bars are instrument marks, so they live inside a `Well` and use the well
 * palette — a chart may never be painted in one accent hue (SYNTHESIS §2.6).
 * Give each series its own `tone` from the semantic set; the label always
 * names the category, so color is never the sole carrier (D3).
 */
export function Bars({
  items,
  max,
  unit,
}: {
  items: { label: string; count: number; tone?: ColorToken }[];
  /** Fixed scale. Defaults to the largest count (min 1, so 0s do not divide). */
  max?: number;
  /** Appended to each value in the accessible label, e.g. "applications". */
  unit?: string;
}) {
  if (items.length === 0) return null;
  const ceiling = Math.max(1, max ?? Math.max(...items.map((i) => i.count)));

  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2.5">
          <span className="w-[38%] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.04em] text-well-muted">
            {it.label}
          </span>
          <span
            className="h-1.5 min-w-0 flex-1 rounded-[1px] bg-well-grid"
            role="img"
            aria-label={`${it.label}: ${it.count}${unit ? ` ${unit}` : ""}`}
          >
            <span
              className="block h-1.5 rounded-[1px]"
              style={{
                width: `${(it.count / ceiling) * 100}%`,
                background: WELL_VAR[it.tone ?? "blue"],
              }}
            />
          </span>
          <span className="w-8 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums text-well-fg">
            {it.count}
          </span>
        </li>
      ))}
    </ul>
  );
}
