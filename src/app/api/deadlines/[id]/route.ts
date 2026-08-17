import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, parseBody } from "@/server/api-helpers";
import { assertAllowedOnDemo } from "@/server/demo";

const patchSchema = z.object({
  dueAt: z.coerce.date().optional(),
  // z.null() first so JSON null clears completion instead of coercing to epoch.
  completedAt: z.union([z.null(), z.coerce.date()]).optional(),
  title: z.string().trim().min(1, "Title cannot be empty").max(300).optional(),
});

export const PATCH = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    const existing = await prisma.deadline.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new ApiError("Deadline not found", 404);

    const data: Prisma.DeadlineUpdateInput = {};
    if (body.dueAt !== undefined) data.dueAt = body.dueAt;
    if (body.completedAt !== undefined) data.completedAt = body.completedAt;
    if (body.title !== undefined) data.title = body.title;

    if (Object.keys(data).length === 0) throw new ApiError("No fields to update", 400);

    const updated = await prisma.deadline.update({ where: { id }, data });
    return ok(updated);
  }
);

export const DELETE = handler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    assertAllowedOnDemo("Deleting deadlines is disabled on the public demo. Use Reset demo data instead.");

    const { id } = await params;

    const existing = await prisma.deadline.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new ApiError("Deadline not found", 404);

    await prisma.deadline.delete({ where: { id } });
    return ok({ deleted: true });
  }
);
