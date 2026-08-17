import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { anchorDateOnly } from "@/lib/dates";
import { ApiError, handler, ok, parseBody } from "@/server/api-helpers";

const bodySchema = z.object({
  kind: z.enum([
    "APPLICATION_DEADLINE",
    "SUGGESTED_APPLY_BY",
    "FOLLOW_UP",
    "ASSESSMENT_DEADLINE",
    "INTERVIEW",
    "REFERRAL_REMINDER",
    "OFFER_DEADLINE",
  ]),
  title: z.string().trim().min(1, "Title is required").max(300),
  /**
   * Full timestamps (what the calendar form posts) are kept as the instant
   * they are; a bare "YYYY-MM-DD" is a calendar date and is anchored at noon
   * UTC instead of midnight (see src/lib/dates.ts).
   */
  dueAt: z.preprocess(anchorDateOnly, z.coerce.date()),
  isEstimated: z.boolean().optional(),
  listingId: z.string().min(1).optional(),
  applicationId: z.string().min(1).optional(),
});

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, bodySchema);

  if (body.listingId) {
    const listing = await prisma.internshipListing.findFirst({
      where: { id: body.listingId, deletedAt: null },
      select: { id: true },
    });
    if (!listing) throw new ApiError("Listing not found", 404);
  }
  if (body.applicationId) {
    const application = await prisma.application.findFirst({
      where: { id: body.applicationId, deletedAt: null },
      select: { id: true },
    });
    if (!application) throw new ApiError("Application not found", 404);
  }

  const deadline = await prisma.deadline.create({
    data: {
      kind: body.kind,
      title: body.title,
      dueAt: body.dueAt,
      isEstimated: body.isEstimated ?? false,
      listingId: body.listingId ?? null,
      applicationId: body.applicationId ?? null,
    },
  });

  return ok(deadline);
});
