/**
 * A printed key. The Register prints the key where the eye rests, so the
 * shortcut is learned without a help page.
 *
 * DEFAULTS TO `aria-hidden` — this is load-bearing, not a preference.
 * `tests/e2e/smoke.spec.ts:35,37` matches the accept button by
 * `getByRole("button", { name: /^accept/i })`. Rendering `[A] ACCEPT → TRACKER`
 * with an announced `A` inside the button makes the accessible name start with
 * "A" and the test fails — as would any screen-reader user's mental model of
 * the button's name. Pass `aria="label"` only for a keycap that is itself the
 * whole control.
 */
export function Keycap({
  children,
  aria = "hidden",
}: {
  children: string;
  aria?: "hidden" | "label";
}) {
  return (
    <span
      {...(aria === "hidden"
        ? { "aria-hidden": true }
        : { "aria-label": `Key: ${children}` })}
      className="mx-px inline-block rounded border border-b-2 border-rule bg-surface px-1 py-px font-mono text-[10px] leading-none text-ink-2"
    >
      {children}
    </span>
  );
}
