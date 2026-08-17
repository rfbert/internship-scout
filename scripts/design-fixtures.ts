/**
 * Design fixtures: labeled SAMPLE tracker applications for UI/design work.
 *
 * Creates listings (is_sample=true, posting URL marked design-fixture) under
 * existing knowledge-base companies plus applications, contacts, referrals,
 * notes, tags, and stage history — so the tracker renders every state the UI
 * supports. Nothing here is a real posting; the SAMPLE badge shows on every row.
 *
 *   npx tsx scripts/design-fixtures.ts          # create
 *   npx tsx scripts/design-fixtures.ts --clean  # remove everything it created
 */
import "dotenv/config";
import type { ApplicationStage, Priority, ReferralStage } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { normalizeCompany, normalizeTitle, buildDedupeKey, sha256 } from "../src/lib/normalize";

const prisma = new PrismaClient();

/** Every row this script creates carries this marker in a URL or notes field. */
const MARKER = "design-fixture";
const urlFor = (slug: string) => `https://example.com/${MARKER}/${slug}`;

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

type Fixture = {
  slug: string;
  company: string;
  title: string;
  roleCategory: "AI_PRODUCT_MANAGEMENT" | "PM_FOR_AI_PRODUCTS" | "ML_ENGINEERING" | "APM_PROGRAM" | "AI_ENGINEERING" | "APPLIED_AI";
  location: { rawText: string; city: string; state: string; country: string; isRemote: boolean };
  arrangement: "ONSITE" | "HYBRID" | "REMOTE";
  score: number;
  band: "EXCEPTIONAL" | "HIGH_PRIORITY" | "STRONG" | "WORTH_REVIEWING" | "REACH";
  sponsorship: { category: "SPONSORSHIP_OFFERED" | "CPT_OPT_ACCEPTED" | "FUTURE_POSSIBLE" | "COMPANY_HISTORY" | "UNCERTAIN"; confidence: "CONFIRMED" | "HIGH" | "MODERATE" | "LOW" };
  deadline?: { at: Date; estimated: boolean };
  stage: ApplicationStage;
  priority: Priority;
  appliedDaysAgo?: number;
  lastActivityDaysAgo: number;
  nextAction?: string;
  followUpIn?: number; // days from now; negative = overdue
  tags?: string[];
  history?: Array<{ from: ApplicationStage | null; to: ApplicationStage; daysAgo: number; note?: string }>;
  notes?: string[];
  contact?: { name: string; position: string; relationship: string; role: string; referral?: { stage: ReferralStage; requestedDaysAgo?: number; receivedDaysAgo?: number } };
  finalOutcome?: string;
  rejectionReason?: string;
};

