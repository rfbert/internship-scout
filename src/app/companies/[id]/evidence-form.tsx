"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EvidenceKind, EvidenceReliability } from "@prisma/client";
import { Field, btnPrimary, eyebrowCls, inputCls, selectCls } from "@/components/ui";
import { postJson } from "@/lib/client-api";
import { EVIDENCE_KIND_LABELS, RELIABILITY_LABELS } from "../meta";

/**
 * Add-evidence worksheet, at the foot of the sponsorship evidence file.
 *
 * Restyled, plus one real fix: the evidence date is a CALENDAR date, and this
 * form used to convert it with `new Date("YYYY-MM-DDT12:00:00")` — noon in the
 * *browser's* zone, while the page renders in the saved *preference* zone. A
 * date entered from a browser east of the preference zone could therefore
 * print a day off from the day that was typed. It now posts the bare
 * "YYYY-MM-DD" and lets the API anchor it at noon UTC, exactly as the calendar
 * form and every other date-only field in the app do (see src/lib/dates.ts).
 */
export function EvidenceForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<EvidenceKind>("H1B_FILINGS");
  const [reliability, setReliability] = useState<EvidenceReliability>("MODERATE");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [evidenceDate, setEvidenceDate] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName.trim() || !summary.trim()) {
      setError("Source name and summary are required.");
      return;
    }
    if (evidenceDate && !/^\d{4}-\d{2}-\d{2}$/.test(evidenceDate)) {
      setError("Enter the date as YYYY-MM-DD, e.g. 2026-03-01 — or leave it empty.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson(`/api/companies/${companyId}/evidence`, {
      kind,
      reliability,
      sourceName: sourceName.trim(),
      ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
      ...(evidenceDate ? { evidenceDate } : {}),
      summary: summary.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSourceName("");
    setSourceUrl("");
    setEvidenceDate("");
    setSummary("");
    router.refresh();
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="border-t border-rule px-3.5 py-3"
    >
      <p className={`${eyebrowCls} mb-2.5`}>Add evidence</p>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as EvidenceKind)}
            className={`${selectCls} w-full`}
          >
            {(Object.keys(EVIDENCE_KIND_LABELS) as EvidenceKind[]).map((k) => (
              <option key={k} value={k}>
                {EVIDENCE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Reliability">
          <select
            value={reliability}
            onChange={(e) => setReliability(e.target.value as EvidenceReliability)}
            className={`${selectCls} w-full`}
          >
            {(Object.keys(RELIABILITY_LABELS) as EvidenceReliability[]).map((r) => (
              <option key={r} value={r}>
                {RELIABILITY_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Date (optional)">
          <input
            type="date"
            value={evidenceDate}
            onChange={(e) => setEvidenceDate(e.target.value)}
            className={`${inputCls} w-full font-mono text-[12px]`}
          />
        </Field>

        <Field label="Source name">
          <input
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="e.g. USCIS H-1B disclosure data"
            className={`${inputCls} w-full`}
          />
        </Field>

        <Field label="Source URL (optional)" className="lg:col-span-2">
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            className={`${inputCls} w-full`}
          />
        </Field>

        <Field label="Summary" className="sm:col-span-2 lg:col-span-3">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What does this evidence show, and for which visa pathway?"
            className={`${inputCls} min-h-14 w-full resize-y`}
          />
        </Field>
      </div>

      <div className="mt-3.5 flex items-center gap-3 border-t border-feint pt-3">
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Adding…" : "Add evidence"}
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
