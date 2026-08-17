import { prisma } from "@/lib/prisma";
import { formatAccession } from "@/lib/notation";

/**
 * Accession numbers (spec A2) — the record's permanent identity in the archive.
 *
 * DERIVED, not stored. Every model uses `@id @default(cuid())`; there is no
 * autoincrement anywhere in the schema. But `Application.createdAt` defaults to
 * `now()` and removal from the tracker is a SOFT delete, which together make a
 * `createdAt`-ordered rank stable:
 *
 *   1. Append-only — a new row always sorts last and takes the next ordinal.
 *      An existing record's number can never move up.
 *   2. Immune to tracker removal — the rank set deliberately INCLUDES
 *      soft-deleted rows, so removing and restoring returns the same number,
 *      and withdrawing A-0102 does not renumber A-0117.
 *   3. Immune to stage changes, re-accepts, re-scores and re-analysis: none of
 *      those touch `createdAt`.
 *   4. One documented exception — `POST /api/settings/clear-samples` and
 *      `scripts/clear-samples.ts` HARD-delete sample applications, renumbering
 *      everything created after them. The Settings danger zone says so.
 *
 * Cost: one `SELECT id … ORDER BY created_at, id` per request that needs
 * numbers. Single-user, hundreds of rows. Do not add an index.
 *
 * THIS MODULE IMPORTS PRISMA — never import it from a `"use client"` file. The
 * pure formatters live in `@/lib/notation`; they are re-exported below so
 * server callers can take everything from one place.
 */
export { formatAccession, formatQueueNo } from "@/lib/notation";

/** id → "A-0192" for every Application the user has ever had, deleted or not. */
export async function accessionMap(userId: string): Promise<Map<string, string>> {
  const rows = await prisma.application.findMany({
    where: { userId }, // deliberately NOT filtered by deletedAt — see (2) above
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return new Map(rows.map((r, i) => [r.id, formatAccession(i + 1)]));
}
