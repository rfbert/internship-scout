import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, currentUser, handler, ok, parseBody } from "@/server/api-helpers";

const bodySchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty"),
});

export const POST = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const parsed = await parseBody(req, bodySchema);
    const user = await currentUser();

    const listing = await prisma.internshipListing.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!listing) throw new ApiError("Listing not found", 404);

    const note = await prisma.note.create({
      data: {
        userId: user.id,
        entity: "LISTING",
        listingId: id,
        body: parsed.body,
      },
    });

    return ok(note);
  }
);
