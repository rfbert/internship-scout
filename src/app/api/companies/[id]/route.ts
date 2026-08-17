import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, parseBody } from "@/server/api-helpers";

const bodySchema = z.object({
  priorityScore: z.number().int().min(0).max(100).nullable().optional(),
  reputationNote: z.string().trim().max(4000).nullable().optional(),
  aiRelevance: z.string().trim().max(4000).nullable().optional(),
  internshipProgramNote: z.string().trim().max(4000).nullable().optional(),
  industry: z.string().trim().max(200).nullable().optional(),
  sizeRange: z.string().trim().max(100).nullable().optional(),
  stage: z.string().trim().max(100).nullable().optional(),
});

/** Empty strings are stored as NULL so cleared fields don't linger as "". */
const asText = (v: string | null) => (v === null || v === "" ? null : v);

export const PATCH = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const company = await prisma.company.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new ApiError("Company not found", 404);

    const data: Prisma.CompanyUpdateInput = {};
    if (body.priorityScore !== undefined) data.priorityScore = body.priorityScore;
    if (body.reputationNote !== undefined) data.reputationNote = asText(body.reputationNote);
    if (body.aiRelevance !== undefined) data.aiRelevance = asText(body.aiRelevance);
    if (body.internshipProgramNote !== undefined)
      data.internshipProgramNote = asText(body.internshipProgramNote);
    if (body.industry !== undefined) data.industry = asText(body.industry);
    if (body.sizeRange !== undefined) data.sizeRange = asText(body.sizeRange);
    if (body.stage !== undefined) data.stage = asText(body.stage);

    if (Object.keys(data).length === 0) throw new ApiError("No fields to update", 400);

    const updated = await prisma.company.update({ where: { id }, data });
    return ok(updated);
  }
);
