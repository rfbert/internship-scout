"use client";

import { STAGE_LABELS, TOKEN_TEXT, stageGroupColor } from "@/lib/format";
import { fmtDateShortTz } from "@/lib/dates";
import { DossierPanel } from "@/components/register/dossier";
import { stageGroup } from "./meta";
import type { TrackerHistoryEntry } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   CASE HISTORY — the record's append-only spine.

   The transit "journey log" (a route line with roundels down the left margin)
   is gone with the rest of the map. What replaces it is what an archive
   actually keeps: a dated column and one line of entry per event, oldest at
   the top, the most recent entry inked and its date carmine so the eye lands
   on where the case stands today.

   Read-only by construction — `ApplicationStatusHistory` is written only by
   the stage route, never by this panel.
   ══════════════════════════════════════════════════════════════════════════ */

export function CaseHistory({
  accession,
  history,
  timezone,
}: {
  accession: string;
  /** As loaded: `changedAt` DESC. Printed ascending — a history reads forward. */
  history: TrackerHistoryEntry[];
  timezone: string;
}) {
  const entries = [...history].reverse();
  const lastIndex = entries.length - 1;

  return (
    <DossierPanel title={`Case history · ${accession}`}>
      {entries.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-3">
          No transitions recorded yet
        </p>
      ) : (
        <ol className="space-y-[7px]">
          {entries.map((h, i) => {
            const current = i === lastIndex;
            return (
              <li key={h.id} className="flex items-baseline gap-3">
                <span
                  className={`w-[52px] shrink-0 font-mono text-[10.5px] font-medium uppercase tabular-nums tracking-[0.06em] ${
                    current ? "text-carmine" : "text-ink-3"
                  }`}
                >
                  {fmtDateShortTz(h.changedAt, timezone)}
                </span>
                <span
                  className={`min-w-0 text-[12.5px] leading-snug ${
                    current ? "font-semibold text-ink" : "text-ink-2"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mr-1.5 ${TOKEN_TEXT[stageGroupColor(stageGroup(h.toStage))]}`}
                  >
                    ▮
                  </span>
                  {h.note ? (
                    <>
                      {h.note}
                      <span className="text-ink-3"> · {STAGE_LABELS[h.toStage].toLowerCase()}</span>
                    </>
                  ) : (
                    <>
                      {STAGE_LABELS[h.toStage]}
                      <span className="text-ink-3">
                        {h.fromStage
                          ? ` · from ${STAGE_LABELS[h.fromStage].toLowerCase()}`
                          : " · entered the register"}
                      </span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </DossierPanel>
  );
}
