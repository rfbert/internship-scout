/** Removes the labeled SAMPLE rows created by prisma/seed.ts. */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const listings = await prisma.internshipListing.deleteMany({ where: { isSample: true } });
  const companies = await prisma.company.deleteMany({
    where: { isSample: true, listings: { none: {} } },
  });
  console.log(`Removed ${listings.count} sample listings, ${companies.count} sample companies.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
