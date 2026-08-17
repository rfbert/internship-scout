"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationStage, ReferralStage } from "@prisma/client";
import { Dossier as DossierFrame } from "@/components/register/dossier";
import { patchJson, postJson } from "@/lib/client-api";
import { isTypingTarget } from "@/lib/keys";
import { CaseHistory } from "./case-history";
import { DetailsForm } from "./details-form";
import { NextAction } from "./next-action";
import { Terms } from "./terms";
import type { RemovalReason } from "./meta";
import type { TrackerRow } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   THE PULLED RECORD

   `drawer.tsx` was 847 lines and a fixed right-hand overlay: opening a record
   covered the register you were reading it against. The dossier opens IN PLACE
   instead, under its own row and inside the ledger frame — same sheet, one
   record lifted. Four files carry what the drawer carried:

     case-history.tsx   the append-only spine
     terms.tsx          classification + the posting's own words + the roster
     next-action.tsx    the stage writes, the log, the withdrawal
     details-form.tsx   the eleven editable fields (collapsed by default)

   This file is the frame: the Escape handler and every API call, kept in one
   place so the panels stay presentational and the busy/error state cannot
   fork. No header bar — the focused row directly above already prints the
   accession, company, role, stage, priority and band, and repeating them
   inside the card is the kind of duplication the density argument exists to
   remove.

   ACCESSIBILITY NOTE — a deliberate, documented deviation from D7. The drawer
   was `role="dialog" aria-modal="true"`, and it earned that: it sat over a
   scrim and nothing behind it was reachable. This one is inline and the
   register behind it stays live, so `aria-modal="true"` would assert that the
   rest of the page is inert when it demonstrably is not. The dialog ROLE is
   kept (a non-modal dialog is a legal ARIA pattern), the accessible name is
   kept, and the Escape binding is kept verbatim; only the false claim is
   dropped.
   ══════════════════════════════════════════════════════════════════════════ */

interface DossierProps {
  row: TrackerRow;
  timezone: string;
  /** The server's clock, threaded through to the overdue test in NextAction. */
  now: string;
  onClose: () => void;
  onStageChange: (
    id: string,
    stage: ApplicationStage,
    note?: string,
    changedAt?: string
  ) => Promise<string | null>;
  onRemove: (id: string, reason: RemovalReason, company: string) => Promise<string | null>;
}

export function TrackerDossier(props: DossierProps) {
  // Keyed by application id: moving to another row remounts the body with
  // fresh local state instead of re-seeding it from an effect.
  return <DossierBody key={props.row.id} {...props} />;
}

function DossierBody({ row, timezone, now, onClose, onStageChange, onRemove }: DossierProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Focus moves into the panel when a record opens, and back to the row that
   * opened it when it closes. Without this, `E` announced nothing and the
   * reader had to Tab the entire register to reach the record they just
   * pulled — a dialog nobody can get to is not a dialog.
   */
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Captured here, not read in cleanup: by teardown the ref may already
    // point at a different node (or none).
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    return () => {
      // Only take focus back if it is still inside the panel; if the reader
      // has already clicked elsewhere, leave them where they are.
      if (opener?.isConnected && panel?.contains(document.activeElement)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [row.id]);

  // Escape closes the record (D1), but not out from under someone typing:
  // the details form holds a free-text next-action and a note, and closing
  // discards them. Escape inside a field is the field's to handle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isTypingTarget(e)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Run a write, surface the server's own message, refresh on success. */
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "The change could not be saved.");
      return false;
    }
    router.refresh();
    return true;
  };

  const changeStage = async (stage: ApplicationStage, note?: string, changedAt?: string) => {
    setError(null);
    setBusy(true);
    const failure = await onStageChange(row.id, stage, note, changedAt);
    setBusy(false);
    // The page banner scrolls out of reach once the register is long — show
    // the server's actual message (e.g. the backdate bound) right here.
    if (failure !== null) setError(failure);
    return failure;
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`Record ${row.accession} — ${row.companyName}, ${row.title}`}
    >
      <DossierFrame onClose={onClose}>
        {error ? (
          <p className="col-span-full border-b border-feint bg-inset px-4 py-1.5 text-[12px] text-carmine">
            <span className="mr-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">
              Error
            </span>
            {error}
          </p>
        ) : null}

        <CaseHistory accession={row.accession} history={row.history} timezone={timezone} />

        <Terms
          row={row}
          timezone={timezone}
          busy={busy}
          onAddContact={(form) =>
            run(() =>
              postJson("/api/contacts", {
                name: form.name.trim(),
                position: form.position,
                relationship: form.relationship,
                email: form.email,
                linkedinUrl: form.linkedinUrl,
                companyId: row.companyId,
                applicationId: row.id,
              })
            )
          }
          onTrackReferral={(contactId) => {
            void run(() => postJson("/api/referrals", { contactId, applicationId: row.id }));
          }}
          onReferralStage={(referralId, stage: ReferralStage) => {
            void run(() => patchJson(`/api/referrals/${referralId}`, { stage }));
          }}
        />

        <NextAction
          row={row}
          timezone={timezone}
          now={now}
          busy={busy}
          onStageChange={changeStage}
          onAddNote={(body) => run(() => postJson(`/api/applications/${row.id}/note`, { body }))}
          onRemove={(reason: RemovalReason) => {
            setBusy(true);
            setError(null);
            void onRemove(row.id, reason, row.companyName)
              .then((failure) => {
                // On success the page closes this record; on failure it is
                // still open and has to say what went wrong.
                if (failure !== null) setError(failure);
              })
              .finally(() => setBusy(false));
          }}
        />

        <DetailsForm
          row={row}
          timezone={timezone}
          busy={busy}
          onSave={(body) => run(() => patchJson(`/api/applications/${row.id}`, body))}
        />
      </DossierFrame>
    </div>
  );
}
