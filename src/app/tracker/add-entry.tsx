"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, inputCls } from "@/components/ui";
import { OutlineVerb, Stamp } from "@/components/register/stamp";
import { postJson } from "@/lib/client-api";
import { isTypingTarget } from "@/lib/keys";

/**
 * "+ NEW RECORD" — an entry made by hand. It goes straight into the register
 * with `origin: MANUAL`, which exempts it from automated rescoring and
 * auto-rejection.
 *
 * The panel heading used to read "manual accession". `accession` is a real
 * word in this app — it is the permanent `A-0217` number a record carries —
 * but nothing on this screen teaches it, and the reader here is filing their
 * first record.
 *
 * The lucide `Plus` / `X` icons are gone (B5): the Register's marks are
 * notation, so the verb prints `+` in the mono face and the close control is a
 * mono `×`.
 */

const fieldLabel =
  "mb-1 block font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3";

export function AddEntry() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [postingUrl, setPostingUrl] = useState("");
  const [locationRaw, setLocationRaw] = useState("");
  const [deadline, setDeadline] = useState("");
  const [deadlineIsEstimated, setDeadlineIsEstimated] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Not while typing: this panel is all text fields, and closing loses them.
      if (e.key !== "Escape" || isTypingTarget(e)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const reset = () => {
    setCompanyName(""); setTitle(""); setPostingUrl(""); setLocationRaw("");
    setDeadline(""); setDeadlineIsEstimated(false); setNote(""); setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await postJson("/api/import/manual", {
      companyName: companyName.trim(),
      title: title.trim(),
      postingUrl: postingUrl.trim(),
      locationRaw: locationRaw.trim(),
      // Local-noon so the calendar day survives UTC round-trips (repo convention).
      ...(deadline
        ? { deadline: new Date(`${deadline}T12:00:00`).toISOString(), deadlineIsEstimated }
        : {}),
      note: note.trim(),
      track: true,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "The entry could not be saved.");
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return <Stamp onClick={() => setOpen(true)}><span aria-hidden>+</span> New record</Stamp>;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/25 p-4 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label="New record"
    >
      <div className="w-full max-w-lg rounded border border-rule border-l-carmine bg-surface shadow-[var(--shadow-pulled)]">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
          <h2 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-2">
            New record · entered by hand
          </h2>
          <button
            type="button"
            className="font-mono text-[13px] leading-none text-ink-3 hover:text-ink"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          <p className="mb-3 text-[12.5px] text-ink-3">
            Your own entries go straight to the register and are never rescored or
            auto-rejected by the daily agent.
          </p>
          <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={fieldLabel} htmlFor="add-company">Company *</label>
              <input id="add-company" className={`${inputCls} w-full`} required maxLength={200} autoFocus
                value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="add-title">Role title *</label>
              <input id="add-title" className={`${inputCls} w-full`} required maxLength={300}
                value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabel} htmlFor="add-url">Posting URL (optional)</label>
              <input id="add-url" className={`${inputCls} w-full`} type="url" placeholder="https://…"
                value={postingUrl} onChange={(e) => setPostingUrl(e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="add-location">Location (optional)</label>
              <input id="add-location" className={`${inputCls} w-full`} maxLength={300} placeholder="Remote / City, ST"
                value={locationRaw} onChange={(e) => setLocationRaw(e.target.value)} />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="add-deadline">Application deadline</label>
              <div className="flex items-center gap-2">
                <input id="add-deadline" className={`${inputCls} w-full`} type="date"
                  value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                {/* The certainty stroke starts at the keyboard: tick this and the
                    date prints `~` with a dashed underline everywhere after. */}
                <label className="flex shrink-0 cursor-pointer items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  <input type="checkbox" className="size-3.5 accent-[var(--carmine)]"
                    checked={deadlineIsEstimated} onChange={(e) => setDeadlineIsEstimated(e.target.checked)} />
                  <span aria-hidden>~</span> Estimate
                </label>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabel} htmlFor="add-note">Notes</label>
              <textarea id="add-note" className={`${inputCls} min-h-20 w-full`} maxLength={5000}
                placeholder="Referral contact, why it's interesting, next step…"
                value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {error ? (
              <p className="rounded border border-carmine bg-inset px-3 py-2 text-[12.5px] text-carmine sm:col-span-2">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-1.5 sm:col-span-2">
              <OutlineVerb onClick={() => setOpen(false)}>Cancel</OutlineVerb>
              {/* A real submit button, so Enter in any field files the record —
                  `Stamp` renders type="button" and would swallow that. */}
              <button
                type="submit"
                className={btnPrimary}
                disabled={saving || !companyName.trim() || !title.trim()}
              >
                {saving ? "Saving…" : "File record"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