const FIXTURES: Fixture[] = [
  {
    slug: "anthropic-pm",
    company: "Anthropic",
    title: "Product Management Intern, Claude Platform",
    roleCategory: "AI_PRODUCT_MANAGEMENT",
    location: { rawText: "San Francisco, CA", city: "San Francisco", state: "CA", country: "US", isRemote: false },
    arrangement: "HYBRID",
    score: 94,
    band: "EXCEPTIONAL",
    sponsorship: { category: "CPT_OPT_ACCEPTED", confidence: "HIGH" },
    deadline: { at: days(9), estimated: false },
    stage: "FINAL_INTERVIEW",
    priority: "URGENT",
    appliedDaysAgo: 24,
    lastActivityDaysAgo: 1,
    nextAction: "Prepare product-sense case: evals for agentic coding",
    followUpIn: 2,
    tags: ["dream", "ai-pm"],
    history: [
      { from: null, to: "APPLIED", daysAgo: 24, note: "Referred by Maya" },
      { from: "APPLIED", to: "RECRUITER_SCREEN", daysAgo: 17 },
      { from: "RECRUITER_SCREEN", to: "TECHNICAL_INTERVIEW", daysAgo: 10, note: "Case study on eval tooling" },
      { from: "TECHNICAL_INTERVIEW", to: "FINAL_INTERVIEW", daysAgo: 1 },
    ],
    notes: [
      "Panel is 3 rounds: product sense, execution, behavioral. Recruiter said decision within a week of the loop.",
      "Team ships the workbench for enterprise evals — re-read the launch post before the panel.",
    ],
    contact: {
      name: "Maya Chen",
      position: "Product Manager, Platform",
      relationship: "alum",
      role: "referrer",
      referral: { stage: "REFERRAL_RECEIVED", requestedDaysAgo: 30, receivedDaysAgo: 26 },
    },
  },
  {
    slug: "stripe-apm",
    company: "Stripe",
    title: "APM Intern, Payments Intelligence",
    roleCategory: "APM_PROGRAM",
    location: { rawText: "South San Francisco, CA", city: "South San Francisco", state: "CA", country: "US", isRemote: false },
    arrangement: "ONSITE",
    score: 89,
    band: "HIGH_PRIORITY",
    sponsorship: { category: "COMPANY_HISTORY", confidence: "MODERATE" },
    deadline: { at: days(4), estimated: true },
    stage: "APPLIED",
    priority: "HIGH",
    appliedDaysAgo: 6,
    lastActivityDaysAgo: 6,
    nextAction: "Follow up with university recruiter",
    followUpIn: -3,
    tags: ["needs-referral"],
    history: [{ from: null, to: "APPLIED", daysAgo: 6 }],
    notes: ["Application went in without a referral — worth asking Diego before the recruiter screen."],
    contact: {
      name: "Diego Ramírez",
      position: "Software Engineer, Terminal",
      relationship: "cold outreach",
      role: "potential referrer",
      referral: { stage: "CONTACTED", requestedDaysAgo: 4 },
    },
  },
  {
    slug: "figma-pm",
    company: "Figma",
    title: "Product Manager Intern, AI Features",
    roleCategory: "PM_FOR_AI_PRODUCTS",
    location: { rawText: "New York, NY", city: "New York", state: "NY", country: "US", isRemote: false },
    arrangement: "HYBRID",
    score: 86,
    band: "HIGH_PRIORITY",
    sponsorship: { category: "FUTURE_POSSIBLE", confidence: "MODERATE" },
    stage: "TECHNICAL_INTERVIEW",
    priority: "HIGH",
    appliedDaysAgo: 19,
    lastActivityDaysAgo: 3,
    nextAction: "Mock interview: metrics deep-dive",
    followUpIn: 1,
    tags: ["ai-pm"],
    history: [
      { from: null, to: "APPLIED", daysAgo: 19 },
      { from: "APPLIED", to: "RECRUITER_SCREEN", daysAgo: 12 },
      { from: "RECRUITER_SCREEN", to: "TECHNICAL_INTERVIEW", daysAgo: 3 },
    ],
    notes: ["Interviewer background: ex-Notion, cares about craft. Bring the redesign case study."],
  },
  {
    slug: "databricks-mle",
    company: "Databricks",
    title: "Machine Learning Engineering Intern",
    roleCategory: "ML_ENGINEERING",
    location: { rawText: "Mountain View, CA", city: "Mountain View", state: "CA", country: "US", isRemote: false },
    arrangement: "ONSITE",
    score: 84,
    band: "STRONG",
    sponsorship: { category: "SPONSORSHIP_OFFERED", confidence: "CONFIRMED" },
    deadline: { at: days(21), estimated: false },
    stage: "ONLINE_ASSESSMENT",
    priority: "HIGH",
    appliedDaysAgo: 9,
    lastActivityDaysAgo: 2,
    nextAction: "Complete CodeSignal by Friday",
    followUpIn: 3,
    history: [
      { from: null, to: "APPLIED", daysAgo: 9 },
      { from: "APPLIED", to: "ONLINE_ASSESSMENT", daysAgo: 2 },
    ],
    notes: ["Mibanco internship overlap is a good story here — same platform family."],
  },
  {
    slug: "nvidia-ai",
    company: "NVIDIA",
    title: "AI Software Intern, Inference Systems",
    roleCategory: "AI_ENGINEERING",
    location: { rawText: "Santa Clara, CA", city: "Santa Clara", state: "CA", country: "US", isRemote: false },
    arrangement: "ONSITE",
    score: 82,
    band: "STRONG",
    sponsorship: { category: "COMPANY_HISTORY", confidence: "MODERATE" },
    stage: "RECRUITER_SCREEN",
    priority: "MEDIUM",
    appliedDaysAgo: 14,
    lastActivityDaysAgo: 4,
    nextAction: "Screen scheduled — confirm slot",
    followUpIn: 5,
    history: [
      { from: null, to: "APPLIED", daysAgo: 14 },
      { from: "APPLIED", to: "RECRUITER_SCREEN", daysAgo: 4 },
    ],
  },
  {
    slug: "notion-pm",
    company: "Notion",
    title: "Product Intern, AI Workflows",
    roleCategory: "PM_FOR_AI_PRODUCTS",
    location: { rawText: "San Francisco, CA", city: "San Francisco", state: "CA", country: "US", isRemote: false },
    arrangement: "HYBRID",
    score: 80,
    band: "STRONG",
    sponsorship: { category: "UNCERTAIN", confidence: "LOW" },
    deadline: { at: days(12), estimated: true },
    stage: "PREPARING",
    priority: "MEDIUM",
    lastActivityDaysAgo: 5,
    nextAction: "Tailor resume to workflow-automation bullet",
    tags: ["ai-pm", "needs-referral"],
    history: [{ from: null, to: "INTERESTED", daysAgo: 8 }, { from: "INTERESTED", to: "PREPARING", daysAgo: 5 }],
  },
  {
    slug: "waymo-applied",
    company: "Waymo",
    title: "Applied AI Intern, Behavior Prediction",
    roleCategory: "APPLIED_AI",
    location: { rawText: "Remote — US", city: "", state: "", country: "US", isRemote: true },
    arrangement: "REMOTE",
    score: 76,
    band: "WORTH_REVIEWING",
    sponsorship: { category: "COMPANY_HISTORY", confidence: "MODERATE" },
    stage: "INTERESTED",
    priority: "LOW",
    lastActivityDaysAgo: 12,
    history: [{ from: null, to: "INTERESTED", daysAgo: 12 }],
  },
  {
    slug: "perplexity-offer",
    company: "Perplexity",
    title: "Product Intern, Search Experiences",
    roleCategory: "PM_FOR_AI_PRODUCTS",
    location: { rawText: "San Francisco, CA", city: "San Francisco", state: "CA", country: "US", isRemote: false },
    arrangement: "ONSITE",
    score: 91,
    band: "EXCEPTIONAL",
    sponsorship: { category: "CPT_OPT_ACCEPTED", confidence: "HIGH" },
    stage: "OFFER",
    priority: "URGENT",
    appliedDaysAgo: 41,
    lastActivityDaysAgo: 0,
    nextAction: "Offer call Tuesday — clarify housing stipend",
    followUpIn: 4,
    tags: ["dream"],
    history: [
      { from: null, to: "APPLIED", daysAgo: 41 },
      { from: "APPLIED", to: "RECRUITER_SCREEN", daysAgo: 33 },
      { from: "RECRUITER_SCREEN", to: "FIRST_INTERVIEW", daysAgo: 26 },
      { from: "FIRST_INTERVIEW", to: "PRODUCT_CASE_INTERVIEW", daysAgo: 15, note: "Case: ranking freshness vs. authority" },
      { from: "PRODUCT_CASE_INTERVIEW", to: "FINAL_INTERVIEW", daysAgo: 8 },
      { from: "FINAL_INTERVIEW", to: "OFFER", daysAgo: 0, note: "Verbal offer — written to follow" },
    ],
    notes: ["Deadline to respond: two weeks from written offer. Compare against Anthropic loop timing."],
    contact: { name: "Sofía Delgado", position: "University Recruiter", relationship: "recruiter", role: "recruiter" },
  },
  {
    slug: "linear-rejected",
    company: "Linear",
    title: "Product Engineer Intern",
    roleCategory: "AI_ENGINEERING",
    location: { rawText: "Remote — North America", city: "", state: "", country: "US", isRemote: true },
    arrangement: "REMOTE",
    score: 72,
    band: "WORTH_REVIEWING",
    sponsorship: { category: "UNCERTAIN", confidence: "LOW" },
    stage: "REJECTED",
    priority: "LOW",
    appliedDaysAgo: 30,
    lastActivityDaysAgo: 7,
    finalOutcome: "Rejected after recruiter screen",
    rejectionReason: "Looking for candidates with more production TypeScript experience",
    history: [
      { from: null, to: "APPLIED", daysAgo: 30 },
      { from: "APPLIED", to: "RECRUITER_SCREEN", daysAgo: 18 },
      { from: "RECRUITER_SCREEN", to: "REJECTED", daysAgo: 7, note: "Kind note from recruiter — reapply next cycle" },
    ],
  },
  {
    slug: "ramp-withdrawn",
    company: "Ramp",
    title: "Software Engineer Intern, AI Agents",
    roleCategory: "AI_ENGINEERING",
    location: { rawText: "New York, NY", city: "New York", state: "NY", country: "US", isRemote: false },
    arrangement: "ONSITE",
    score: 78,
    band: "STRONG",
    sponsorship: { category: "COMPANY_HISTORY", confidence: "MODERATE" },
    stage: "WITHDRAWN",
    priority: "LOW",
    appliedDaysAgo: 27,
    lastActivityDaysAgo: 10,
    finalOutcome: "Withdrew — schedule conflict with research commitment",
    history: [
      { from: null, to: "APPLIED", daysAgo: 27 },
      { from: "APPLIED", to: "WITHDRAWN", daysAgo: 10, note: "TRUE Lab deadline collision; focusing on PM roles" },
    ],
  },
];

