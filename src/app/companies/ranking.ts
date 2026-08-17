/**
 * The order of the register of correspondents.
 *
 * Pure and Prisma-free so the rule can be read and tested on its own — the
 * page that applies it is an async Server Component that imports the client at
 * module scope. Unit-tested in tests/unit/companies-ranking.test.ts.
 */

export interface RankedCompany {
  /** A seeded demo record from `prisma/seed.ts`, not a real correspondent. */
  isSample: boolean;
  /** The user's own 0–100 priority. Null means "never set". */
  priorityScore: number | null;
  /** Best score among the company's ACTIVE listings, or null. */
  bestScore: number | null;
  name: string;
}

/**
 * Sample records sink, whatever their priority.
 *
 * `prisma/seed.ts` writes Anthropic (95), Waymo (90), Figma (88) and
 * Perplexity (88) as fixtures with no listings, and priority-first ordering
 * put all four inside the top twenty — above real companies with real
 * postings. A priority written by a seed script is not a judgement the user
 * made, so it does not get to outrank one they did.
 *
 * The rows are still here: eight of 278, sorted last rather than dropped, so
 * `db:clear-samples` remains the thing that removes them and the register
 * never silently under-reports its own size.
 */
export function compareCompanies(a: RankedCompany, b: RankedCompany): number {
  return (
    Number(a.isSample) - Number(b.isSample) ||
    // priorityScore desc, nulls last; then best active-listing score desc.
    (b.priorityScore ?? -1) - (a.priorityScore ?? -1) ||
    (b.bestScore ?? -1) - (a.bestScore ?? -1) ||
    a.name.localeCompare(b.name)
  );
}
