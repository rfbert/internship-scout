"use client";

import { useState } from "react";
import { DossierPanel } from "@/components/register/dossier";
import { OutlineVerb } from "@/components/register/stamp";
import { inputCls, selectCls } from "@/components/ui";
import { dateOnlyToUtcNoon, dayKeyTz } from "@/lib/dates";
import { PRIORITY_LABELS, PRIORITY_ORDER } from "./meta";
import type { TrackerRow } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   DETAILS — the record's editable face.

   Eleven fields that used to occupy a third of an 847-line drawer. They ship
   COLLAPSED: the mock's three panels are what you read, and this is what you
   open when you have something to write. The PATCH body is unchanged
   field-for-field from `drawer.tsx` (D4) — including the `appliedAt` guard,
   which only sends the field when the user actually moved it, so opening the
   record can never silently rewrite an applied date.
   ══════════════════════════════════════════════════════════════════════════ */

export interface DetailsFormState {
  priority: TrackerRow["priority"];
  nextAction: string;
  followUpAt: string; // yyyy-mm-dd or ""
  appliedAt: string; // yyyy-mm-dd or ""
  recruiterName: string;
  hiringManagerName: string;
  contactEmail: string;
  contactLinkedin: string;
  referralStatus: string;
  finalOutcome: string;
  rejectionReason: string;
}

/**
 * Seed the date inputs from the same calendar day the dossier PRINTS above
 * them. The stored instant's UTC day and the browser's local day are both the
 * wrong lens; `dayKeyTz` is the day the user is actually looking at.
 */
export const initDetails = (row: TrackerRow, timezone: string): DetailsFormState => ({
  priority: row.priority,
  nextAction: row.nextAction ?? "",
  followUpAt: dayKeyTz(row.followUpAt, timezone),
  appliedAt: dayKeyTz(row.appliedAt, timezone),
  recruiterName: row.recruiterName ?? "",
  hiringManagerName: row.hiringManagerName ?? "",
  contactEmail: row.contactEmail ?? "",
  contactLinkedin: row.contactLinkedin ?? "",
  referralStatus: row.referralStatus ?? "",
  finalOutcome: row.finalOutcome ?? "",
  rejectionReason: row.rejectionReason ?? "",
});

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
        {label}
      </span>
      <input
        className={`${inputCls} w-full`}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function DetailsForm({
  row,
  timezone,
  busy,
  onSave,
}: {
  row: TrackerRow;
  timezone: string;
  busy: boolean;
  /** PATCHes the body and refreshes; resolves false if the server refused. */
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DetailsFormState>(() => initDetails(row, timezone));
  const set = (key: keyof DetailsFormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () =>
    onSave({
      priority: form.priority,
      nextAction: form.nextAction.trim() || null,
      // followUpAt / appliedAt are `<input type="date">` values — a calendar
      // day, not a moment — so they round-trip through noon UTC (@/lib/dates).
      followUpAt: dateOnlyToUtcNoon(form.followUpAt)?.toISOString() ?? null,
      ...(form.appliedAt !== initDetails(row, timezone).appliedAt
        ? { appliedAt: dateOnlyToUtcNoon(form.appliedAt)?.toISOString() ?? null }
        : {}),
      recruiterName: form.recruiterName.trim() || null,
      hiringManagerName: form.hiringManagerName.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      contactLinkedin: form.contactLinkedin.trim() || null,
      referralStatus: form.referralStatus.trim() || null,
      finalOutcome: form.finalOutcome.trim() || null,
      rejectionReason: form.rejectionReason.trim() || null,
    });

  return (
    <DossierPanel full>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-3 underline-offset-2 transition-colors duration-[120ms] ease-out hover:text-ink hover:underline"
      >
        {open ? "−" : "+"} Details · priority, dates, contacts, outcome
      </button>

      {open ? (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4">
            <label className="block min-w-0">
              <span className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
                Priority
              </span>
              <select
                className={`${selectCls} w-full`}
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value as TrackerRow["priority"] }))
                }
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Follow-up date"
              type="date"
              value={form.followUpAt}
              onChange={set("followUpAt")}
            />
            <Field label="Applied on" type="date" value={form.appliedAt} onChange={set("appliedAt")} />
            <Field
              label="Next action"
              className="col-span-2"
              value={form.nextAction}
              onChange={set("nextAction")}
              placeholder="e.g. Prep for recruiter screen"
            />
            <Field label="Recruiter" value={form.recruiterName} onChange={set("recruiterName")} />
            <Field
              label="Hiring manager"
              value={form.hiringManagerName}
              onChange={set("hiringManagerName")}
            />
            <Field label="Contact email" value={form.contactEmail} onChange={set("contactEmail")} />
            <Field
              label="Contact LinkedIn"
              value={form.contactLinkedin}
              onChange={set("contactLinkedin")}
            />
            <Field
              label="Referral status"
              value={form.referralStatus}
              onChange={set("referralStatus")}
              placeholder="e.g. asked alum for referral"
            />
            <Field label="Final outcome" value={form.finalOutcome} onChange={set("finalOutcome")} />
            <Field
              label="Rejection reason"
              className="col-span-2"
              value={form.rejectionReason}
              onChange={set("rejectionReason")}
            />
          </div>
          <div className="mt-2.5">
            <OutlineVerb disabled={busy} onClick={() => void save()}>
              Save details
            </OutlineVerb>
          </div>
        </div>
      ) : null}
    </DossierPanel>
  );
}
