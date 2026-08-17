import type { Prisma } from "@prisma/client";

/**
 * Which deadlines a surface is allowed to show.
 *
 * A `Deadline` can hang off a listing, off an application, or off neither. When
 * it hangs off an application, soft-deleting that application (Withdraw /
 * Remove sets `deletedAt`) has to take the deadline out of view with it —
 * otherwise the register keeps counting work for a row the user removed.
 *
 * This lived only in `/`'s query. `/calendar` ran `deadline.findMany` with no
 * `where` at all, so a withdrawn application's deadline stayed in its Overdue /
 * Today / Next-7 figures and its agenda while the dashboard had already dropped
 * it — the two pages printing different totals for the same day. Sharing the
 * fragment is what makes "both pages hide the same rows" checkable rather than
 * asserted: `tests/unit/overdue.test.ts` pins the shape, and there is one
 * object to change if the rule ever moves.
 *
 * `visibleDeadline` is the soft-delete rule alone — for surfaces that render
 * completed deadlines too (the diary's "Completed" block). `liveDeadline` adds
 * "not yet ticked off", which is what a figure counting outstanding work means.
 */
export const visibleDeadline = {
  OR: [{ applicationId: null }, { application: { deletedAt: null } }],
} satisfies Prisma.DeadlineWhereInput;

/** Open (not completed), and not attached to a removed application. */
export const liveDeadline = {
  completedAt: null,
  ...visibleDeadline,
} satisfies Prisma.DeadlineWhereInput;
