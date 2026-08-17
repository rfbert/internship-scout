"use client";

import { useState } from "react";
import { DossierPanel, Worksheet as WorksheetFrame } from "@/components/register/dossier";
import { AssessmentLedger } from "@/components/register/assessment-ledger";
import { DangerVerb, OutlineVerb, Stamp, StampLink } from "@/components/register/stamp";
import { inputCls } from "@/components/ui";
import { TOKEN_TEXT } from "@/lib/format";
import { DiscardPicker } from "./discard-picker";
import { Evidence } from "./evidence";
import type { DecisionAction } from "./decisions";
import type { DiscardReasonOption, ReviewRow } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   THE PULLED RECORD

   The focused row lifts out of the ledger into a two-column worksheet:
   the ARITHMETIC on the left (what the score is made of), the EVIDENCE on the
   right (why the sponsorship verdict reads the way it does), and the decision
   bar spanning both. Depth on demand — one record at a time, never nine cards.

   The four printed keycaps here are the four live bindings in
   `review-list.tsx` (D1). They render inside the verbs via `Stamp`'s `keycap`
   prop, which is `aria-hidden` — so the accept button's accessible name still
   begins with "accept" and `tests/e2e/smoke.spec.ts:35,37` keeps matching it.
   ══════════════════════════════════════════════════════════════════════════ */

export function ReviewWorksheet({
  row,
  timezone,
  busy,
  reasons,
  discardOpen,
  discardReasonKey,
  noteOpen,
  remaining,
  paceSeconds,
  onAction,
  onOpenDiscard,
  onCloseDiscard,
  onDiscardReasonChange,
  onConfirmDiscard,
  onOpenNote,
  onCloseNote,
  onSaveNote,
  onReanalyze,
}: {
  row: ReviewRow;
  timezone: string;
  busy: boolean;
  reasons: DiscardReasonOption[];
  discardOpen: boolean;
  discardReasonKey: string;
  noteOpen: boolean;
  /** Records on the docket with no verdict yet, this one included. */
  remaining: number;
  /** Median seconds per decision this sitting, or null before the first one. */
  paceSeconds: number | null;
  onAction: (action: DecisionAction) => void;
  onOpenDiscard: () => void;
  onCloseDiscard: () => void;
  onDiscardReasonChange: (key: string) => void;
  onConfirmDiscard: () => void;
  onOpenNote: () => void;
  onCloseNote: () => void;
  onSaveNote: (body: string) => void;
  onReanalyze: () => void;
}) {
  const detail = row.scoreDetail;
  const postingHref = row.postingUrl ?? row.applyUrl;
  const applyHref = row.applyUrl ?? row.postingUrl;

  return (
    <WorksheetFrame label={`Record ${row.companyName} — ${row.title}`}>
      {/* ── Left: the arithmetic ─────────────────────────────────────────── */}
      <DossierPanel>
        {detail ? (
          <AssessmentLedger
            components={detail.components}
            weights={detail.weights}
            overall={detail.overall}
            band={detail.band}
            adjustmentLabel={detail.adjustmentLabel}
            rationale={detail.rationale ?? undefined}
            rulesVersion={detail.analysisVersion}
          />
        ) : (
          <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
            Not yet scored — the assessment ledger has nothing to total.
          </p>
        )}
        <Noted row={row} />
      </DossierPanel>

      {/* ── Right: the case ──────────────────────────────────────────────── */}
      <DossierPanel title="Evidence & examiner's notes">
        <Evidence row={row} timezone={timezone} />
      </DossierPanel>

      {/* ── The decision bar ─────────────────────────────────────────────── */}
      <DossierPanel full>
        <div className="flex flex-wrap items-center gap-1.5">
          <Stamp keycap="A" disabled={busy} onClick={() => onAction("accept")}>
            Accept → tracker
          </Stamp>
          <OutlineVerb keycap="S" disabled={busy} onClick={() => onAction("save")}>
            Shortlist
          </OutlineVerb>
          {discardOpen ? (
            <DiscardPicker
              autoFocus
              reasons={reasons}
              value={discardReasonKey}
              onChange={onDiscardReasonChange}
              onConfirm={onConfirmDiscard}
              onCancel={onCloseDiscard}
              disabled={busy}
            />
          ) : (
            <DangerVerb keycap="D" disabled={busy} onClick={onOpenDiscard}>
              Discard
            </DangerVerb>
          )}
          {postingHref ? (
            <StampLink external keycap="O" href={postingHref} title="Opens in a new tab">
              Open posting
            </StampLink>
          ) : null}
          {applyHref && applyHref !== postingHref ? (
            <StampLink external href={applyHref} title="Opens in a new tab">
              Apply
            </StampLink>
          ) : null}

          <MoreMenu
            busy={busy}
            noteOpen={noteOpen}
            onAction={onAction}
            onOpenNote={onOpenNote}
            onCloseNote={onCloseNote}
            onReanalyze={onReanalyze}
          />

          <span className="ml-auto whitespace-nowrap font-mono text-[10.5px] tracking-[0.04em] text-ink-3">
            {remaining} remaining
            {paceSeconds != null && remaining > 0
              ? ` · about ${Math.max(1, Math.round((remaining * paceSeconds) / 60))} min at your pace`
              : null}
          </span>
        </div>

        {noteOpen ? (
          <NoteEditor busy={busy} onSave={onSaveNote} onCancel={onCloseNote} />
        ) : null}
      </DossierPanel>
    </WorksheetFrame>
  );
}

