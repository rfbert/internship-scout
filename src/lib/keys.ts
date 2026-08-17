/**
 * Is this event coming from something the reader is typing into?
 *
 * One definition, because there were two: the review docket tested
 * `e.target.tagName`, the tracker tested `closest("… [contenteditable='true']")`.
 * The attribute selector misses the valid bare form (`<div contenteditable>`),
 * and `tagName` misses a control nested inside the event target. This checks
 * the composed path the way the DOM actually resolves it, and trusts
 * `isContentEditable`, which is true for every spelling.
 *
 * Applies to plain keystrokes AND to Escape: closing a panel out from under a
 * half-written note loses the note.
 */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const field = el.closest?.("input, textarea, select");
  if (field) return true;
  return Boolean(el.closest?.("[contenteditable]"));
}

/** A bare keystroke — no modifier held, not already handled by someone else. */
export function isBareKey(e: KeyboardEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey && !e.defaultPrevented;
}
