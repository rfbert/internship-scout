"use client";

import { useState } from "react";
import type { ApplicationStage } from "@prisma/client";
import { DossierPanel } from "@/components/register/dossier";
import { DangerVerb, OutlineVerb, Stamp } from "@/components/register/stamp";
import { inputCls, selectCls } from "@/components/ui";
import { STAGE_LABELS } from "@/lib/format";
import { dateOnlyToUtcNoon, fmtDateShortTz, fmtDateTz } from "@/lib/dates";
import { REMOVAL_REASONS, STAGE_ORDER, isOverdue, type RemovalReason } from "./meta";
import type { TrackerRow } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   NEXT ACTION — the only panel that writes to the pipeline.

   With the board gone, this is the sole stage control (D1), so it carries BOTH
   halves: the one-click `ADVANCE → <next stage>` stamp for the move that is
   almost always the one you want, and, one disclosure down, the full selector
   with its transition note and backdate — the flow the drawer had, unchanged
   in behavior and still keyboard-reachable.

   `ADVANCE` is deliberately absent on a terminal record: there is nowhere to
   advance to, and a disabled stamp for an impossible move is noise.
   ══════════════════════════════════════════════════════════════════════════ */

/** The next stage in progression order, or null at the end of the line. */
export function nextStageOf(stage: ApplicationStage): ApplicationStage | null {
  const i = STAGE_ORDER.indexOf(stage);
  // Index 10 is OFFER — the last stage anything advances INTO. REJECTED /
  // WITHDRAWN / CLOSED are exits, chosen explicitly, never advanced into.
  return i >= 0 && i < 10 ? STAGE_ORDER[i + 1] : null;
}

