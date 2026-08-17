import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, currentUser, handler, ok, parseBody } from "@/server/api-helpers";

const bodySchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty").max(8000),
});

export const POST = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const parsed = await parseBody(req, bodySchema);
    const user = await currentUser();

    const company = await prisma.company.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new ApiError("Company not found", 404);

    const note = await prisma.note.create({
      data: {
        userId: user.id,
        entity: "COMPANY",
        companyId: id,
        body: parsed.body,
      },
    });

    return ok(note);
  }
);
