import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, parseBody } from "@/server/api-helpers";
import { STAGE_VALUES } from "@/lib/stages";

const bodySchema = z.object({
  stage: z.enum(STAGE_VALUES),
  note: z.string().optional(),
  /** Optional backdate for the transition; defaults to now. */
  changedAt: z.coerce.date().optional(),
});

export const POST = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app || app.deletedAt) throw new ApiError("Application not found", 404);

    if (app.stage === body.stage) {
      // No transition — return as-is rather than appending a no-op history row.
      const unchanged = await prisma.application.findUniqueOrThrow({
        where: { id },
        include: { statusHistory: { orderBy: { changedAt: "desc" } } },
      });
      return ok(unchanged);
    }

    const now = new Date();
    const changedAt = body.changedAt ?? now;
    if (changedAt.getTime() > now.getTime() + 24 * 3600 * 1000) {
      throw new ApiError("changedAt cannot be more than a day in the future", 422);
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: id,
          fromStage: app.stage,
          toStage: body.stage,
          note: body.note?.trim() || null,
          changedAt,
        },
      });
      return tx.application.update({
        where: { id },
        data: {
          stage: body.stage,
          lastActivityAt: now,
          ...(body.stage === "APPLIED" && !app.appliedAt ? { appliedAt: changedAt } : {}),
        },
        include: { statusHistory: { orderBy: { changedAt: "desc" } } },
      });
    });

    return ok(updated);
  }
);
