"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, btnPrimary, inputCls } from "@/components/ui";
import { postJson } from "@/lib/client-api";

/**
 * The examiner's own note, written straight into the top of the notes file.
 * Restyled only — same endpoint, same trim, same disabled-while-empty rule.
 */
export function NoteForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const res = await postJson(`/api/companies/${companyId}/note`, { body: body.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setBody("");
    router.refresh();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="px-3.5 py-3">
      <Field label="New note">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Recruiter conversations, program research, anything worth remembering…"
          className={`${inputCls} min-h-14 w-full resize-y`}
        />
      </Field>
      <div className="mt-3 flex items-center gap-3 border-t border-feint pt-3">
        <button type="submit" className={btnPrimary} disabled={busy || !body.trim()}>
          {busy ? "Adding…" : "Add note"}
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
