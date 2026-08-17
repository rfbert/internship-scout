/**
 * Seed: one user, default preferences, discard reasons, tags, the data-source
 * registry, and a handful of SAMPLE listings (is_sample=true, labeled in the UI).
 *
 * Sample listings are illustrative only — they are NOT live postings. The daily
 * agent replaces them with real data on its first run; `npm run db:clear-samples`
 * removes them.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_WEIGHTS } from "../src/lib/constants";
import { normalizeCompany } from "../src/lib/normalize";
import { seedDemo } from "./demo";

const prisma = new PrismaClient();

/* The seeded identity comes from the environment so no personal data lives
   in the repo. Set SEED_USER_EMAIL (and friends) in .env / CI to seed your
   own account; the defaults are neutral placeholders. CI passes unset repo
   variables through as EMPTY strings, so fall back on blank too — `??`
   alone would seed a blank identity and an Invalid Date. */
const seedEnv = (key: string): string | undefined => process.env[key]?.trim() || undefined;
const SEED_USER_EMAIL = seedEnv("SEED_USER_EMAIL") ?? "user@example.com";
const SEED_USER_NAME = seedEnv("SEED_USER_NAME") ?? "Scout User";
const SEED_TIMEZONE = seedEnv("SEED_TIMEZONE") ?? "America/Los_Angeles";
const SEED_GRADUATION_DATE = new Date(seedEnv("SEED_GRADUATION_DATE") ?? "2028-06-15");

