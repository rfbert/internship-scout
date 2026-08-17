import { z } from "zod";
import type { DecisionState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, currentUser, handler, ok, parseBody } from "@/server/api-helpers";

const bodySchema = z.object({
  action: z.enum([
    "accept",
    "save",
    "discard",
    "ineligible",
    "duplicate",
    "already_applied",
    "restore",
  ]),
  discardReasonKey: z.string().optional(),
  note: z.string().optional(),
});

type Action = z.infer<typeof bodySchema>["action"];

const STATE_MAP: Record<Action, DecisionState> = {
  accept: "ACCEPTED",
  save: "SAVED_FOR_LATER",
  discard: "DISCARDED",
  ineligible: "MARKED_INELIGIBLE",
  duplicate: "MARKED_DUPLICATE",
  already_applied: "ALREADY_APPLIED",
  restore: "PENDING_REVIEW",
};

export const POST = handler(
  async (req: Request, { params }: { params: Promise<{ listingId: string }> }) => {
    const { listingId } = await params;
    const body = await parseBody(req, bodySchema);
    const user = await currentUser();

    const listing = await prisma.internshipListing.findUnique({
      where: { id: listingId },
      select: { id: true, descriptionHash: true },
    });
    if (!listing) throw new ApiError("Listing not found", 404);

    let discardReasonId: string | undefined;
    if (body.action === "discard") {
      if (!body.discardReasonKey) throw new ApiError("A discard reason is required", 422);
      const reason = await prisma.discardReason.findUnique({
        where: { key: body.discardReasonKey },
      });
      if (!reason) throw new ApiError(`Unknown discard reason "${body.discardReasonKey}"`, 422);
      discardReasonId = reason.id;
    }

    const now = new Date();
    const state = STATE_MAP[body.action];
    const existing = await prisma.userListingDecision.findUnique({
      where: { userId_listingId: { userId: user.id, listingId } },
    });

    const newNote = body.note?.trim() || undefined;
    // Append: never overwrite what is already recorded on the decision.
    const appendedNote =
      newNote === undefined
        ? undefined
        : existing?.note
          ? `${existing.note}\n${newNote}`
          : newNote;

    const decision = await prisma.$transaction(async (tx) => {
      const d = await tx.userListingDecision.upsert({
        where: { userId_listingId: { userId: user.id, listingId } },
        update: {
          previousState: existing?.state ?? null,
          state,
          decidedAt: now,
          decisionContentHash: listing.descriptionHash,
          // A reason only makes sense on a DISCARDED decision — clear it on any
          // other transition so a restored/accepted row doesn't keep a stale one.
          discardReasonId: body.action === "discard" ? discardReasonId : null,
          ...(appendedNote !== undefined ? { note: appendedNote } : {}),
          ...(body.action === "restore" ? { restoredAt: now } : {}),
        },
        create: {
          userId: user.id,
          listingId,
          state,
          previousState: null,
          decidedAt: now,
          decisionContentHash: listing.descriptionHash,
          discardReasonId: discardReasonId ?? null,
          note: newNote ?? null,
          ...(body.action === "restore" ? { restoredAt: now } : {}),
        },
        include: { discardReason: true },
      });

      if (body.action === "accept") {
        const existingApp = await tx.application.findUnique({
          where: { userId_listingId: { userId: user.id, listingId } },
        });
        if (!existingApp) {
          await tx.application.create({
            data: {
              userId: user.id,
              listingId,
              stage: "INTERESTED",
              statusHistory: {
                create: { toStage: "INTERESTED", note: "Accepted from review queue" },
              },
            },
          });
        } else if (existingApp.deletedAt) {
          // The unique (userId, listingId) row survives tracker removal as a
          // soft delete — accept must resurrect it, or the listing vanishes
          // from both the queue (state ACCEPTED) and the tracker (deletedAt).
          await tx.application.update({
            where: { id: existingApp.id },
            data: {
              deletedAt: null,
              lastActivityAt: now,
              statusHistory: {
                create: {
                  toStage: existingApp.stage,
                  note: "Restored to tracker by review-queue accept",
                },
              },
            },
          });
        }
      }

      if (body.action === "restore") {
        // Undoing an accept must also take back the application it created,
        // or the listing sits in the review queue and the tracker at once.
        // Only an untouched INTERESTED row is removed — real progress stays.
        const app = await tx.application.findUnique({
          where: { userId_listingId: { userId: user.id, listingId } },
        });
        if (app && !app.deletedAt && app.stage === "INTERESTED") {
          await tx.application.update({
            where: { id: app.id },
            data: { deletedAt: now, lastActivityAt: now },
          });
        }
      }

      return d;
    });

    return ok(decision);
  }
);
