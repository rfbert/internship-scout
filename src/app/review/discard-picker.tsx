"use client";

import { selectCls } from "@/components/ui";
import { DangerVerb, OutlineVerb } from "@/components/register/stamp";
import type { DiscardReasonOption } from "./types";

/**
 * The reason picker. One implementation, used by BOTH the worksheet's `DISCARD`
 * verb and the bulk bar — the two used to be separate copies of the same
 * `<select>` + confirm + cancel triplet.
 *
 * Keyboard note (D1): the global docket shortcuts ignore any event whose target
 * is an `INPUT` / `TEXTAREA` / `SELECT`, so arrowing through these options never
 * fires `d`, `a` or `s`. `autoFocus` reproduces the old row-level behavior —
 * pressing `d` puts the caret straight in the reason list.
 */
export function DiscardPicker({
  reasons,
  value,
  onChange,
  onConfirm,
  onCancel,
  disabled = false,
  autoFocus = false,
  confirmLabel = "Confirm strike",
}: {
  reasons: DiscardReasonOption[];
  value: string;
  onChange: (key: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** The bulk bar names its count; a single record just confirms. */
  confirmLabel?: string;
}) {
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        autoFocus={autoFocus}
        className={selectCls}
        aria-label="Reason for striking this record"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Reason…</option>
        {reasons.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      <DangerVerb disabled={disabled || !value} onClick={onConfirm}>
        {confirmLabel}
      </DangerVerb>
      <OutlineVerb disabled={disabled} onClick={onCancel}>
        Cancel
      </OutlineVerb>
    </span>
  );
}
