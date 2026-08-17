import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok } from "@/server/api-helpers";

/**
 * Undo a tracker removal. Clears the soft-delete flag and puts the listing's
 * decision back to whatever it was before the removal, so an accidental
 * "Remove" is one click away from being reversed.
 */
export const POST = handler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) throw new ApiError("Application not found", 404);
    if (!app.deletedAt) throw new ApiError("Application is not removed", 409);

    const now = new Date();
    const restored = await prisma.$transaction(async (tx) => {
      const decision = await tx.userListingDecision.findUnique({
        where: { userId_listingId: { userId: app.userId, listingId: app.listingId } },
      });
      if (decision) {
        await tx.userListingDecision.update({
          where: { id: decision.id },
          data: {
            state: decision.previousState ?? "ACCEPTED",
            previousState: decision.state,
            decidedAt: now,
          },
        });
      }
      return tx.application.update({
        where: { id },
        data: { deletedAt: null, lastActivityAt: now },
      });
    });

    return ok(restored);
  }
);
