"use client";

import { OutlineVerb } from "@/components/register/stamp";

/**
 * PRINT DIGEST (spec A8).
 *
 * The Register aesthetic *is* print, and this is the cheapest possible proof
 * that the design is not a costume: the entire feature is `@media print` in
 * `globals.css` plus this button. No route, no PDF generator, no separate
 * layout, no dependency, no server work.
 *
 * `.no-print` is what removes the button from its own output — the stylesheet
 * hides the masthead, the footnote and every `.no-print` element, inverts the
 * instrument wells to white, and drops the carmine margin rule (screen
 * furniture). Everything left on the sheet is the docket itself.
 */
export function PrintButton() {
  return (
    <OutlineVerb
      className="no-print"
      onClick={() => window.print()}
      title="Print this page (Cmd/Ctrl+P does the same)"
    >
      Print digest
    </OutlineVerb>
  );
}