/**
 * The scorer's own notes, three marks deep. ASCII `+ ! ?` in the mono face —
 * the full-width CJK plus/bang marks this replaces were the wrong metrics in a Latin
 * mono column and never lined up (B5).
 */
function Noted({ row }: { row: ReviewRow }) {
  const groups = [
    { kind: "POSITIVE", mark: "+", tone: TOKEN_TEXT.green },
    { kind: "CONCERN", mark: "!", tone: TOKEN_TEXT.ochre },
    { kind: "MISSING", mark: "?", tone: TOKEN_TEXT["ink-3"] },
  ] as const;

  const items = groups.flatMap((g) =>
    row.explanations
      .filter((e) => e.kind === g.kind)
      .map((e, i) => ({ key: `${g.kind}-${i}`, mark: g.mark, tone: g.tone, text: e.text }))
  );
  if (items.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1 border-t border-feint pt-2.5">
      {items.map((it) => (
        <li key={it.key} className="flex gap-2 text-[12.5px] leading-snug text-ink-2">
          <span aria-hidden className={`font-mono font-semibold ${it.tone}`}>
            {it.mark}
          </span>
          {it.text}
        </li>
      ))}
    </ul>
  );
}

function NoteEditor({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="mt-2.5 flex items-start gap-1.5">
      <textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Note on this record…"
        aria-label="Note on this record"
        className={`${inputCls} w-full max-w-md resize-y`}
      />
      <Stamp disabled={busy || !text.trim()} onClick={() => onSave(text)}>
        Save note
      </Stamp>
      <OutlineVerb onClick={onCancel}>Cancel</OutlineVerb>
    </div>
  );
}

/**
 * The rarely-used verdicts. `role="menu"` / `role="menuitem"` and the
 * two-step confirm on the archiving actions are preserved from the row's old
 * overflow menu (D7) — only the skin changed.
 */
function MoreMenu({
  busy,
  noteOpen,
  onAction,
  onOpenNote,
  onCloseNote,
  onReanalyze,
}: {
  busy: boolean;
  noteOpen: boolean;
  onAction: (action: DecisionAction) => void;
  onOpenNote: () => void;
  onCloseNote: () => void;
  onReanalyze: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<"ineligible" | "duplicate" | null>(null);

  // Deliberately NO Escape handler here. D1 forbids new global key bindings on
  // this page, and the menu this replaces closed only by click-outside — the
  // overlay below reproduces that exactly.
  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <OutlineVerb
        disabled={busy}
        onClick={() => {
          setOpen((v) => !v);
          setConfirm(null);
        }}
      >
        More
      </OutlineVerb>
      {open ? (
        <>
          <span className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <span
            role="menu"
            aria-label="More verdicts"
            className="absolute bottom-full left-0 z-30 mb-1 flex w-52 flex-col rounded border border-rule bg-surface py-1 shadow-[var(--shadow-pulled)]"
          >
            {confirm ? (
              <span className="px-3 py-2 text-[12.5px]">
                <p className="mb-2 text-ink-2">
                  {confirm === "ineligible"
                    ? "Strike as ineligible? It moves to the Archive, where it can be restored."
                    : "Strike as a duplicate? It moves to the Archive, where it can be restored."}
                </p>
                <span className="flex gap-1.5">
                  <DangerVerb
                    disabled={busy}
                    onClick={() => {
                      onAction(confirm);
                      setOpen(false);
                      setConfirm(null);
                    }}
                  >
                    Confirm
                  </DangerVerb>
                  <OutlineVerb onClick={() => setConfirm(null)}>Cancel</OutlineVerb>
                </span>
              </span>
            ) : (
              <>
                <MenuItem label="Mark ineligible" onClick={() => setConfirm("ineligible")} />
                <MenuItem label="Mark duplicate" onClick={() => setConfirm("duplicate")} />
                <MenuItem
                  label="Already applied"
                  onClick={() => {
                    onAction("already_applied");
                    setOpen(false);
                  }}
                />
                <MenuItem
                  label={noteOpen ? "Close note" : "Add note"}
                  onClick={() => {
                    setOpen(false);
                    if (noteOpen) onCloseNote();
                    else onOpenNote();
                  }}
                />
                <MenuItem
                  label={busy ? "Working…" : "Re-run analysis"}
                  onClick={() => {
                    setOpen(false);
                    onReanalyze();
                  }}
                />
              </>
            )}
          </span>
        </>
      ) : null}
    </span>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="px-3 py-1.5 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-2 transition-colors duration-[120ms] ease-out hover:bg-sel hover:text-ink"
    >
      {label}
    </button>
  );
}
