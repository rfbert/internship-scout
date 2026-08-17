"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, btnPrimary, inputCls } from "@/components/ui";
import { patchJson } from "@/lib/client-api";

type Overview = {
  priorityScore: number | null;
  industry: string | null;
  sizeRange: string | null;
  stage: string | null;
  reputationNote: string | null;
  aiRelevance: string | null;
  internshipProgramNote: string | null;
};

const textareaCls = `${inputCls} min-h-16 w-full resize-y`;

/**
 * The examiner's assessment — the right-hand panel of the company dossier,
 * facing the leader-dot "Terms of the record" list.
 *
 * Restyled only: the PATCH body, the 0–100 validation and the trim-to-null
 * rule are byte-for-byte what they were. Two structural notes. The form no
 * longer sets its own `px-4 py-4` — it sits inside a `DossierPanel`, which
 * already pads, and the two paddings were stacking to 32px of gutter against
 * a 16px one on the panel opposite. And the submit control stays a real
 * `type="submit"` button carrying `btnPrimary` rather than the `Stamp`
 * primitive, which renders `type="button"` and would silently stop saving.
 */
export function OverviewForm({
  companyId,
  initial,
}: {
  companyId: string;
  initial: Overview;
}) {
  const router = useRouter();
  const [priority, setPriority] = useState(
    initial.priorityScore == null ? "" : String(initial.priorityScore)
  );
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [sizeRange, setSizeRange] = useState(initial.sizeRange ?? "");
  const [stage, setStage] = useState(initial.stage ?? "");
  const [reputationNote, setReputationNote] = useState(initial.reputationNote ?? "");
  const [aiRelevance, setAiRelevance] = useState(initial.aiRelevance ?? "");
  const [programNote, setProgramNote] = useState(initial.internshipProgramNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = priority.trim();
    const priorityScore = trimmed === "" ? null : Number(trimmed);
    if (
      priorityScore !== null &&
      (!Number.isInteger(priorityScore) || priorityScore < 0 || priorityScore > 100)
    ) {
      setError("Priority score must be a whole number between 0 and 100.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await patchJson(`/api/companies/${companyId}`, {
      priorityScore,
      industry: industry.trim() || null,
      sizeRange: sizeRange.trim() || null,
      stage: stage.trim() || null,
      reputationNote: reputationNote.trim() || null,
      aiRelevance: aiRelevance.trim() || null,
      internshipProgramNote: programNote.trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  };

  return (
    <form onSubmit={(e) => void save(e)}>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="Priority" hint="0–100 · feeds company quality">
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            placeholder="—"
            className={`${inputCls} w-full font-mono text-[12px] tabular-nums`}
          />
        </Field>
        <Field label="Industry">
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Developer tools"
            className={`${inputCls} w-full`}
          />
        </Field>
        <Field label="Size range">
          <input
            value={sizeRange}
            onChange={(e) => setSizeRange(e.target.value)}
            placeholder="e.g. 1000-5000"
            className={`${inputCls} w-full`}
          />
        </Field>
        <Field label="Stage">
          <input
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            placeholder="e.g. Series C, Public"
            className={`${inputCls} w-full`}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-x-4 gap-y-3">
        <Field label="Reputation note">
          <textarea
            value={reputationNote}
            onChange={(e) => setReputationNote(e.target.value)}
            placeholder="Reputation, culture, engineering brand…"
            className={textareaCls}
          />
        </Field>
        <Field label="AI relevance">
          <textarea
            value={aiRelevance}
            onChange={(e) => setAiRelevance(e.target.value)}
            placeholder="How central is AI to this company's product and strategy?"
            className={textareaCls}
          />
        </Field>
        <Field label="Internship program">
          <textarea
            value={programNote}
            onChange={(e) => setProgramNote(e.target.value)}
            placeholder="Program structure, return-offer rates, past intern experiences…"
            className={textareaCls}
          />
        </Field>
      </div>

      <div className="mt-3.5 flex items-center gap-3 border-t border-feint pt-3">
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Saving…" : "Save assessment"}
        </button>
        {savedAt && !busy && !error ? (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-green">
            Saved
          </span>
        ) : null}
        {error ? (
          <span className="font-mono text-[11px] text-carmine" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
