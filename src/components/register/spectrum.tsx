import type { ScoreBand } from "@prisma/client";
import { BAND_LABELS, WELL_VAR, bandColor } from "@/lib/format";
import { Well } from "./well";

/**
 * The score spectrum: one tick per listing at `score/100` along a 0–100 axis,
 * tinted by band, with the median etched as a cursor line and min/max labelled.
 *
 * It answers a question no stat tile can: "is tonight's intake good, or does it
 * only contain one good thing?" — the shape of the distribution, not its mean.
 *
 * Lives in a `Well`: it is an instrument, so its marks use the well palette
 * only, and it does not change color when the theme flips.
 */
export function Spectrum({
  points,
  median,
  label = "SCORE SPECTRUM",
  className = "",
}: {
  points: { id: string; score: number; band: ScoreBand; emphasized?: boolean }[];
  /** Etched cursor line. Omit to hide it. */
  median?: number;
  label?: string;
  className?: string;
}) {
  if (points.length === 0) return null;

  const scores = points.map((p) => p.score);
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);

  return (
    <Well
      label={label}
      right={`${points.length} record${points.length === 1 ? "" : "s"} · ${lo}–${hi}`}
      className={className}
    >
      <div
        className="relative h-[38px]"
        role="img"
        aria-label={`Score spectrum of ${points.length} records, from ${lo} to ${hi}${
          median != null ? `, median ${median}` : ""
        }.`}
      >
        {/* Graticule: deliberately sub-threshold. It frames, it never informs. */}
        <div className="absolute inset-x-0 bottom-[13px] h-px bg-well-grid" />
        {[0, 25, 50, 75, 100].map((t) => (
          <div
            key={t}
            aria-hidden
            className="absolute bottom-[13px] h-1.5 w-px bg-well-grid"
            style={{ left: `${t}%` }}
          />
        ))}

        {points.map((p) => (
          <div
            key={p.id}
            aria-hidden
            title={`${p.score} · ${BAND_LABELS[p.band]}`}
            className={`absolute bottom-[13px] w-px ${p.emphasized ? "h-[22px]" : "h-[13px]"}`}
            style={{
              left: `${Math.max(0, Math.min(100, p.score))}%`,
              background: WELL_VAR[bandColor(p.band)],
              width: p.emphasized ? "2px" : "1px",
            }}
          />
        ))}

        {median != null ? (
          <div
            aria-hidden
            className="absolute bottom-[9px] h-[26px] w-px bg-well-cursor"
            style={{ left: `${Math.max(0, Math.min(100, median))}%` }}
          />
        ) : null}

        <div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[10px] text-well-muted">
          <span>0</span>
          <span>100</span>
        </div>
        {/* Anchored to the cursor, not centred between the axis ends: a
            `justify-between` label always sat at 50% and so contradicted its
            own line whenever the median was not the midpoint. */}
        {median != null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-well-muted"
            style={{ left: `${Math.max(8, Math.min(92, median))}%` }}
          >
            MEDIAN {median}
          </div>
        ) : null}
      </div>
    </Well>
  );
}
