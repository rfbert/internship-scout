"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DeadlineKind } from "@prisma/client";
import { Field, btnPrimary, inputCls, selectCls } from "@/components/ui";
import { DEADLINE_KIND_LABELS } from "@/lib/format";
import { ESTIMATED_GLOSS_PARTS } from "@/lib/notation";
import { postJson } from "@/lib/client-api";

export type LinkOption = { id: string; label: string };

/**
 * Add-deadline worksheet. Linking to a listing and an application is mutually
 * exclusive — choosing one clears the other.
 *
 * Restyled only: the request body, the date contract, the validation messages
 * and the mutual-exclusion rule are all byte-for-byte what they were (D4). The
 * submit control stays a real `type="submit"` button carrying `btnPrimary` (the
 * Tier-0 ink stamp) rather than the `Stamp` primitive, which renders
 * `type="button"` and would silently stop submitting the form.
 */
export function DeadlineForm({
  listingOptions,
  applicationOptions,
}: {
  listingOptions: LinkOption[];
  applicationOptions: LinkOption[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<DeadlineKind>("APPLICATION_DEADLINE");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [isEstimated, setIsEstimated] = useState(false);
  const [listingId, setListingId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) {
      setError("Title and date are required.");
      return;
    }
    // Send the bare "YYYY-MM-DD" the picker produced; the API anchors it at
    // noon UTC (see src/lib/dates.ts). Converting here instead would bake in
    // the *browser's* zone, so a date picked from a different zone than the
    // saved preference would render and bucket a day off.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Enter the due date as YYYY-MM-DD, e.g. 2027-01-15.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson("/api/deadlines", {
      kind,
      title: title.trim(),
      dueAt: date,
      isEstimated,
      ...(listingId ? { listingId } : {}),
      ...(applicationId ? { applicationId } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Not added — the deadline is still in the form. Try again.");
      return;
    }
    setTitle("");
    setDate("");
    setIsEstimated(false);
    setListingId("");
    setApplicationId("");
    router.refresh();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="px-3.5 py-3">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as DeadlineKind)}
            className={`${selectCls} w-full`}
          >
            {(Object.keys(DEADLINE_KIND_LABELS) as DeadlineKind[]).map((k) => (
              <option key={k} value={k}>
                {DEADLINE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Figma PM intern — apply"
            className={`${inputCls} w-full`}
          />
        </Field>

        <Field label="Due date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputCls} w-full font-mono text-[12px]`}
          />
        </Field>

        <Field label="Link to listing (optional)">
          <select
            value={listingId}
            onChange={(e) => {
              setListingId(e.target.value);
              if (e.target.value) setApplicationId("");
            }}
            className={`${selectCls} w-full`}
          >
            <option value="">— none —</option>
            {listingOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Link to application (optional)">
          <select
            value={applicationId}
            onChange={(e) => {
              setApplicationId(e.target.value);
              if (e.target.value) setListingId("");
            }}
            className={`${selectCls} w-full`}
          >
            <option value="">— none —</option>
            {applicationOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-end gap-2 pb-1.5">
          <input
            type="checkbox"
            checked={isEstimated}
            onChange={(e) => setIsEstimated(e.target.checked)}
            className="size-[13px] cursor-pointer rounded-none accent-ink"
          />
          {/* The certainty stroke, shown as its own legend: whatever this box
              marks will print with `~` and a dashed underline everywhere. The
              wording is `ESTIMATED_GLOSS`, which every other legend and tooltip
              in the app also prints — this line is where it came from. */}
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ochre">
            <span className="register-estimated">~ {ESTIMATED_GLOSS_PARTS[0]}</span> —{" "}
            {ESTIMATED_GLOSS_PARTS[1]}
          </span>
        </label>
      </div>

      <div className="mt-3.5 flex items-center gap-3 border-t border-feint pt-3">
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Adding…" : "Add deadline"}
        </button>
        {error ? (
          <span className="font-mono text-[11px] text-carmine" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
