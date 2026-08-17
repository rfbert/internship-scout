/**
 * The seed must survive being run twice.
 *
 * This is a regression test for a real outage rather than a hypothetical. The
 * hosted build runs `prisma db seed` on every deploy, and the second deploy
 * failed: `ingestManualPosting` throws 409 on a posting that is already in the
 * tracker — right for a person pasting a URL twice, fatal for a seed — so the
 * build aborted and the site silently stayed on the previous release. Nothing
 * in the unit suite could see it, because the failure needs a database that
 * already holds the dataset.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const TEST_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://scout:scout_dev_pw@localhost:5432/internship_scout_test";
process.env.DATABASE_URL = TEST_URL;

/* Imported inside the test, not at the top. The seed reaches the shared Prisma
   singleton in `@/lib/prisma`, which reads DATABASE_URL when its module first
   evaluates — and static imports are hoisted above the assignment right above
   this comment. Statically imported, the client is built before the test URL
   exists and the run dies with "Environment variable not found: DATABASE_URL".
   It passes in isolation only when a stray .env happens to supply one, which is
   how this hid the first time. Same reason the other files here import their
   route handlers dynamically. */
const loadSeed = async () => (await import("@/server/demo/seed")).seedAll;

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

async function truncateAll() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}

const counts = async () => ({
  listings: await prisma.internshipListing.count(),
  companies: await prisma.company.count(),
  applications: await prisma.application.count(),
  scores: await prisma.listingScore.count(),
});

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seedAll", () => {
  it("builds the dataset, then runs again without failing or duplicating", async () => {
    const seedAll = await loadSeed();
    await seedAll(prisma);
    const first = await counts();

    // The dataset must actually exist, or "no duplication" would pass trivially.
    expect(first.listings).toBeGreaterThan(0);
    expect(first.applications).toBeGreaterThan(0);
    expect(first.scores).toBe(first.listings);

    // The run that used to throw ApiError(409) and break the deploy.
    await expect(seedAll(prisma)).resolves.not.toThrow();

    expect(await counts()).toEqual(first);
  }, 120_000);
});
