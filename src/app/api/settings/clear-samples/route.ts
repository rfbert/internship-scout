import { prisma } from "@/lib/prisma";
import { handler, ok } from "@/server/api-helpers";

/**
 * Removes the labeled seed/sample data: sample listings (with their dependent
 * rows), any applications that point at them, and sample companies that end up
 * with no listings. Real data is never touched.
 */
export const POST = handler(async () => {
  const result = await prisma.$transaction(async (tx) => {
    // Applications reference listings without cascade — remove them first.
    const applications = await tx.application.deleteMany({
      where: { listing: { isSample: true } },
    });
    const listings = await tx.internshipListing.deleteMany({
      where: { isSample: true },
    });
    // Only sample companies with no remaining listings can be deleted safely.
    const companies = await tx.company.deleteMany({
      where: { isSample: true, listings: { none: {} } },
    });
    return {
      applications: applications.count,
      listings: listings.count,
      companies: companies.count,
    };
  });

  return ok(result);
});