async function clean() {
  const listings = await prisma.internshipListing.findMany({
    where: { postingUrl: { contains: `/${MARKER}/` } },
    select: { id: true },
  });
  const listingIds = listings.map((l) => l.id);
  const apps = await prisma.application.findMany({
    where: { listingId: { in: listingIds } },
    select: { id: true },
  });
  const appIds = apps.map((a) => a.id);

  // Referral.application is SetNull on app delete — remove referrals first.
  const referrals = await prisma.referral.deleteMany({ where: { applicationId: { in: appIds } } });
  const deleted = await prisma.application.deleteMany({ where: { id: { in: appIds } } });
  const contacts = await prisma.contact.deleteMany({ where: { notesText: { contains: MARKER } } });
  const removed = await prisma.internshipListing.deleteMany({ where: { id: { in: listingIds } } });
  console.log(
    `Removed ${deleted.count} applications, ${referrals.count} referrals, ${contacts.count} contacts, ${removed.count} listings.`
  );
}

async function create() {
  const user = await prisma.user.findFirstOrThrow();
  const manualSource = await prisma.dataSource.findUniqueOrThrow({ where: { key: "manual:url-import" } });

  for (const f of FIXTURES) {
    const normalizedCompany = normalizeCompany(f.company);
    const company = await prisma.company.upsert({
      where: { normalizedName: normalizedCompany },
      update: {},
      create: { name: f.company, normalizedName: normalizedCompany, isSample: true },
    });

    const normalizedTitle = normalizeTitle(f.title);
    const dedupeKey = buildDedupeKey({
      normalizedCompany,
      normalizedTitle,
      season: "SUMMER_2027",
      primaryLocation: f.location.rawText,
    });
    if (await prisma.internshipListing.findUnique({ where: { dedupeKey } })) {
      console.log(`skip (exists): ${f.slug}`);
      continue;
    }

    const description = `SAMPLE LISTING (${MARKER}) — not a real posting. Used to preview the tracker design.`;
    const listing = await prisma.internshipListing.create({
      data: {
        companyId: company.id,
        title: f.title,
        normalizedTitle,
        roleCategory: f.roleCategory,
        season: "SUMMER_2027",
        seasonEvidence: "SAMPLE data",
        description,
        descriptionHash: sha256(description + f.slug),
        status: "ACTIVE",
        workArrangement: f.arrangement,
        ugEligibility: "UNDERGRAD_EXPLICIT",
        postingUrl: urlFor(f.slug),
        applyUrl: `${urlFor(f.slug)}/apply`,
        dedupeKey,
        isSample: true,
        currentSponsorshipCategory: f.sponsorship.category,
        currentSponsorshipConfidence: f.sponsorship.confidence,
        currentScore: f.score,
        currentBand: f.band,
        applicationDeadline: f.deadline?.at ?? null,
        deadlineIsEstimated: f.deadline?.estimated ?? false,
        locations: { create: [{ ...f.location, isPrimary: true }] },
        sources: { create: { dataSourceId: manualSource.id, kind: "MANUAL", url: urlFor(f.slug) } },
      },
    });

    const app = await prisma.application.create({
      data: {
        userId: user.id,
        listingId: listing.id,
        stage: f.stage,
        priority: f.priority,
        nextAction: f.nextAction ?? null,
        followUpAt: f.followUpIn !== undefined ? days(f.followUpIn) : null,
        acceptedAt: days(-(f.appliedDaysAgo ?? f.lastActivityDaysAgo) - 1),
        appliedAt: f.appliedDaysAgo !== undefined ? days(-f.appliedDaysAgo) : null,
        lastActivityAt: days(-f.lastActivityDaysAgo),
        finalOutcome: f.finalOutcome ?? null,
        rejectionReason: f.rejectionReason ?? null,
        statusHistory: {
          create: (f.history ?? []).map((h) => ({
            fromStage: h.from,
            toStage: h.to,
            note: h.note ?? null,
            changedAt: days(-h.daysAgo),
          })),
        },
        notes: {
          create: (f.notes ?? []).map((body) => ({
            userId: user.id,
            entity: "APPLICATION" as const,
            body,
          })),
        },
      },
    });

    for (const tagName of f.tags ?? []) {
      const tag = await prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      });
      await prisma.applicationTag.create({ data: { applicationId: app.id, tagId: tag.id } });
    }

    if (f.contact) {
      const contact = await prisma.contact.create({
        data: {
          name: f.contact.name,
          position: f.contact.position,
          companyId: company.id,
          relationship: f.contact.relationship,
          notesText: `Created by ${MARKER} script — sample contact.`,
        },
      });
      await prisma.applicationContact.create({
        data: { applicationId: app.id, contactId: contact.id, role: f.contact.role },
      });
      if (f.contact.referral) {
        await prisma.referral.create({
          data: {
            contactId: contact.id,
            applicationId: app.id,
            listingId: listing.id,
            stage: f.contact.referral.stage,
            requestedAt: f.contact.referral.requestedDaysAgo !== undefined ? days(-f.contact.referral.requestedDaysAgo) : null,
            receivedAt: f.contact.referral.receivedDaysAgo !== undefined ? days(-f.contact.referral.receivedDaysAgo) : null,
            notesText: `Sample referral (${MARKER}).`,
          },
        });
      }
    }
    console.log(`created: ${f.company} — ${f.title} [${f.stage}]`);
  }
}

async function main() {
  if (process.argv.includes("--clean")) await clean();
  else await create();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
