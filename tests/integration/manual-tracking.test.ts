/**
 * Manual-entry + pipeline integration tests: the user's own entries are
 * first-class (origin MANUAL), can skip the review queue straight into the
 * tracker, carry a note, don't need a URL/location, and are NEVER auto-marked
 * ineligible — plus backdatable stage transitions and editable appliedAt.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import path from "path";
import { PrismaClient } from "@prisma/client";

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://scout:scout_dev_pw@localhost:5432/internship_scout_test";
process.env.DATABASE_URL = TEST_URL;

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

const json = (body: unknown) =>
  new Request("http://test.local/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const patchJson = (body: unknown) =>
  new Request("http://test.local/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const p = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });

beforeAll(async () => {
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
  });
  await prisma.$executeRawUnsafe(
    `TRUNCATE users, companies, internship_listings, data_sources, agent_runs, email_reports, discard_reasons, tags, contacts, deadlines RESTART IDENTITY CASCADE`
  );
  await prisma.user.create({
    data: {
      email: "manual-test@example.com",
      name: "Manual Test",
      preferences: {
        create: {
          scoringWeights: {
            careerValue: 25, sponsorship: 25, roleAlignment: 20, companyQuality: 15,
            ugEligibility: 5, compensation: 5, locationFit: 3, freshness: 2,
          },
        },
      },
    },
  });
  await prisma.dataSource.createMany({
    data: [
      { key: "manual:url-import", name: "Manual URL import", kind: "URL_IMPORT", automated: false, priority: 50 },
      { key: "manual:csv-import", name: "Manual CSV import", kind: "CSV_IMPORT", automated: false, priority: 50 },
    ],
  });
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("manual import — user entries are never auto-rejected (R3 at ingest)", () => {
  it("citizenship-required text warns but stays PENDING_REVIEW", async () => {
    const { POST } = await import("@/app/api/import/manual/route");
    const res = await POST(
      json({
        companyName: "Lockheed Test",
        title: "Software Engineering Intern",
        locationRaw: "Corvallis, OR",
        postingUrl: "https://example.com/jobs/lockheed-swe-intern",
        description: "Applicants must be a U.S. citizen to be considered for this role.",
      })
    );
    expect(res.status).toBe(200);
    const { data: { listingId } } = (await res.json()) as { data: { listingId: string } };
    const decision = await prisma.userListingDecision.findFirstOrThrow({
      where: { listingId },
    });
    expect(decision.state).toBe("PENDING_REVIEW");
    expect(decision.note?.toLowerCase()).toContain("warning");
    const listing = await prisma.internshipListing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.origin).toBe("MANUAL");
  });

  it("URL-less, location-less lead with a note is accepted and note persisted", async () => {
    const { POST } = await import("@/app/api/import/manual/route");
    const res = await POST(
      json({
        companyName: "Stealth AI Startup",
        title: "ML Intern (referral lead)",
        note: "Met recruiter at Grace Hopper booth — follow up with Ana.",
      })
    );
    expect(res.status).toBe(200);
    const { data: { listingId } } = (await res.json()) as { data: { listingId: string } };
    const listing = await prisma.internshipListing.findUniqueOrThrow({
      where: { id: listingId },
      include: { notes: true, locations: true },
    });
    expect(listing.postingUrl).toBeNull();
    expect(listing.locations).toHaveLength(0);
    expect(listing.origin).toBe("MANUAL");
    expect(listing.notes.map((n) => n.body).join(" ")).toContain("Grace Hopper");
  });

  it("track: true goes straight to the tracker (Application + ACCEPTED decision + history)", async () => {
    const { POST } = await import("@/app/api/import/manual/route");
    const res = await POST(
      json({
        companyName: "DirectTrack Co",
        title: "AI Product Intern",
        postingUrl: "https://example.com/jobs/directtrack-ai-pm",
        locationRaw: "Remote",
        track: true,
        note: "Applying tonight.",
      })
    );
    expect(res.status).toBe(200);
    const { data: body } = (await res.json()) as { data: { listingId: string; applicationId?: string } };
    expect(body.applicationId).toBeTruthy();
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: body.applicationId! },
      include: { statusHistory: true, notes: true },
    });
    expect(app.stage).toBe("INTERESTED");
    expect(app.statusHistory).toHaveLength(1);
    expect(app.statusHistory[0].toStage).toBe("INTERESTED");
    expect(app.notes.map((n) => n.body).join(" ")).toContain("Applying tonight");
    const decision = await prisma.userListingDecision.findFirstOrThrow({
      where: { listingId: body.listingId },
    });
    expect(decision.state).toBe("ACCEPTED");
  });

  it("track:true adopts a scraper-known untracked listing instead of a false 409", async () => {
    const company = await prisma.company.create({
      data: { name: "ScrapedCo", normalizedName: "scrapedco" },
    });
    const ds = await prisma.dataSource.findUniqueOrThrow({ where: { key: "manual:url-import" } });
    const url = "https://boards.greenhouse.io/scrapedco/jobs/70001";
    const listing = await prisma.internshipListing.create({
      data: {
        companyId: company.id,
        title: "Software Engineering Intern (Summer 2027)",
        normalizedTitle: "software engineering intern",
        season: "SUMMER_2027",
        origin: "SCRAPED",
        postingUrl: url,
        dedupeKey: "scrapedco|software engineering intern|x",
        sources: { create: { dataSourceId: ds.id, kind: "GREENHOUSE", url, isCanonical: true } },
      },
    });
    const user = await prisma.user.findFirstOrThrow();
    await prisma.userListingDecision.create({
      data: { userId: user.id, listingId: listing.id, state: "PENDING_REVIEW" },
    });

    const { POST } = await import("@/app/api/import/manual/route");
    const deadline = new Date("2026-10-01T19:00:00.000Z");
    const res = await POST(
      json({
        companyName: "ScrapedCo",
        title: "Software Engineering Intern (Summer 2027)",
        postingUrl: url,
        track: true,
        note: "Recruiter pinged me directly.",
        deadline: deadline.toISOString(),
      })
    );
    expect(res.status).toBe(200);
    const { data: body } = (await res.json()) as { data: { listingId: string; applicationId?: string } };
    expect(body.listingId).toBe(listing.id);
    expect(body.applicationId).toBeTruthy();

    const after = await prisma.internshipListing.findUniqueOrThrow({
      where: { id: listing.id },
      include: { decisions: true, applications: { include: { notes: true } } },
    });
    expect(after.origin).toBe("SCRAPED"); // adopting does not rewrite provenance
    expect(after.applicationDeadline?.toISOString()).toBe(deadline.toISOString());
    expect(after.decisions[0].state).toBe("ACCEPTED");
    expect(after.decisions[0].previousState).toBe("PENDING_REVIEW");
    expect(after.applications[0].stage).toBe("INTERESTED");
    expect(after.applications[0].notes.map((n) => n.body).join(" ")).toContain("Recruiter pinged");
  });

  it("track:true on an already-tracked listing 409s with an accurate message", async () => {
    const { POST } = await import("@/app/api/import/manual/route");
    const res = await POST(
      json({
        companyName: "ScrapedCo",
        title: "Software Engineering Intern (Summer 2027)",
        postingUrl: "https://boards.greenhouse.io/scrapedco/jobs/70001",
        track: true,
      })
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error?.toLowerCase()).toContain("in your tracker");
  });

  it("still 409s on duplicate import", async () => {
    const { POST } = await import("@/app/api/import/manual/route");
    const res = await POST(
      json({
        companyName: "DirectTrack Co",
        title: "AI Product Intern",
        postingUrl: "https://example.com/jobs/directtrack-ai-pm",
        locationRaw: "Remote",
      })
    );
    expect(res.status).toBe(409);
  });
});

describe("stage transitions — dates and notes (R2)", () => {
  let applicationId = "";

  beforeAll(async () => {
    const app = await prisma.application.findFirstOrThrow({
      where: { listing: { company: { name: "DirectTrack Co" } } },
    });
    applicationId = app.id;
  });

  it("accepts a backdated changedAt and uses it for appliedAt on first APPLIED", async () => {
    const { POST } = await import("@/app/api/applications/[id]/stage/route");
    const when = new Date("2026-07-21T09:00:00.000Z");
    const res = await POST(
      json({ stage: "APPLIED", note: "Submitted via portal", changedAt: when.toISOString() }),
      p({ id: applicationId })
    );
    expect(res.status).toBe(200);
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: { statusHistory: { orderBy: { changedAt: "desc" } } },
    });
    expect(app.stage).toBe("APPLIED");
    expect(app.appliedAt?.toISOString()).toBe(when.toISOString());
    // The creation-time INTERESTED row is stamped now(), so the backdated row
    // is NOT statusHistory[0] under changedAt desc — select it by stage.
    const applied = app.statusHistory.find((h) => h.toStage === "APPLIED");
    expect(applied?.changedAt.toISOString()).toBe(when.toISOString());
    expect(applied?.note).toBe("Submitted via portal");
  });

  it("rejects a changedAt more than a day in the future", async () => {
    const { POST } = await import("@/app/api/applications/[id]/stage/route");
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const res = await POST(
      json({ stage: "ONLINE_ASSESSMENT", changedAt: future.toISOString() }),
      p({ id: applicationId })
    );
    expect(res.status).toBe(422);
  });

  it("PATCH can edit appliedAt directly", async () => {
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const when = new Date("2026-07-20T00:00:00.000Z");
    const res = await PATCH(patchJson({ appliedAt: when.toISOString() }), p({ id: applicationId }));
    expect(res.status).toBe(200);
    const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(app.appliedAt?.toISOString()).toBe(when.toISOString());
  });
});
