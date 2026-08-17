import { prisma } from "@/lib/prisma";
import { handler, ok } from "@/server/api-helpers";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const reasons = await prisma.discardReason.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, label: true, sortOrder: true },
  });
  return ok(reasons);
});
