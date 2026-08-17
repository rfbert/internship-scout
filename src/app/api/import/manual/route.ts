import { handler, ok, parseBody } from "@/server/api-helpers";
import { ingestManualPosting } from "../ingest";
import { manualPostingSchema } from "../schema";

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, manualPostingSchema);
  const { listingId, applicationId } = await ingestManualPosting(body, "manual:url-import");
  return ok({ listingId, applicationId });
});