async function main() {
  // ── User + preferences ────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: {},
    create: {
      email: SEED_USER_EMAIL,
      name: SEED_USER_NAME,
      preferences: {
        create: {
          scoringWeights: DEFAULT_WEIGHTS,
          reviewThresholdBand: "WORTH_REVIEWING",
          emailOnEmptyRuns: false,
          emailEnabled: true,
          emailTo: SEED_USER_EMAIL,
          preferredArrangement: "ONSITE",
          timezone: SEED_TIMEZONE,
          graduationDate: SEED_GRADUATION_DATE,
        },
      },
    },
  });

  // ── Discard reasons ───────────────────────────────────────────────────
  const discardReasons: Array<[string, string]> = [
    ["no_sponsorship", "No sponsorship"],
    ["explicitly_ineligible", "Explicitly ineligible"],
    ["poor_role_fit", "Poor role fit"],
    ["wrong_graduation_requirement", "Wrong graduation requirement"],
    ["wrong_location", "Wrong location"],
    ["low_compensation", "Low compensation"],
    ["unpaid", "Unpaid"],
    ["weak_company", "Weak company"],
    ["already_applied", "Already applied"],
    ["duplicate", "Duplicate"],
    ["position_closed", "Position closed"],
    ["not_interested", "Not interested"],
    ["other", "Other"],
  ];
  for (const [i, [key, label]] of discardReasons.entries()) {
    await prisma.discardReason.upsert({
      where: { key },
      update: { label, sortOrder: i },
      create: { key, label, sortOrder: i },
    });
  }

  // ── Tags ──────────────────────────────────────────────────────────────
  for (const [name, color] of [
    ["dream", "purple"],
    ["ai-pm", "blue"],
    ["needs-referral", "amber"],
    ["verify-location", "red"],
  ] as const) {
    await prisma.tag.upsert({ where: { name }, update: {}, create: { name, color } });
  }

  // ── Data-source registry ──────────────────────────────────────────────
  // What the /sources page lists. This repository ships the manual intake
  // paths — paste a URL, upload a CSV, or type a lead in by hand — because
  // those are the ones whose code is actually here and which the demo data
  // exercises. The scheduled collectors that feed the full deployment are not
  // part of this repository, so they are not registered here as though they
  // were: a source row that no code can service is a lie the UI would tell on
  // every page load.
  type Src = {
    key: string;
    name: string;
    kind: "URL_IMPORT" | "CSV_IMPORT" | "MANUAL";
    enabled: boolean;
    automated: boolean;
    priority: number;
    notes?: string;
  };
  const sources: Src[] = [
    {
      key: "manual:url-import",
      name: "Add by URL",
      kind: "URL_IMPORT",
      enabled: true,
      automated: false,
      priority: 50,
      notes:
        "Paste a posting URL and confirm the extracted fields. Manual entries run the same normalize → dedupe → eligibility → sponsorship → score pipeline as anything else.",
    },
    {
      key: "manual:csv-import",
      name: "CSV import",
      kind: "CSV_IMPORT",
      enabled: true,
      automated: false,
      priority: 60,
      notes:
        "Upload a CSV exported from a university portal. Rows are deduplicated against everything already on file before they reach the queue.",
    },
    {
      key: "manual:entry",
      name: "Manual entry",
      kind: "MANUAL",
      enabled: true,
      automated: false,
      priority: 70,
      notes: "A lead with no posting URL yet — a referral, a conversation, something seen in passing.",
    },
  ];
  for (const s of sources) {
    await prisma.dataSource.upsert({
      where: { key: s.key },
      // Name and notes are refreshed; enabled/priority are not, so a change
      // made in the app UI survives a re-seed.
      update: { name: s.name, notes: s.notes ?? null },
      create: {
        key: s.key,
        name: s.name,
        kind: s.kind,
        enabled: s.enabled,
        automated: s.automated,
        priority: s.priority,
        notes: s.notes ?? null,
      },
    });
  }

  // ── Company knowledge base ────────────────────────────────────────────
  // Curated companies with (a) a priority tier (0-100) and (b) a public
  // record of filing H-1B petitions for full-time employees (verifiable in
  // U.S. DOL/USCIS disclosure data, e.g. h1bdata.info). This drives the
  // "company future-sponsorship potential" and "company quality" scores.
  // Historical filings do NOT guarantee any specific offer is sponsored —
  // evidence is stored as MODERATE reliability and shown as such in the UI.
  const KNOWN_SPONSORS: Array<[name: string, tier: number]> = [
    // Top tier — elite brand + deep, sustained H-1B filing history
    ["Google", 98], ["Meta", 96], ["Microsoft", 96], ["Amazon", 94], ["Apple", 95],
    ["NVIDIA", 96], ["OpenAI", 95], ["Anthropic", 95], ["Databricks", 94], ["Stripe", 93],
    // Strong tier
    ["Netflix", 90], ["Airbnb", 89], ["Uber", 87], ["LinkedIn", 88], ["Salesforce", 87],
    ["Adobe", 87], ["Snowflake", 88], ["Coinbase", 85], ["Palantir", 86], ["Figma", 88],
    ["Scale AI", 87], ["TikTok", 84], ["Pinterest", 84], ["DoorDash", 84], ["Plaid", 85],
    ["Ramp", 86], ["Notion", 86], ["Cohere", 84], ["Datadog", 85], ["Dropbox", 82],
    ["Atlassian", 84], ["Cloudflare", 85], ["Instacart", 82], ["Block", 82], ["Intuit", 84],
    ["Roblox", 83], ["Robinhood", 82], ["Lyft", 80], ["Workday", 82], ["ServiceNow", 83],
    // Solid tier
    ["Vercel", 78], ["Linear", 76], ["Brex", 78], ["Rippling", 78], ["Samsara", 76],
    ["Retool", 76], ["Gusto", 74], ["Affirm", 76], ["Twilio", 75], ["MongoDB", 77],
    // Top-tier AI labs & AI-native companies
    ["Waymo", 90], ["DeepMind", 92], ["xAI", 88], ["Perplexity", 88], ["Hugging Face", 84],
    ["Mistral AI", 80], ["Groq", 82], ["Together AI", 80], ["Runway", 80], ["ElevenLabs", 82],
    ["Anysphere", 84], ["Harvey", 80], ["Character AI", 78], ["Weights & Biases", 80],
  ];
  for (const [name, tier] of KNOWN_SPONSORS) {
    const normalized = normalizeCompany(name);
    const company = await prisma.company.upsert({
      where: { normalizedName: normalized },
      update: { priorityScore: tier },
      create: { name, normalizedName: normalized, priorityScore: tier },
    });
    const hasEvidence = await prisma.companySponsorshipEvidence.count({
      where: { companyId: company.id, kind: "H1B_FILINGS" },
    });
    if (hasEvidence === 0) {
      await prisma.companySponsorshipEvidence.create({
        data: {
          companyId: company.id,
          kind: "H1B_FILINGS",
          reliability: "MODERATE",
          sourceName: "Public U.S. H-1B disclosure data",
          sourceUrl: `https://h1bdata.info/index.php?em=${encodeURIComponent(name)}`,
          summary:
            "Company appears in public H-1B disclosure filings as a sponsor of full-time employees. Historical filings do not guarantee sponsorship for any specific role — verify per offer.",
        },
      });
    }
  }

  // Align stored preferences with the current default weights so re-running
  // the seed (manual workflow dispatch) applies scoring-priority updates.
  await prisma.userPreference.updateMany({
    where: { userId: user.id },
    data: { scoringWeights: DEFAULT_WEIGHTS },
  });

  // ── Demo dataset ──────────────────────────────────────────────────────
  // Invented listings, scored by the real engines. See prisma/demo.ts.
  await seedDemo(prisma, user.id);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
