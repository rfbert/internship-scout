import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, currentUser, handler, ok, parseBody } from "@/server/api-helpers";

const bodySchema = z.object({
  body: z.string().min(1, "Note text is required"),
});

export const POST = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const body = await parseBody(req, bodySchema);
    const user = await currentUser();

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app || app.deletedAt) throw new ApiError("Application not found", 404);

    const [note] = await prisma.$transaction([
      prisma.note.create({
        data: {
          userId: user.id,
          entity: "APPLICATION",
          applicationId: id,
          body: body.body.trim(),
        },
      }),
      prisma.application.update({
        where: { id },
        data: { lastActivityAt: new Date() },
      }),
    ]);

    return ok(note);
  }
);
