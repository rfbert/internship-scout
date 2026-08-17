import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* ── Why this test reads source text instead of importing the constant ─────
   The number under test is `MIN_WIDTH` in src/app/opportunities/page.tsx. That
   module is an async Server Component: it imports the Prisma client at module
   scope (and the local .env points at production), pulls in half a dozen .tsx
   component trees, and exports nothing that carries the guarantee — only
   `dynamic` and the page component itself. Importing it to read one integer
   would drag all of that into a `node`-environment unit test for no gain.

   The declarations are one-line literals with a fixed shape, so a regex over
   the source is a faithful and much cheaper read of the same fact. If a width
   ever stops being a plain literal, the extractor throws rather than silently
   passing — see the guard in `ledgerMinWidth`. */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const OPPORTUNITIES = "src/app/opportunities/page.tsx";

/** Reads a `const <name> = <integer>` ledger width out of a page's source. */
function ledgerMinWidth(rel: string, name = "MIN_WIDTH"): number {
  const match = new RegExp(`\\b${name}\\s*=\\s*(\\d+)\\s*;`).exec(source(rel));
  if (!match) {
    throw new Error(
      `${rel} no longer declares ${name} as a plain integer literal. ` +
        `Rewrite this extractor against the new shape — do not delete the pin.`
    );
  }
  return Number(match[1]);
}

/* The reference viewport is a 1440px laptop, the narrowest common width the
   register is designed to sit inside without moving. The page gutter leaves
   about 1350px of content there, which is the real ceiling: a ledger wider
   than its container makes the PAGE scroll sideways, and a horizontally
   scrolling page moves the nav and the column heads out from under the reader.
   A ledger narrower than its container just scrolls inside its own frame,
   which is the designed behaviour. */
const REFERENCE_VIEWPORT = 1440;
const CONTENT_AT_REFERENCE = 1350;

describe("the /opportunities ledger's minimum width", () => {
  // Pinned to the exact value, not just to the ceiling. Lowering it further is
  // a legitimate change — but it should be a decided one, so it edits this
  // line too. Raising it is the regression: this constant was 1440, which is
  // the full viewport with no allowance for the gutter at all, and the page
  // scrolled sideways at every common laptop width because of it.
  it("is 1340, the value chosen to stop the page scrolling sideways", () => {
    expect(ledgerMinWidth(OPPORTUNITIES)).toBe(1340);
  });

  it("fits inside the content box of a 1440px laptop", () => {
    const width = ledgerMinWidth(OPPORTUNITIES);
    expect(width).toBeLessThanOrEqual(CONTENT_AT_REFERENCE);
    expect(width).toBeLessThan(REFERENCE_VIEWPORT);
  });

  // Pinning a number that nothing reads would be a test of a comment. The
  // constant has to still reach the component that applies it.
  it("is the width actually handed to the ledger", () => {
    expect(source(OPPORTUNITIES)).toContain("minWidth={MIN_WIDTH}");
  });
});

/* The constant's own comment says every other ledger sits at or below this one
   and to keep it that way — /opportunities is the widest instrument in the app
   and therefore the ceiling for all of them. That is only enforceable if the
   other pages are checked against it, so they are. */
describe("every other ledger in the app", () => {
  /** name · where the constant is declared · its name · where it is applied. */
  type Pin = { name: string; declaredIn: string; constant: string; appliedIn?: string };

  const OTHERS: Pin[] = [
    { name: "archive", declaredIn: "src/app/archive/page.tsx", constant: "MIN_WIDTH" },
    {
      name: "review docket",
      // The docket's columns and its floor belong to the ROW module, but the
      // shell is what renders the `Ledger` — so this is the one pin whose
      // declaration and application are in different files.
      declaredIn: "src/app/review/queue-row.tsx",
      constant: "QUEUE_MIN_WIDTH",
      appliedIn: "src/app/review/review-list.tsx",
    },
    { name: "companies", declaredIn: "src/app/companies/page.tsx", constant: "MIN_WIDTH" },
    { name: "sources", declaredIn: "src/app/sources/sources-table.tsx", constant: "MIN_WIDTH" },
    // The dispatch book. It shipped with `minWidth={1180}` written inline,
    // which put the newest ledger in the app outside the only check that keeps
    // these numbers agreeing — `ledgerMinWidth` can only read a NAMED integer.
    { name: "reports", declaredIn: "src/app/reports/page.tsx", constant: "MIN_WIDTH" },
  ];

  it("sits at or below the /opportunities width", () => {
    const ceiling = ledgerMinWidth(OPPORTUNITIES);
    for (const { name, declaredIn, constant } of OTHERS) {
      expect(ledgerMinWidth(declaredIn, constant), name).toBeLessThanOrEqual(ceiling);
    }
  });

  it("also fits the reference laptop", () => {
    for (const { name, declaredIn, constant } of OTHERS) {
      expect(ledgerMinWidth(declaredIn, constant), name).toBeLessThanOrEqual(CONTENT_AT_REFERENCE);
    }
  });

  /* Extracting a constant the page then ignores would pin a number nothing
     reads — the same test of a comment the /opportunities block warns about.
     Every entry above has to reach a real ledger. This is also what stops a
     future page from slipping back out of the pin the way /reports did: naming
     the constant is not enough, it has to be the one in the JSX. */
  it("hands its constant to the ledger it governs", () => {
    for (const { name, declaredIn, constant, appliedIn } of OTHERS) {
      expect(source(appliedIn ?? declaredIn), name).toContain(`minWidth={${constant}}`);
    }
  });
});
