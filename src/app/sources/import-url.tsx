"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-api";
import { btn, btnPrimary, inputCls } from "@/components/ui";

interface FormState {
  companyName: string;
  title: string;
  locationRaw: string;
  postingUrl: string;
  applyUrl: string;
  description: string;
  compensationText: string;
  deadline: string;
  deadlineIsEstimated: boolean;
}

const EMPTY_FORM: FormState = {
  companyName: "",
  title: "",
  locationRaw: "",
  postingUrl: "",
  applyUrl: "",
  description: "",
  compensationText: "",
  deadline: "",
  deadlineIsEstimated: false,
};

export function ImportUrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"url" | "form" | "done">("url");
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function fetchUrl() {
    if (!url.trim()) return;
    setFetching(true);
    setError(null);
    setFetchNote(null);
    const res = await postJson<{
      fetched: boolean;
      suggested: { title: string; companyName: string; description?: string; postingUrl: string };
    }>("/api/import/url", { url: url.trim() });
    setFetching(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const s = res.data.suggested;
    setForm({
      ...EMPTY_FORM,
      companyName: s.companyName,
      title: s.title,
      description: s.description ?? "",
      postingUrl: s.postingUrl,
    });
    setFetchNote(
      res.data.fetched
        ? "Fields prefilled from the page — review and correct them before importing."
        : "Couldn't fetch the page (many job sites block non-browser clients). Fill the fields by hand."
    );
    setStep("form");
  }

  function startManually() {
    setError(null);
    setFetchNote(null);
    setForm({ ...EMPTY_FORM, postingUrl: url.trim() });
    setStep("form");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const body: Record<string, unknown> = {
      companyName: form.companyName.trim(),
      title: form.title.trim(),
      locationRaw: form.locationRaw.trim(),
      postingUrl: form.postingUrl.trim(),
    };
    if (form.applyUrl.trim()) body.applyUrl = form.applyUrl.trim();
    if (form.description.trim()) body.description = form.description.trim();
    if (form.compensationText.trim()) body.compensationText = form.compensationText.trim();
    if (form.deadline) {
      body.deadline = form.deadline;
      body.deadlineIsEstimated = form.deadlineIsEstimated;
    }
    const res = await postJson("/api/import/manual", body);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep("done");
    router.refresh();
  }

  function reset() {
    setUrl("");
    setForm(EMPTY_FORM);
    setError(null);
    setFetchNote(null);
    setStep("url");
  }

  if (step === "done") {
    return (
      <div className="px-4 py-4">
        {/* NOT "the same analysis as automated finds". `api/import/ingest.ts`
            runs the same engines but downgrades every hard rejection to a
            warning note, because these are your own entries — which is the
            whole reason to import one by hand. Saying the two paths are the
            same hid the one difference that matters. */}
        <p className="text-sm text-green">
          Imported — scored and assessed like an automated find, but never rejected on your behalf.
          Anything the rules would have dropped is kept, with the reason noted on the record.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Link href="/review" className={btnPrimary}>
            Open the review queue
          </Link>
          <button type="button" className={btn} onClick={reset}>
            Import another
          </button>
        </div>
        {/* The listing's cuid used to print here. It is a database key: the
            reader cannot search on it, the register never shows it, and no
            support channel exists to quote it to. The link above is the thing
            they actually want. */}
      </div>
    );
  }

  if (step === "url") {
    return (
      <div className="px-4 py-4">
        <p className="text-xs text-ink-3">
          Paste a posting URL (LinkedIn, Indeed, Wellfound, Built In, RippleMatch, a careers page…).
          The page is fetched once to prefill the form — nothing is saved until you confirm.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void fetchUrl();
              }
            }}
            placeholder="https://…"
            className={`${inputCls} w-full max-w-md`}
            aria-label="Posting URL"
          />
          <button
            type="button"
            className={btnPrimary}
            disabled={fetching || !url.trim()}
            onClick={fetchUrl}
          >
            {fetching ? "Fetching…" : "Fetch details"}
          </button>
          <button type="button" className={btn} onClick={startManually}>
            Enter details manually
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-carmine">{error}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="px-4 py-4">
      {fetchNote ? <p className="mb-3 text-xs text-ink-3">{fetchNote}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company *">
          <input
            required
            value={form.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            className={`${inputCls} w-full`}
          />
        </Field>
        <Field label="Title *">
          <input
            required
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={`${inputCls} w-full`}
          />
        </Field>
        <Field label="Location *">
          <input
            required
            value={form.locationRaw}
            onChange={(e) => set("locationRaw", e.target.value)}
            placeholder="San Francisco, CA · Remote (US)"
            className={`${inputCls} w-full`}
          />
        </Field>
        <Field label="Posting URL *">
          <input
            required
            type="url"
            value={form.postingUrl}
            onChange={(e) => set("postingUrl", e.target.value)}
            className={`${inputCls} w-full`}
          />
        </Field>
        <Field label="Apply URL">
          <input
            type="url"
            value={form.applyUrl}
            onChange={(e) => set("applyUrl", e.target.value)}
            className={`${inputCls} w-full`}
          />
        </Field>
        <Field label="Compensation (verbatim)">
          <input
            value={form.compensationText}
            onChange={(e) => set("compensationText", e.target.value)}
            placeholder="$45–55/hr"
            className={`${inputCls} w-full`}
          />
        </Field>
        <Field label="Application deadline">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => set("deadline", e.target.value)}
              className={inputCls}
            />
            <label className="flex items-center gap-1.5 text-xs text-ink-3">
              <input
                type="checkbox"
                checked={form.deadlineIsEstimated}
                onChange={(e) => set("deadlineIsEstimated", e.target.checked)}
                disabled={!form.deadline}
              />
              This is an estimate, not confirmed by the posting
            </label>
          </div>
        </Field>
      </div>
      <Field label="Description" className="mt-3">
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={5}
          className={`${inputCls} w-full`}
        />
      </Field>
      {error ? <p className="mt-3 text-xs text-carmine">{error}</p> : null}
      <div className="mt-4 flex items-center gap-2">
        <button type="submit" className={btnPrimary} disabled={submitting}>
          {submitting ? "Importing…" : "Import listing"}
        </button>
        <button type="button" className={btn} onClick={reset} disabled={submitting}>
          Start over
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}
