import { Chip, ChipRow } from "@/components/register/chip";
import { statColor, statEntries, statLabel } from "./meta";

/**
 * A run's `stats` blob as ONE ruled line of chips (spec C7 — "StatChips becomes
 * a ChipRow").
 *
 * The chips are read-only: a stat is a record of what happened, not a filter,
 * so they render as `<span>`s (Chip drops `aria-pressed` and the button when no
 * `onClick` is passed) and carry the count in the chip's own count slot rather
 * than glued into the label.
 *
 * A neutral stat gets no leading tick. The tick is the Register's colored mark
 * and it should mean something — "this many came in" is not a verdict, while
 * "this many failed" is.
 */
export function StatChips({ stats, label }: { stats: unknown; label?: string }) {
  const entries = statEntries(stats);
  if (entries.length === 0) {
    return (
      <ChipRow label={label}>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
          No counters recorded
        </span>
      </ChipRow>
    );
  }
  return (
    <ChipRow label={label}>
      {entries.map(([key, value]) => {
        const color = statColor(key);
        return (
          <Chip
            key={key}
            label={statLabel(key)}
            count={value}
            tick={color === "ink-3" ? undefined : color}
          />
        );
      })}
    </ChipRow>
  );
}
