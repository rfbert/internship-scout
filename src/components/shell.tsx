/**
 * THE MARGIN RULE — the Register's signature, and the one aesthetic risk.
 *
 * A carmine double rule runs the full height of every page, exactly where a
 * ledger's margin rule sits. It is also FUNCTIONAL: the margin is where the
 * keyboard caret lives, and the focused row hangs a carmine tab off it
 * (`tabAt`). A pulled record — dossier, worksheet — carries the same mark on
 * its own left edge, which is what says "this is a record lifted from this
 * ledger" rather than a modal from somewhere else.
 *
 * `aria-hidden` throughout: it is furniture, and the caret's real meaning is
 * carried by the focused row's `aria-selected` (see `LedgerRow`).
 * `.register-margin` is hidden by the print stylesheet — on paper the sheet
 * edge does the job (A8).
 *
 * The old `Sidebar` and `MobileNav` are GONE. The sidebar cost 224px of every
 * viewport for eleven links; the masthead carries them in 46px of height that
 * the page head needed anyway. Nav now lives in
 * `@/components/register/masthead`.
 */
export function MarginRule({
  tabAt,
  inset = false,
}: {
  /** Pixel offset from the top of the containing block for the caret tab. */
  tabAt?: number;
  /**
   * Draw the rule on a pulled card's own left edge (absolute, 3px in) instead
   * of the page margin (fixed, inside the 40px gutter).
   */
  inset?: boolean;
}) {
  if (inset) {
    return (
      <span
        aria-hidden
        className="register-margin pointer-events-none absolute inset-y-0 left-[3px] w-px bg-carmine opacity-90"
      />
    );
  }

  return (
    <div
      aria-hidden
      className="register-margin pointer-events-none fixed inset-y-0 left-[26px] z-30 w-[6px] border-x-[1.5px] border-carmine opacity-90"
    >
      {tabAt != null ? (
        <span
          className="absolute -left-[5px] h-[10px] w-[16px] bg-carmine"
          style={{ top: `${tabAt}px` }}
        />
      ) : null}
    </div>
  );
}
