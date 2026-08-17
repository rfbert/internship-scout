"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls } from "@/components/ui";
import { patchJson } from "@/lib/client-api";

/**
 * The one editable field in the register: a company's priority score
 * (0–100, blank clears). Saves on blur or Enter via `PATCH /api/companies/[id]`
 * — unchanged behavior, Register clothes.
 *
 * It is built from `inputCls` (Tier 0) with the row's own metrics on top: mono
 * tabular numerals, right-aligned under a right-aligned column head, and the
 * padding tightened so the field sits INSIDE the 34px rule rather than filling
 * it edge to edge. A field that fills its row reads as a filled cell; a field
 * that sits inside one reads as a value you may overwrite.
 *
 * The failure state prints a word (`0–100`, `SAVE FAILED`) rather than turning
 * the border red and leaving you to guess (D3).
 */
export function PriorityInput({
  companyId,
  value,
}: {
  companyId: string;
  value: number | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const [saved, setSaved] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isInteger(next) || next < 0 || next > 100)) {
      setError("0–100");
      return;
    }
    setError(null);
    if (next === saved) return;
    setBusy(true);
    const res = await patchJson(`/api/companies/${companyId}`, { priorityScore: next });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Save failed");
      return;
    }
    setSaved(next);
    router.refresh();
  };

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {error ? (
        <span
          title={error}
          className="max-w-[84px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-carmine"
        >
          {error}
        </span>
      ) : null}
      <input
        type="number"
        min={0}
        max={100}
        inputMode="numeric"
        value={draft}
        disabled={busy}
        placeholder="—"
        aria-label="Priority score (0-100)"
        aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`${inputCls} w-[52px] px-1.5 py-[2px] text-right font-mono text-[11.5px] tabular-nums disabled:opacity-50 ${
          error ? "border-carmine" : ""
        }`}
      />
    </span>
  );
}
