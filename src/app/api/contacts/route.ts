import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, parseBody } from "@/server/api-helpers";

const bodySchema = z.object({
  name: z.string().min(1, "Name is required"),
  position: z.string().optional(),
  companyId: z.string().optional(),
  relationship: z.string().optional(),
  email: z.string().optional(),
  linkedinUrl: z.string().optional(),
  /** Optional: also link the new contact to an application (tracker inline form). */
  applicationId: z.string().optional(),
  role: z.string().optional(),
});

const opt = (v: string | undefined): string | null => v?.trim() || null;

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, bodySchema);

  if (body.companyId) {
    const company = await prisma.company.findUnique({ where: { id: body.companyId } });
    if (!company || company.deletedAt) throw new ApiError("Company not found", 422);
  }
  if (body.applicationId) {
    const app = await prisma.application.findUnique({ where: { id: body.applicationId } });
    if (!app || app.deletedAt) throw new ApiError("Application not found", 422);
  }

  const contact = await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: {
        name: body.name.trim(),
        position: opt(body.position),
        companyId: body.companyId || null,
        relationship: opt(body.relationship),
        email: opt(body.email),
        linkedinUrl: opt(body.linkedinUrl),
      },
    });
    if (body.applicationId) {
      await tx.applicationContact.create({
        data: {
          applicationId: body.applicationId,
          contactId: created.id,
          role: opt(body.role),
        },
      });
      await tx.application.update({
        where: { id: body.applicationId },
        data: { lastActivityAt: new Date() },
      });
    }
    return created;
  });

  return ok(contact);
});