export function NextAction({
  row,
  timezone,
  now,
  busy,
  onStageChange,
  onAddNote,
  onRemove,
}: {
  row: TrackerRow;
  timezone: string;
  /** The server's clock — the same one the register measures overdue against. */
  now: string;
  busy: boolean;
  /** Resolves to the server's message on failure, `null` on success. */
  onStageChange: (
    stage: ApplicationStage,
    note?: string,
    changedAt?: string
  ) => Promise<string | null>;
  onAddNote: (body: string) => Promise<boolean>;
  onRemove: (reason: RemovalReason) => void;
}) {
  const [stageOpen, setStageOpen] = useState(false);
  const [stageSel, setStageSel] = useState<ApplicationStage>(row.stage);
  const [stageNote, setStageNote] = useState("");
  const [stageDate, setStageDate] = useState(""); // yyyy-mm-dd backdate, "" = now
  const [logOpen, setLogOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Keep the selector honest when a refresh lands a server-side change —
  // adjusted during render, never in an effect (react.dev/you-might-not-need-an-effect).
  const [prevStage, setPrevStage] = useState(row.stage);
  if (prevStage !== row.stage) {
    setPrevStage(row.stage);
    setStageSel(row.stage);
  }

  const next = nextStageOf(row.stage);
  const overdue = isOverdue(row.followUpAt, row.stage, now, timezone);

  const submitStage = async () => {
    // A backdate is a CALENDAR DAY, not an instant: anchor it at noon UTC the
    // way every date-only write in this app does, or it reads a day early west
    // of Greenwich (see the header of @/lib/dates).
    const failure = await onStageChange(
      stageSel,
      stageNote,
      dateOnlyToUtcNoon(stageDate)?.toISOString()
    );
    if (failure === null) {
      setStageNote("");
      setStageDate("");
      setStageOpen(false);
    }
  };

  return (
    <DossierPanel title="Next action">
      {row.nextAction ? (
        <p className="text-[13px] font-semibold leading-snug text-ink">{row.nextAction}</p>
      ) : (
        <p className="text-[12.5px] text-ink-3">
          Nothing recorded — set one in <span className="font-medium">Details</span> below.
        </p>
      )}

      {row.followUpAt ? (
        <p
          className={`mt-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
            overdue ? "text-carmine" : "text-ink-2"
          }`}
        >
          {overdue ? "Follow-up overdue" : "Follow-up due"} · {fmtDateShortTz(row.followUpAt, timezone)}
        </p>
      ) : null}

      {/* ── The verbs ────────────────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {next ? (
          <Stamp
            disabled={busy}
            onClick={() => void onStageChange(next)}
            title={`Move this record from ${STAGE_LABELS[row.stage]} to ${STAGE_LABELS[next]}`}
          >
            Advance <span aria-hidden>→</span> {STAGE_LABELS[next]}
          </Stamp>
        ) : null}
        <OutlineVerb onClick={() => setLogOpen((v) => !v)}>Log activity</OutlineVerb>
        {/* `Remove`, not `Withdraw`. This control takes the record OUT of the
            register; `Withdrawn` is a live stage in the same tracker (the
            selector above offers it, and the census counts it), so the one
            word named two different acts on one panel. The panel it opens has
            always said "Remove … from the register?". */}
        <DangerVerb onClick={() => setConfirmRemove((v) => !v)}>Remove</DangerVerb>
      </div>

      <button
        type="button"
        onClick={() => setStageOpen((v) => !v)}
        aria-expanded={stageOpen}
        className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
      >
        {stageOpen ? "− " : "+ "}Change stage, note or backdate
      </button>

      {stageOpen ? (
        <div className="mt-2 space-y-1.5 rounded border border-rule bg-inset p-2">
          <select
            className={`${selectCls} w-full`}
            value={stageSel}
            onChange={(e) => setStageSel(e.target.value as ApplicationStage)}
            aria-label="New stage"
          >
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <input
            className={`${inputCls} w-full`}
            placeholder="Transition note (optional)"
            value={stageNote}
            onChange={(e) => setStageNote(e.target.value)}
          />
          <input
            className={`${inputCls} w-full`}
            type="date"
            aria-label="Transition date (defaults to today)"
            title="Backdate this transition (defaults to today)"
            value={stageDate}
            onChange={(e) => setStageDate(e.target.value)}
          />
          <OutlineVerb disabled={busy || stageSel === row.stage} onClick={() => void submitStage()}>
            Update stage
          </OutlineVerb>
        </div>
      ) : null}

      {/* ── Log activity — the note write, and the memoranda already on file ── */}
      {logOpen ? (
        <div className="mt-2 space-y-1.5 rounded border border-rule bg-inset p-2">
          <textarea
            autoFocus
            rows={2}
            className={`${inputCls} w-full resize-y`}
            placeholder="What happened? — call, email, prep, decision…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <OutlineVerb
            disabled={busy || !noteText.trim()}
            onClick={() => {
              void onAddNote(noteText.trim()).then((ok) => {
                if (ok) setNoteText("");
              });
            }}
          >
            Save entry
          </OutlineVerb>
        </div>
      ) : null}

      {row.notes.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-feint pt-2.5">
          {row.notes.map((n) => (
            <li key={n.id} className="text-[12px] leading-snug text-ink-2">
              <span className="mr-2 font-mono text-[10px] uppercase tabular-nums tracking-[0.06em] text-ink-3">
                {fmtDateShortTz(n.createdAt, timezone)}
              </span>
              <span className="whitespace-pre-wrap">{n.body}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── Remove ───────────────────────────────────────────────────────────
          The reason is not paperwork: it decides whether the daily agent will
          suggest this role again tomorrow, so each option says its consequence
          out loud. Nothing is hard-deleted — the toast offers a real undo. */}
      {confirmRemove ? (
        <div className="mt-3 border-t border-carmine pt-2.5">
          <p className="text-[12.5px] font-medium text-ink">
            Remove {row.companyName} from the register?
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Nothing is deleted permanently — you can undo this straight after.
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {REMOVAL_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  onRemove(r.id);
                  setConfirmRemove(false);
                }}
                className="rounded border border-rule px-2 py-1.5 text-left transition-colors duration-[120ms] ease-out hover:border-carmine hover:bg-inset disabled:opacity-50"
              >
                <span className="block font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-2">
                  {r.label}
                </span>
                <span className="block text-[12px] text-ink-3">{r.hint}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
            onClick={() => setConfirmRemove(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <p className="mt-3 border-t border-feint pt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
        Filed {fmtDateTz(row.acceptedAt, timezone)}
        {row.appliedAt ? ` · applied ${fmtDateShortTz(row.appliedAt, timezone)}` : ""}
      </p>
    </DossierPanel>
  );
}
