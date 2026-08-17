import type { ApplicationStage } from "@prisma/client";
import {
  STAGE_CODES,
  STAGE_GROUPS,
  STAGE_LABELS,
  STAGE_SHORT_LABELS,
  TOKEN_BG,
} from "@/lib/format";

/* ══════════════════════════════════════════════════════════════════════════
   THE SPINE INDEX (spec A9)

   Fourteen stages as card-catalog drawers in five group frames — the entire
   pipeline visible at once in ~64px. This replaces BOTH the transit line-map
   and the kanban: fourteen 240px columns is ~3.5k px of horizontal scroll with
   about five visible at 1440px, and no viewport will ever fix that.

   TRUNCATION IS CSS-ONLY — three label tiers chosen by breakpoint, every
   drawer rendering all three spans with exactly one visible. No JS width
   measurement, no ResizeObserver, therefore no hydration mismatch and no
   layout thrash:

     ≥1600px (2xl)      STAGE_LABELS        "Product/case interview"
     1180–1599 (spine)  STAGE_SHORT_LABELS  "Product case"
     <1180px            STAGE_CODES         "CSE"

   The tier is VIEWPORT-driven, not notation-driven. Notation mode governs
   classification vocabulary the user chose to learn; stage-label truncation is
   a fitting problem the layout must solve identically for both kinds of user.
   Coupling them would show a Plain-mode reader on a 13" screen the codes they
   explicitly opted out of.

   The strip WRAPS rather than scrolls — horizontal scroll would defeat the
   whole point. Drawers are FLUID, not fixed-width: each group frame takes a
   flex-basis of `stages × MIN_DRAWER` and grows in proportion to how many
   stages it holds, so every drawer in the strip is the same width and the
   whole pipeline still lands on one 64px line at 1180px. (Fixed 88px drawers
   needed 1298px and wrapped to 188px on a 13" screen — the exact case A9 was
   written to solve. Wrapping now happens only under ~1000px, and costs one
   more 64px line, never a scrollbar.)
   ══════════════════════════════════════════════════════════════════════════ */

/** Floor for one drawer: a two-digit count over a three-letter stage code. */
const MIN_DRAWER = 62;

export function SpineIndex({
  counts,
  activeStage,
  onSelect,
}: {
  counts: Partial<Record<ApplicationStage, number>>;
  activeStage?: ApplicationStage;
  /** `null` clears the filter. */
  onSelect: (s: ApplicationStage | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5 pb-3 pt-1" role="list" aria-label="Pipeline by stage">
      {STAGE_GROUPS.map((g) => {
        const groupTotal = g.stages.reduce((acc, s) => acc + (counts[s] ?? 0), 0);
        return (
          <div
            key={g.group}
            role="listitem"
            // `--spine-h` (globals.css) is the contract: one line, 64px, all
            // fourteen. Grow in proportion to stage count so drawer widths
            // stay uniform across group frames of different sizes.
            // Grow in proportion to stage count, but never below two drawers:
            // a one-stage group (IV · Offer) would otherwise get the narrowest
            // frame in the strip and `truncate` would eat its name, printing
            // `IV · OF…` — an ellipsis where the app's signature component
            // should say what it is.
            style={{
              flexGrow: g.stages.length,
              flexBasis: Math.max(2, g.stages.length) * MIN_DRAWER,
            }}
            className="flex h-[var(--spine-h)] min-w-0 flex-col overflow-hidden rounded border border-rule bg-surface"
          >
            <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-feint px-2 pb-[2px] pt-[3px] font-mono text-[10px] font-semibold uppercase leading-[13px] tracking-[0.1em] text-ink-3">
              <span className="truncate">
                {g.roman} · {g.label}
              </span>
              <span className="shrink-0 font-normal text-ink-2 tabular-nums">{groupTotal}</span>
            </div>
            <div className="flex min-h-0 flex-1">
              {g.stages.map((s) => {
                const count = counts[s] ?? 0;
                const active = activeStage === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={active}
                    title={STAGE_LABELS[s]}
                    aria-label={`${STAGE_LABELS[s]}: ${count} application${count === 1 ? "" : "s"}. ${
                      active ? "Clear filter" : "Filter to this stage"
                    }.`}
                    onClick={() => onSelect(active ? null : s)}
                    className={`relative flex min-w-0 flex-1 flex-col justify-center border-l border-feint px-1.5 text-left transition-colors duration-[120ms] ease-out first:border-l-0 ${
                      active ? "bg-sel" : "hover:bg-sel/50"
                    }`}
                  >
                    {/* Counts NEVER truncate. A drawer with 0 prints `0` in
                        --ink-3, never blank: an absent count is
                        indistinguishable from a rendering bug. */}
                    <span
                      className={`block font-mono text-[14px] leading-none tabular-nums ${
                        count === 0 ? "font-normal text-ink-3" : "font-semibold"
                      }`}
                    >
                      {count}
                    </span>
                    {/* Ellipsis is the last resort, not the plan: `title` and
                        `aria-label` on the drawer always carry the full stage
                        name, so a clipped label never loses information. */}
                    <span className="mt-[3px] block truncate font-mono text-[9.5px] font-medium uppercase leading-[11px] tracking-[0.01em] text-ink-3">
                      <span className="hidden 2xl:inline">{STAGE_LABELS[s]}</span>
                      <span className="hidden spine:inline 2xl:hidden">{STAGE_SHORT_LABELS[s]}</span>
                      <span className="spine:hidden">{STAGE_CODES[s]}</span>
                    </span>
                    <span
                      aria-hidden
                      className={`absolute inset-x-2 bottom-0 h-[2px] ${TOKEN_BG[g.tick]} ${
                        count === 0 ? "opacity-25" : ""
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
