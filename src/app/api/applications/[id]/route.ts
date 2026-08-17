import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, handler, ok, parseBody, validationMessage } from "@/server/api-helpers";

const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid ISO date string" });

const bodySchema = z.object({
  priority: z.enum(PRIORITIES).optional(),
  nextAction: z.string().nullable().optional(),
  followUpAt: isoDate.nullable().optional(),
  appliedAt: isoDate.nullable().optional(),
  recruiterName: z.string().nullable().optional(),
  hiringManagerName: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactLinkedin: z.string().nullable().optional(),
  referralStatus: z.string().nullable().optional(),
  finalOutcome: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
});

/** Trim strings; empty string or explicit null clears the field; undefined leaves it alone. */
const str = (v: string | null | undefined): string | null | undefined =>
  v === undefined ? undefined : v === null ? null : v.trim() || null;

export const PATCH = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app || app.deletedAt) throw new ApiError("Application not found", 404);

    // Same bound the stage route enforces on changedAt — the drawer's
    // "Applied on" input goes through this path.
    if (body.appliedAt && Date.parse(body.appliedAt) > Date.now() + 24 * 3600 * 1000) {
      throw new ApiError("appliedAt cannot be more than a day in the future", 422);
    }

    const data: Prisma.ApplicationUpdateInput = {
      lastActivityAt: new Date(),
      priority: body.priority,
      nextAction: str(body.nextAction),
      recruiterName: str(body.recruiterName),
      hiringManagerName: str(body.hiringManagerName),
      contactEmail: str(body.contactEmail),
      contactLinkedin: str(body.contactLinkedin),
      referralStatus: str(body.referralStatus),
      finalOutcome: str(body.finalOutcome),
      rejectionReason: str(body.rejectionReason),
      followUpAt:
        body.followUpAt === undefined
          ? undefined
          : body.followUpAt === null
            ? null
            : new Date(body.followUpAt),
      appliedAt:
        body.appliedAt === undefined
          ? undefined
          : body.appliedAt === null
            ? null
            : new Date(body.appliedAt),
    };

    const updated = await prisma.application.update({ where: { id }, data });
    return ok(updated);
  }
);

/** Why the role left the tracker. Drives the listing's decision state so the
 *  daily agent does not queue it up again a day later. */
const REMOVAL_REASONS = {
  INELIGIBLE: "MARKED_INELIGIBLE",
  NOT_INTERESTED: "DISCARDED",
  DUPLICATE: "MARKED_DUPLICATE",
  MISTAKE: "PENDING_REVIEW",
} as const;

const deleteSchema = z.object({
  reason: z.enum(["INELIGIBLE", "NOT_INTERESTED", "DUPLICATE", "MISTAKE"]).default("NOT_INTERESTED"),
  note: z.string().max(500).optional(),
});

/**
 * Remove an application from the tracker. Soft delete: the row keeps its
 * history so the removal is reversible (POST .../restore) and nothing the user
 * typed is destroyed. The linked listing's decision moves with it — removing a
 * PhD-only role as INELIGIBLE stops the agent re-queuing it tomorrow, while
 * MISTAKE returns it to the review queue.
 */
export const DELETE = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    // A bodyless DELETE is valid and means "not interested".
    const raw = await req.json().catch(() => ({}));
    const parsed = deleteSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw new ApiError(validationMessage(parsed.error.issues), 422);
    }
    const body = parsed.data;

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) throw new ApiError("Application not found", 404);
    if (app.deletedAt) throw new ApiError("Application is already removed", 409);

    const now = new Date();
    const state = REMOVAL_REASONS[body.reason];
    const note = body.note?.trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id },
        data: { deletedAt: now, lastActivityAt: now },
      });
      const decision = await tx.userListingDecision.findUnique({
        where: { userId_listingId: { userId: app.userId, listingId: app.listingId } },
      });
      if (decision) {
        await tx.userListingDecision.update({
          where: { id: decision.id },
          data: {
            previousState: decision.state,
            state,
            decidedAt: now,
            note: note ? `${decision.note ? `${decision.note}\n` : ""}Removed from tracker: ${note}` : decision.note,
          },
        });
      }
    });

    return ok({ id, removed: true, reason: body.reason });
  }
);
