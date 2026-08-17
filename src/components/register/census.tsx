import type { ApplicationStage } from "@prisma/client";
import { STAGE_GROUPS, STAGE_LABELS } from "@/lib/format";
import { DotLeader } from "./rule";

/**
 * THE PIPELINE CENSUS — all 14 stages with dot leaders and group ticks, closed
 * by a double rule at `ON FILE`: the accountant's total.
 *
 * This is the dashboard's right rail, and it is what retires the bar chart
 * there. A bar chart of 14 categories is unreadable; 14 dot-leader rows are a
 * table of contents you can scan in one pass, and the double-ruled total is the
 * one number the page is actually about.
 *
 * A zero stage still prints `0`, dimmed — a blank is indistinguishable from a
 * rendering bug.
 */
export function Census({
  counts,
  total,
  href,
}: {
  counts: Partial<Record<ApplicationStage, number>>;
  total: number;
  /** Optional per-stage deep link, e.g. `(s) => `/tracker?stage=${s}``. */
  href?: (stage: ApplicationStage) => string;
}) {
  return (
    <div>
      <ul>
        {STAGE_GROUPS.flatMap((g) =>
          g.stages.map((s) => {
            const count = counts[s] ?? 0;
            const label = href ? (
              <a href={href(s)} className="hover:text-ink">
                {STAGE_LABELS[s]}
              </a>
            ) : (
              STAGE_LABELS[s]
            );
            return (
              <DotLeader
                key={s}
                tick={g.tick}
                muted={count === 0}
                title={`${g.roman} · ${g.label} — ${STAGE_LABELS[s]}`}
                label={label}
                value={count}
              />
            );
          }),
        )}
      </ul>
      <div className="mt-[7px] flex items-baseline gap-2 border-b-[3px] border-t border-double border-b-ink-2 border-t-ink-2 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]">
        <span>On file</span>
        <span className="ml-auto tabular-nums">{total}</span>
      </div>
    </div>
  );
}
