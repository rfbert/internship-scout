import { z } from "zod";
import type { Prisma } from "@prisma/client";
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
  stage: z.enum(REFERRAL_STAGES).optional(),
  notesText: z.string().nullable().optional(),
});

export const PATCH = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const existing = await prisma.referral.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Referral not found", 404);

    const now = new Date();
    const data: Prisma.ReferralUpdateInput = {
      stage: body.stage,
      notesText:
        body.notesText === undefined
          ? undefined
          : body.notesText === null
            ? null
            : body.notesText.trim() || null,
      // Milestone timestamps are set once, on the first transition into the stage.
      ...(body.stage === "REFERRAL_REQUESTED" && !existing.requestedAt
        ? { requestedAt: now }
        : {}),
      ...(body.stage === "REFERRAL_RECEIVED" && !existing.receivedAt
        ? { receivedAt: now }
        : {}),
    };

    const updated = await prisma.referral.update({
      where: { id },
      data,
      include: { contact: true },
    });
    return ok(updated);
  }
);
