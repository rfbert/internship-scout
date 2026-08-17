import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/server/api-helpers";
import { ingestManualPosting } from "../ingest";
import { manualPostingSchema } from "../schema";

const bodySchema = z.object({
  rows: z.array(manualPostingSchema).min(1, "No rows to import").max(200, "Max 200 rows per import"),
});

type RowResult = { row: number; ok: true; listingId: string } | { row: number; ok: false; error: string };

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, bodySchema);

  const results: RowResult[] = [];
  for (let i = 0; i < body.rows.length; i++) {
    try {
      const { listingId } = await ingestManualPosting(body.rows[i], "manual:csv-import");
      results.push({ row: i, ok: true, listingId });
    } catch (e) {
      const error =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Import failed";
      results.push({ row: i, ok: false, error });
    }
  }

  return ok(results);
});
