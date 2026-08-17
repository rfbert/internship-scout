import { Well } from "./well";

/* ══════════════════════════════════════════════════════════════════════════
   THE DEADLINE TAPE (spec A7)

   Horizon is DYNAMIC — "through the latest known deadline", clamped to
   [14, 45] days — not a fixed 38. Three reasons, all grounded in the data:

     · The dashboard already loads its deadline set (8 upcoming + 3 overdue).
       Rendering from exactly that array means zero query changes. A fixed axis
       would silently drop the ninth deadline or leave two-thirds of the strip
       empty depending on the week; a dynamic axis always frames what it was
       given.
     · The floor of 14 stops a single T+2 deadline from producing a 2-day axis
       with no room for flags.
     · The ceiling of 45 stops one distant OFFER_DEADLINE from compressing the
       urgent cluster into the first 3% of the strip.

   Overdue items are never dropped and never distort the axis: they cluster in
   a fixed gutter LEFT of NOW.
   ══════════════════════════════════════════════════════════════════════════ */

export interface TapeItem {
  id: string;
  /** Short mono-caps label, e.g. `DATABRICKS · OA`. */
  label: string;
  /** ISO string. */
  dueAt: string;
  isEstimated: boolean;
  href?: string;
}

const DAY = 86_400_000;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Whole days from `now` to `dueAt`; negative when overdue. */
export const daysUntil = (dueAt: string, now: string) =>
  Math.ceil((new Date(dueAt).getTime() - new Date(now).getTime()) / DAY);

/** `clamp(ceil(daysBetween(now, latestLoadedDueAt)), 14, 45)`. */
export function tapeHorizon(items: TapeItem[], now: string): number {
  const future = items.map((i) => daysUntil(i.dueAt, now)).filter((d) => d >= 0);
  if (future.length === 0) return 14;
  return clamp(Math.max(...future), 14, 45);
}

export function DeadlineTape({
  items,
  now,
  span = "auto",
  label = "DEADLINE TAPE",
}: {
  items: TapeItem[];
  /** ISO "now" from the server, so the axis does not drift on hydration. */
  now: string;
  /** `"auto"` = A7's clamped horizon. `14` = the tracker's compact variant. */
  span?: "auto" | 14;
  label?: string;
}) {
  /* Empty state: the tape DOES NOT RENDER. An empty axis is graticule without
     data — noise. One rule and one line instead. */
  if (items.length === 0) {
    return (
      <div className="border-t border-rule py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
        {/* Just the absence, once. This used to add "· nothing scheduled in
            the next 45 days", which was wrong twice over: 45 is the axis
            CEILING that `tapeHorizon` may choose, not a window the data was
            filtered to, and the tracker renders this same component with
            `span={14}`. It also stated one absence in two clauses. */}
        No deadlines on file.
      </div>
    );
  }

  const horizon = span === 14 ? 14 : tapeHorizon(items, now);

  const dated = items
    .map((i) => ({ ...i, d: daysUntil(i.dueAt, now) }))
    .sort((a, b) => a.d - b.d);

  const overdue = dated.filter((i) => i.d < 0);
  const ahead = dated.filter((i) => i.d >= 0 && i.d <= horizon);

  // Nearest deadline on the BOTTOM row, so the eye lands on the urgent one.
  const rowOf = (index: number) => index % 3;

  const tickDays: number[] = [];
  for (let d = 7; d < horizon; d += 7) tickDays.push(d);

  return (
    <Well label={label} right={`NOW → T+${horizon}`}>
      <div className="flex items-stretch gap-3">
        {overdue.length > 0 ? (
          <div className="w-[120px] shrink-0 border-r border-well-rule pr-3">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-well-carmine">
              Overdue
            </div>
            <ul className="mt-1 space-y-0.5">
              {overdue.map((i) => (
                <li
                  key={i.id}
                  className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-well-carmine"
                  title={i.label}
                >
                  {i.isEstimated ? "~" : ""}
                  {i.label} · {Math.abs(i.d)}d
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="relative min-w-0 flex-1" style={{ height: "var(--tape-h)" }}>
          {/* Axis */}
          <div aria-hidden className="absolute inset-x-0 bottom-[14px] h-px bg-well-rule" />
          <div aria-hidden className="absolute bottom-[10px] left-0 h-2 w-px bg-well-fg" />
          <div aria-hidden className="absolute bottom-[10px] right-0 h-2 w-px bg-well-rule" />
          {tickDays.map((d) => (
            <div
              key={d}
              aria-hidden
              className="absolute bottom-[11px] h-1.5 w-px bg-well-grid"
              style={{ left: `${(d / horizon) * 100}%` }}
            />
          ))}

          {/* Flags */}
          {ahead.map((i, idx) => {
            const tone =
              i.d < 7 ? "text-well-carmine" : i.d < 21 ? "text-well-ochre" : "text-well-fg";
            const border =
              i.d < 7
                ? "border-well-carmine"
                : i.d < 21
                  ? "border-well-ochre"
                  : "border-well-rule";
            return (
              <span
                key={i.id}
                title={i.label}
                aria-label={i.isEstimated ? `${i.label}, estimated` : i.label}
                className={`absolute max-w-[160px] -translate-x-1/2 overflow-hidden text-ellipsis whitespace-nowrap rounded border px-1 py-px font-mono text-[10px] ${tone} ${border} ${
                  i.isEstimated ? "border-dashed" : ""
                }`}
                style={{
                  left: `${clamp((i.d / horizon) * 100, 0, 100)}%`,
                  bottom: `${20 + rowOf(idx) * 17}px`,
                }}
              >
                {i.isEstimated ? "~" : ""}
                {i.label} · T-{i.d}
              </span>
            );
          })}

          <div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[10px] text-well-muted">
            <span>NOW</span>
            <span>T+{horizon}</span>
          </div>
        </div>
      </div>
    </Well>
  );
}
