import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { anchorDateOnly } from "@/lib/dates";
import { ApiError, handler, ok, parseBody } from "@/server/api-helpers";

const bodySchema = z.object({
  kind: z.enum([
    "H1B_FILINGS",
    "EMPLOYER_STATEMENT",
    "UNIVERSITY_DOC",
    "PRIOR_POSTING",
    "COMPANY_POLICY",
    "VERIFIED_REPORT",
  ]),
  reliability: z.enum(["STRONG", "MODERATE", "WEAK"]).optional(),
  sourceName: z.string().trim().min(1, "Source name is required").max(300),
  sourceUrl: z.url().max(2000).optional(),
  /**
   * The day the evidence is dated — a calendar date, not an instant. A bare
   * "YYYY-MM-DD" (what the form posts) is anchored at noon UTC rather than
   * midnight, so it renders as the day that was typed everywhere west of
   * Greenwich; a full timestamp is kept as the instant it is. Same contract as
   * `dueAt` on /api/deadlines (see src/lib/dates.ts).
   */
  evidenceDate: z.preprocess(anchorDateOnly, z.coerce.date()).optional(),
  summary: z.string().trim().min(1, "Summary is required").max(4000),
});

export const POST = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const body = await parseBody(req, bodySchema);

    const company = await prisma.company.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new ApiError("Company not found", 404);

    const evidence = await prisma.companySponsorshipEvidence.create({
      data: {
        companyId: id,
        kind: body.kind,
        ...(body.reliability ? { reliability: body.reliability } : {}),
        sourceName: body.sourceName,
        sourceUrl: body.sourceUrl ?? null,
        evidenceDate: body.evidenceDate ?? null,
        summary: body.summary,
      },
    });

    return ok(evidence);
  }
);
