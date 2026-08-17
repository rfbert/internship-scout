/**
 * API-route integration tests: call the real route handlers against the test
 * database. Covers: accept → tracker (+status history), discard requires
 * reason, discard → restore, stage change appends history (never overwrites),
 * deadline create/complete, settings weight validation.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { execSync } from "child_process";
import path from "path";
import { PrismaClient } from "@prisma/client";

const TEST_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://scout:scout_dev_pw@localhost:5432/internship_scout_test";
process.env.DATABASE_URL = TEST_URL;

const prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });

let listingId = "";

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
      email: "api-test@example.com",
      name: "API Test",
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
  await prisma.discardReason.createMany({
    data: [
      { key: "not_interested", label: "Not interested" },
      { key: "no_sponsorship", label: "No sponsorship" },
    ],
  });
  const company = await prisma.company.create({
    data: { name: "TestCo", normalizedName: "testco" },
  });
  const listing = await prisma.internshipListing.create({
    data: {
      companyId: company.id,
      title: "AI PM Intern (Summer 2027)",
      normalizedTitle: "ai pm",
      season: "SUMMER_2027",
      descriptionHash: "hash-1",
      currentScore: 90,
      currentBand: "EXCEPTIONAL",
      dedupeKey: "testco|ai pm|summer_2027|",
    },
  });
  listingId = listing.id;
  const user = await prisma.user.findFirstOrThrow();
  await prisma.userListingDecision.create({
    data: { userId: user.id, listingId, state: "PENDING_REVIEW" },
  });
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("decision workflow", () => {
  it("discard without a reason is rejected (422)", async () => {
    const { POST } = await import("@/app/api/decisions/[listingId]/route");
    const res = await POST(json({ action: "discard" }), p({ listingId }));
    expect(res.status).toBe(422);
  });

  it("accept moves the listing into the tracker with an initial history row", async () => {
    const { POST } = await import("@/app/api/decisions/[listingId]/route");
    const res = await POST(json({ action: "accept" }), p({ listingId }));
    expect(res.status).toBe(200);

    const app = await prisma.application.findFirst({
      where: { listingId },
      include: { statusHistory: true },
    });
    expect(app).toBeTruthy();
    expect(app!.stage).toBe("INTERESTED");
    expect(app!.statusHistory).toHaveLength(1);
    expect(app!.statusHistory[0].toStage).toBe("INTERESTED");
  });

  it("accepting again does not create a second application (idempotent)", async () => {
    const { POST } = await import("@/app/api/decisions/[listingId]/route");
    await POST(json({ action: "accept" }), p({ listingId }));
    expect(await prisma.application.count({ where: { listingId } })).toBe(1);
  });

  it("discard with reason archives; restore brings it back preserving previousState", async () => {
    const { POST } = await import("@/app/api/decisions/[listingId]/route");
    const res = await POST(
      json({ action: "discard", discardReasonKey: "not_interested", note: "meh" }),
      p({ listingId })
    );
    expect(res.status).toBe(200);
    let d = await prisma.userListingDecision.findFirst({ where: { listingId }, include: { discardReason: true } });
    expect(d!.state).toBe("DISCARDED");
    expect(d!.discardReason?.key).toBe("not_interested");

    const res2 = await POST(json({ action: "restore" }), p({ listingId }));
    expect(res2.status).toBe(200);
    d = await prisma.userListingDecision.findFirst({ where: { listingId }, include: { discardReason: true } });
    expect(d!.state).toBe("PENDING_REVIEW");
    expect(d!.previousState).toBe("DISCARDED");
    expect(d!.restoredAt).toBeTruthy();
  });

  it("404 on unknown listing", async () => {
    const { POST } = await import("@/app/api/decisions/[listingId]/route");
    const res = await POST(json({ action: "save" }), p({ listingId: "nope" }));
    expect(res.status).toBe(404);
  });
});

describe("application stage history", () => {
  it("stage changes append dated history rows and set appliedAt once", async () => {
    // PRECONDITION, stated rather than inherited. The `restore` test above
    // undoes an accept, and undoing an accept soft-deletes the application it
    // created — so by the time we get here the row exists but is deleted, and
    // the stage route rightly answers 404 for it. Accepting again resurrects
    // it through the same path a user would take. This used to be an accident
    // of test order: the assertions below ran on whatever the previous test
    // happened to leave behind, and went red the moment `restore` learned to
    // take the tracker entry back.
    const { POST: decide } = await import("@/app/api/decisions/[listingId]/route");
    expect((await decide(json({ action: "accept" }), p({ listingId }))).status).toBe(200);

    const app = await prisma.application.findFirstOrThrow({
      where: { listingId, deletedAt: null },
    });

    const { POST } = await import("@/app/api/applications/[id]/stage/route");
    let res = await POST(json({ stage: "APPLIED", note: "Submitted via portal" }), p({ id: app.id }));
    expect(res.status).toBe(200);
    res = await POST(json({ stage: "RECRUITER_SCREEN" }), p({ id: app.id }));
    expect(res.status).toBe(200);

    const after = await prisma.application.findUniqueOrThrow({
      where: { id: app.id },
      include: { statusHistory: { orderBy: { changedAt: "asc" } } },
    });
    expect(after.stage).toBe("RECRUITER_SCREEN");
    expect(after.appliedAt).toBeTruthy();
    // INTERESTED (first accept) → INTERESTED (resurrect) → APPLIED →
    // RECRUITER_SCREEN. Four rows: history is appended to, never overwritten,
    // and the resurrect is part of the record rather than hidden.
    expect(after.statusHistory.map((h) => h.toStage)).toEqual([
      "INTERESTED",
      "INTERESTED",
      "APPLIED",
      "RECRUITER_SCREEN",
    ]);
    // Found by stage, not index — the two INTERESTED rows are interchangeable
    // and an index would make this flaky if their timestamps ever collide.
    const applied = after.statusHistory.find((h) => h.toStage === "APPLIED");
    expect(applied?.fromStage).toBe("INTERESTED");
    expect(applied?.note).toBe("Submitted via portal");
  });
});

describe("deadlines", () => {
  it("creates and completes a deadline; estimated flag preserved", async () => {
    const { POST } = await import("@/app/api/deadlines/route");
    const res = await POST(
      json({
        kind: "APPLICATION_DEADLINE",
        title: "Apply to TestCo",
        dueAt: "2026-08-15T00:00:00Z",
        isEstimated: true,
        listingId,
      })
    );
    expect(res.status).toBe(200);
    const dl = await prisma.deadline.findFirstOrThrow({ where: { listingId } });
    expect(dl.isEstimated).toBe(true);

    const { PATCH } = await import("@/app/api/deadlines/[id]/route");
    const res2 = await PATCH(patchJson({ completedAt: new Date().toISOString() }), p({ id: dl.id }));
    expect(res2.status).toBe(200);
    const done = await prisma.deadline.findUniqueOrThrow({ where: { id: dl.id } });
    expect(done.completedAt).toBeTruthy();
  });
});

describe("settings validation", () => {
  it("rejects weights that do not sum to 100", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(
      patchJson({
        scoringWeights: {
          careerValue: 90, sponsorship: 25, roleAlignment: 20, companyQuality: 15,
          ugEligibility: 5, compensation: 5, locationFit: 3, freshness: 2,
        },
      })
    );
    expect(res.status).toBe(422);
  });

  it("accepts valid weights", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(
      patchJson({
        scoringWeights: {
          careerValue: 30, sponsorship: 25, roleAlignment: 20, companyQuality: 10,
          ugEligibility: 5, compensation: 5, locationFit: 3, freshness: 2,
        },
      })
    );
    expect(res.status).toBe(200);
    const prefs = await prisma.userPreference.findFirstOrThrow();
    expect((prefs.scoringWeights as Record<string, number>).careerValue).toBe(30);
  });
});
