import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, parseBody } from "@/server/api-helpers";
import { assertAllowedOnDemo } from "@/server/demo";

const bodySchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  rateLimitMs: z.number().int().min(250).max(60000).optional(),
  /** Connector config is a pass-through JSON blob — shape varies per source kind. */
  config: z.unknown().optional(),
});

export const PATCH = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    assertAllowedOnDemo(
      "Editing the source registry is disabled on the public demo — it is deployment configuration, not per-record data."
    );

    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const source = await prisma.dataSource.findUnique({ where: { id } });
    if (!source) throw new ApiError("Data source not found", 404);

    const data: Prisma.DataSourceUncheckedUpdateInput = {};
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.rateLimitMs !== undefined) data.rateLimitMs = body.rateLimitMs;
    if (body.config !== undefined) data.config = body.config as Prisma.InputJsonValue;

    const updated = await prisma.dataSource.update({ where: { id }, data });
    return ok(updated);
  }
);
