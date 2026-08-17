"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteJson, patchJson } from "@/lib/client-api";

/*
 * The two inline verbs of the diary. Both keep their exact request shapes —
 * PATCH /api/deadlines/[id] with `completedAt`, DELETE /api/deadlines/[id] —
 * and their exact accessible names. Only the marks changed (D4).
 *
 * Both go through the shared client helpers, which collapse a transport failure
 * and an `{ ok: false }` answer into the one branch each verb already had.
 */

/**
 * The docket's square checkbox — the `☐` / `☑` of the dashboard mock.
 *
 * Still a native `<input type="checkbox">`: it is the whole keyboard and
 * screen-reader contract of this row, and `accent-color` gets the filled ink
 * box with its check without replacing the control. `rounded-none` squares off
 * the browser default; index cards have corners.
 */
export function CompleteCheckbox({
  deadlineId,
  completed,
  title,
}: {
  deadlineId: string;
  completed: boolean;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async (checked: boolean) => {
    setBusy(true);
    const res = await patchJson(`/api/deadlines/${deadlineId}`, {
      completedAt: checked ? new Date().toISOString() : null,
    });
    setBusy(false);
    // A failure stays silent — a checkbox has nowhere to print one, and the
    // refresh on the next navigation restores server truth anyway.
    if (res.ok) router.refresh();
  };

  return (
    <input
      type="checkbox"
      checked={completed}
      disabled={busy}
      aria-label={completed ? `Reopen "${title}"` : `Mark "${title}" complete`}
      onChange={(e) => void toggle(e.target.checked)}
      className="size-[13px] shrink-0 cursor-pointer rounded-none accent-ink disabled:opacity-50"
    />
  );
}

/**
 * Strike a deadline from the register.
 *
 * The lucide `Trash2` is gone (B5 — the Register's marks are notation, not
 * pictograms), and so is the full-width multiplication glyph; this is a
 * mono `\u00d7`. Quiet until
 * hovered or focused, because a destructive verb that shouts on every one of
 * forty rows is forty invitations to misclick.
 */
export function DeleteDeadlineButton({
  deadlineId,
  title,
}: {
  deadlineId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(false);
    const res = await deleteJson(`/api/deadlines/${deadlineId}`);
    setBusy(false);
    if (!res.ok) {
      setError(true);
      return;
    }
    router.refresh();
  };

  /* A FAILURE HAS NOWHERE TO STAND HERE, so it stands in the button.
     This cell is the tail of a 128px column that is already holding the
     countdown (`T−12d`, `Overdue 12d`), which leaves about nine characters —
     less than any sentence that says what happened AND what to do. The old
     answer was a separate "Failed", which fit and said only half of it: the
     reader was told the delete had failed and left to guess whether pressing
     × again was safe.
     So the button becomes the message. It prints the verb the reader needs,
     and its accessible name and tooltip carry the half that will not fit. */
  return (
    <span className="inline-flex items-center justify-end gap-1">
      <button
        type="button"
        className={`inline-flex h-[19px] items-center justify-center rounded border font-mono leading-none transition-colors duration-[120ms] ease-out disabled:pointer-events-none disabled:opacity-50 ${
          error
            ? "border-carmine px-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-carmine"
            : "w-[19px] border-transparent text-[13px] text-ink-3 hover:border-carmine hover:text-carmine"
        }`}
        disabled={busy}
        aria-label={
          error
            ? `Deleting "${title}" failed — try again`
            : `Delete deadline "${title}"`
        }
        title={error ? "Deleting failed — try again" : "Delete deadline"}
        onClick={() => void remove()}
      >
        {error ? "Retry" : <span aria-hidden>×</span>}
      </button>
    </span>
  );
}
