import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, parseBody } from "@/server/api-helpers";

const REFERRAL_STAGES = [
  "POTENTIAL_CONTACT",
  "CONTACTED",
  "RESPONDED",
  "INFORMATIONAL_CONVERSATION",
  "REFERRAL_REQUESTED",
  "REFERRAL_RECEIVED",
  "DECLINED",
  "NO_RESPONSE",
] as const;

const bodySchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  applicationId: z.string().optional(),
  listingId: z.string().optional(),
  stage: z.enum(REFERRAL_STAGES).optional(),
});

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, bodySchema);

  const contact = await prisma.contact.findUnique({ where: { id: body.contactId } });
  if (!contact || contact.deletedAt) throw new ApiError("Contact not found", 422);
  if (body.applicationId) {
    const app = await prisma.application.findUnique({ where: { id: body.applicationId } });
    if (!app || app.deletedAt) throw new ApiError("Application not found", 422);
  }
  if (body.listingId) {
    const listing = await prisma.internshipListing.findUnique({
      where: { id: body.listingId },
    });
    if (!listing || listing.deletedAt) throw new ApiError("Listing not found", 422);
  }

  const now = new Date();
  const stage = body.stage ?? "POTENTIAL_CONTACT";
  const referral = await prisma.referral.create({
    data: {
      contactId: body.contactId,
      applicationId: body.applicationId || null,
      listingId: body.listingId || null,
      stage,
      requestedAt: stage === "REFERRAL_REQUESTED" ? now : null,
      receivedAt: stage === "REFERRAL_RECEIVED" ? now : null,
    },
    include: { contact: true },
  });

  return ok(referral);
});
