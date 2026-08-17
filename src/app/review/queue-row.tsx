"use client";

import type { KeyboardEvent } from "react";
import { LedgerCell, LedgerRow, type LedgerCol } from "@/components/register/ledger";
import { Band, Estimated, Sponsorship } from "@/components/register/notation";
import { TOKEN_TEXT, bandIsStruck } from "@/lib/format";
import { fmtDateShortTz } from "@/lib/dates";
import {
  SOURCE_KIND_LABELS,
  SOURCE_KIND_SHORT,
  VERDICT_LABELS,
  VERDICT_SENTENCES,
  preStruckReason,
  verdictColor,
} from "./meta";
import type { ReviewRow, Verdict } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   ONE 34px LINE PER RECORD

   The card-per-row idiom is gone: nine facts about a posting now fit on one
   ruled line instead of a ~140px card, which is the whole point of a docket —
   you read down the column, not across nine cards.

   `QUEUE_COLS` is exported because `Ledger` (which publishes the grid template)
   and `LedgerHead` (which prints the labels) must be handed the SAME array, and
   the shell owns both.
   ══════════════════════════════════════════════════════════════════════════ */

export const QUEUE_COLS: LedgerCol[] = [
  { label: "", w: "20px" }, // bulk-selection checkbox
  { label: "No.", w: "48px" },
  { label: "Score", w: "104px", align: "right" },
  { label: "Company — Role", w: "minmax(0,1fr)" },
  { label: "Sponsorship", w: "146px" },
  { label: "Location", w: "128px" },
  { label: "Source", w: "104px" },
  { label: "Posted", w: "64px" },
  { label: "Deadline", w: "82px" },
  { label: "Verdict", w: "168px", align: "right" },
];

/** Below this the ledger scrolls inside itself — the page never does. */
export const QUEUE_MIN_WIDTH = 1220;

export function QueueRow({
  row,
  queueNo,
  timezone,
  focused,
  checked,
  verdict,
  onSelect,
  onToggleCheck,
}: {
  row: ReviewRow;
  /** `Q-04` — the docket number for this sitting, frozen at mount (A2). */
  queueNo: string;
  timezone: string;
  focused: boolean;
  checked: boolean;
  /** What this sitting decided about the record, if anything (verdict memory). */
  verdict?: Verdict;
  onSelect: () => void;
  onToggleCheck: () => void;
}) {
  const struck = bandIsStruck(row.band) || isStrike(verdict);
  const posted = row.postedAt ?? row.discoveredAt;

  // The row is clickable, so `LedgerRow` gives it `tabIndex={0}`. Enter/Space
  // must therefore move the caret to it — the same contract the tracker's rows
  // already keep. This is element activation, not a new global binding (D1).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <LedgerRow
      focused={focused}
      struck={struck}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      ariaLabel={`${queueNo}. ${row.companyName} — ${row.title}`}
    >
      <LedgerCell>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleCheck}
          onClick={(e) => e.stopPropagation()}
          className="size-3 accent-[var(--ink)] align-middle"
          aria-label={`Select ${row.companyName} — ${row.title}`}
        />
      </LedgerCell>

      <LedgerCell mono muted>
        {queueNo}
      </LedgerCell>

      <LedgerCell align="right">
        <Band band={row.band} score={row.score} />
      </LedgerCell>

      <LedgerCell title={`${row.companyName} — ${row.title}`}>
        <span data-row-title className="text-[13px]">
          <span className="font-semibold">{row.companyName}</span>
          <span aria-hidden className="mx-1 text-ink-3">
            —
          </span>
          <span className="font-normal text-ink-2">{row.title}</span>
        </span>
        {row.isSample ? (
          <span
            title="Seed data for illustration — not a real posting."
            className="ml-1.5 whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ochre"
          >
            Sample
          </span>
        ) : null}
      </LedgerCell>

      <LedgerCell>
        <Sponsorship category={row.sponsorshipCategory} confidence={row.sponsorshipConfidence} />
      </LedgerCell>

      <LedgerCell mono title={row.location ?? undefined}>
        {row.location ? row.location.toUpperCase() : "—"}
      </LedgerCell>

      <LedgerCell mono muted title={row.sourceKind ? SOURCE_KIND_LABELS[row.sourceKind] : undefined}>
        {row.sourceKind ? SOURCE_KIND_SHORT[row.sourceKind] : "—"}
      </LedgerCell>

      <LedgerCell mono muted>
        {fmtDateShortTz(posted, timezone).toUpperCase()}
      </LedgerCell>

      <LedgerCell mono>
        {row.deadline ? (
          row.deadlineIsEstimated ? (
            <Estimated>{fmtDateShortTz(row.deadline, timezone).toUpperCase()}</Estimated>
          ) : (
            fmtDateShortTz(row.deadline, timezone).toUpperCase()
          )
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </LedgerCell>

      <LedgerCell align="right">
        <VerdictStamp row={row} verdict={verdict} />
      </LedgerCell>
    </LedgerRow>
  );
}

/**
 * The verdict cell. Three states, in priority order:
 *
 *  1. A verdict stamped this sitting — `FILED`, `SET ASIDE`, `STRUCK`. Always
 *     plain English in both notation modes: the notation switch governs
 *     classification vocabulary, never what you decided (A5).
 *  2. `PRE-STRUCK · CITIZENSHIP` — the eligibility gates already decided, and
 *     the cell names the gate that closed rather than repeating the band.
 *  3. Blank. An undecided record has no verdict, and inventing one ("pending")
 *     would put nine identical words down the most valuable column on screen.
 */
function VerdictStamp({ row, verdict }: { row: ReviewRow; verdict?: Verdict }) {
  if (verdict) {
    return (
      <span
        title={VERDICT_SENTENCES[verdict.action]}
        className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
          TOKEN_TEXT[verdictColor(verdict.action)]
        }`}
      >
        {VERDICT_LABELS[verdict.action]}
        {verdict.accession ? (
          <>
            <span aria-hidden> → </span>
            {verdict.accession}
          </>
        ) : null}
      </span>
    );
  }

  if (row.band === "INELIGIBLE") {
    const why = preStruckReason(row.sponsorshipCategory);
    return (
      <span
        title="Struck by the eligibility gates before it reached the docket."
        className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] ${TOKEN_TEXT.carmine}`}
      >
        Pre-struck{why ? ` · ${why}` : null}
      </span>
    );
  }

  return null;
}

const isStrike = (v?: Verdict) =>
  v != null && (v.action === "discard" || v.action === "ineligible" || v.action === "duplicate");
