import { z } from "zod";
import { anchorDateOnly } from "@/lib/dates";

/** Form fields arrive as "" when left blank — treat that as absent. */
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Shared shape for one manually imported posting (URL form, CSV rows, tracker add). */
export const manualPostingSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  title: z.string().trim().min(1, "Title is required").max(300),
  locationRaw: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
  postingUrl: z.preprocess(emptyToUndef, z.url("A valid posting URL is required").optional()),
  applyUrl: z.preprocess(emptyToUndef, z.url().optional()),
  description: z.string().max(50_000).optional(),
  compensationText: z.string().max(500).optional(),
  /**
   * ISO date or datetime string. A bare "YYYY-MM-DD" is a calendar date, not
   * an instant, so it is anchored at noon UTC (see src/lib/dates.ts).
   */
  deadline: z.preprocess(anchorDateOnly, z.coerce.date()).optional(),
  deadlineIsEstimated: z.boolean().optional(),
  /** Free-form note stored on the listing (or the application when tracked). */
  note: z.preprocess(emptyToUndef, z.string().trim().max(5000).optional()),
  /** Skip the review queue: create the tracker Application immediately. */
  track: z.boolean().optional(),
});

export type ManualPostingBody = z.infer<typeof manualPostingSchema>;
