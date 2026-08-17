import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/server/demo";
import { seedAll } from "@/server/demo/seed";

/**
 * Put the public demo back to the state it was deployed in.
 *
 * ## Why this truncates instead of deleting the demo's own rows
 *
 * A reset has to undo whatever a visitor did, and a visitor can create records
 * the seed never made — a contact, a referral, an imported posting, a deadline.
 * Chasing those by identity means keeping a list of everything the app can
 * create and getting the foreign-key order right by hand, and the day someone
 * adds a table without updating that list, reset quietly stops being a reset.
 *
 * `TRUNCATE ... CASCADE` over every table has neither problem: the table list
 * is read from the database itself, so a new table is covered the moment it
 * exists, and CASCADE settles the ordering. The seed then rebuilds from
 * nothing, which is the only way to be sure "reset" means what it says.
 *
 * ## Why this is safe here and nowhere else
 *
 * It destroys the entire database. It is guarded twice — the route rejects the
 * request unless `DEMO_MODE` is on, and this function refuses to run without it
 * either, because a guard that lives only at the edge is one careless import
 * away from being bypassed. On any deployment holding real data this throws
 * rather than runs.
 */
export async function resetDemo(): Promise<{ tablesCleared: number }> {
  if (!isDemoMode()) {
    throw new Error(
      "resetDemo truncates every table and may only run on a demo deployment (DEMO_MODE)."
    );
  }

  // Read the table list from the database rather than hard-coding it, so a
  // table added later is included without anyone remembering to come here.
  // `_prisma_migrations` is excluded: wiping it would make the next deploy
  // replay migrations against a schema that already has them.
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  await seedAll(prisma);

  return { tablesCleared: tables.length };
}
