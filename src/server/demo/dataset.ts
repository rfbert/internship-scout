/**
 * The demo dataset.
 *
 * Every listing here is invented — the companies do not exist, the postings
 * were never published, and no line of it came from anyone's real search. What
 * is NOT invented is the analysis: each posting is pushed through
 * `ingestManualPosting`, the same pipeline the app's own import form calls, so
 * the band, the score components, the sponsorship verdict and the explanation
 * lines you see on screen are produced by the real rule engines rather than
 * typed in by hand.
 *
 * That is the point of seeding it this way. Hard-coding `currentScore: 88`
 * would make a page that looks right and proves nothing; running the engines
 * means a change to the scoring rules visibly moves the demo, and a seed that
 * completes at all is evidence the pipeline works end to end.
 *
 * The postings are written to exercise the branches that matter: an explicit
 * sponsorship offer, CPT/OPT language, a hard "no sponsorship", a citizenship
 * requirement, a clearance requirement, and several that say nothing at all —
 * which is the common and most interesting case, because the rules must not
 * invent a verdict from silence.
 */
import type { PrismaClient } from "@prisma/client";
import { ingestManualPosting, type ManualPostingInput } from "@/app/api/import/ingest";

/** Days from now, as a Date. Negative is in the past. */
const at = (days: number, hour = 9): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const dayOnly = (days: number): Date => {
  const d = at(days);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

interface DemoPosting extends ManualPostingInput {
  /** What this row is here to demonstrate. Not stored — a note to the reader. */
  demonstrates: string;
}

/* ── The postings ──────────────────────────────────────────────────────────
   Descriptions are long enough to be scored honestly: the career-value
   component reads keyword signals out of the body, and the sponsorship rules
   need real sentences to quote back as evidence. */
const POSTINGS: DemoPosting[] = [
  {
    demonstrates: "Explicit sponsorship offer + strong AI PM fit — should land at the top band",
    companyName: "Helio Systems",
    title: "AI Product Management Intern, Summer 2027",
    locationRaw: "San Francisco, CA",
    postingUrl: "https://example.com/demo/helio-ai-pm",
    compensationText: "$58/hr",
    description:
      "Helio Systems builds the evaluation platform that enterprise teams use to ship large language model features safely. As an AI Product Management intern you will own a slice of the evaluation product: writing the spec, running user interviews with machine learning engineers, and shipping with a dedicated pod of four engineers and a designer. You will define what 'good' means for a model-graded eval, instrument the funnel, and present your findings to the product leadership team at the end of the summer. We are looking for undergraduate students graduating in 2027 or 2028 with a technical background and an unusual amount of product taste. Visa sponsorship is available for this position, and Helio will sponsor H-1B petitions for interns who convert to full-time roles. Students on CPT and OPT are welcome to apply.",
  },
  {
    demonstrates: "CPT/OPT accepted, no long-term sponsorship promise — the common good case",
    companyName: "Northwind Analytics",
    title: "Machine Learning Engineering Intern",
    locationRaw: "Seattle, WA",
    postingUrl: "https://example.com/demo/northwind-mle",
    compensationText: "$52/hr",
    description:
      "Join the ranking team at Northwind Analytics for a twelve-week summer internship. You will train and evaluate gradient-boosted and neural ranking models over a corpus of several billion documents, run offline experiments, and ship at least one model to an online A/B test. Our stack is Python, PyTorch, and Ray on Kubernetes. You will be paired with a full-time mentor and expected to write a design document before you write production code. Open to undergraduate and master's students returning to school after the internship. Candidates authorized to work in the United States under CPT or OPT are eligible for this position.",
  },
  {
    demonstrates: "Silence on sponsorship — rules must not invent a verdict",
    companyName: "Cobalt Grid",
    title: "Software Engineering Intern, Platform",
    locationRaw: "Austin, TX",
    postingUrl: "https://example.com/demo/cobalt-swe",
    compensationText: "$45/hr",
    description:
      "Cobalt Grid is hiring software engineering interns for the platform team. You will work on the internal deployment system used by every product team in the company: a control plane written in Go, a scheduler, and the CLI engineers reach for a hundred times a day. Projects are scoped so that a strong intern ships to production in the first three weeks. We look for undergraduates with solid data structures fundamentals and at least one substantial project or prior internship. Summer 2027, twelve weeks, on site in Austin with relocation support.",
  },
  {
    demonstrates: "Hard reject — explicit no-sponsorship language",
    companyName: "Ironleaf Robotics",
    title: "Perception Engineering Intern",
    locationRaw: "Pittsburgh, PA",
    postingUrl: "https://example.com/demo/ironleaf-perception",
    compensationText: "$47/hr",
    description:
      "Ironleaf Robotics builds autonomous material-handling robots for warehouses. The perception intern will work on multi-camera calibration, sensor fusion between lidar and stereo vision, and the evaluation harness that gates every perception release. Strong C++ and some exposure to ROS expected. This is an on-site role in Pittsburgh. Please note that Ironleaf is not able to provide visa sponsorship for this position now or in the future, and candidates must have permanent authorization to work in the United States without sponsorship.",
  },
  {
    demonstrates: "Hard reject — citizenship requirement",
    companyName: "Meridian Defense Labs",
    title: "Applied AI Intern",
    locationRaw: "Arlington, VA",
    postingUrl: "https://example.com/demo/meridian-applied-ai",
    compensationText: "$50/hr",
    description:
      "Meridian Defense Labs applies machine learning to sensor data for government customers. Interns contribute to model development, data pipeline work, and evaluation. This position requires U.S. citizenship as a condition of employment due to the nature of the customer contracts involved. Applicants must be United States citizens; we are unable to consider candidates who require sponsorship now or in the future.",
  },
  {
    demonstrates: "Hard reject — security clearance requirement",
    companyName: "Redstone Analytics Group",
    title: "Data Science Intern",
    locationRaw: "Huntsville, AL",
    postingUrl: "https://example.com/demo/redstone-ds",
    compensationText: "$44/hr",
    description:
      "Redstone Analytics Group seeks a data science intern to support mission analytics. Work includes exploratory analysis, dashboarding, and statistical modeling on operational datasets. Applicants must be able to obtain and maintain an active Secret-level security clearance before the internship begins.",
  },
  {
    demonstrates: "Future sponsorship possible — the ambiguous middle the rules must flag, not resolve",
    companyName: "Lattice Compute",
    title: "AI Engineering Intern, Inference",
    locationRaw: "Remote (US)",
    postingUrl: "https://example.com/demo/lattice-inference",
    compensationText: "$55/hr",
    description:
      "Lattice Compute runs a high-throughput inference platform for open-weight models. The inference intern will work on batching strategy, KV-cache management, and the benchmark suite that decides which kernels ship. Expect to read CUDA even if you do not write much of it. This is a remote position open to candidates located in the United States. Sponsorship may be considered for interns who convert to full-time roles, on a case-by-case basis.",
  },
  {
    demonstrates: "APM program, high company quality, deadline pressure",
    companyName: "Corvus Financial",
    title: "Associate Product Manager Intern",
    locationRaw: "New York, NY",
    postingUrl: "https://example.com/demo/corvus-apm",
    compensationText: "$60/hr",
    deadline: at(11),
    description:
      "The Corvus APM internship is the entry point to our full-time associate product manager program. Interns are embedded in a product pod, own a measurable outcome for the summer, and present to the head of product in the final week. Past interns have shipped changes to the onboarding funnel, the fraud review console, and the internal experimentation platform. We hire the majority of our full-time APMs from this program. Open to undergraduates graduating between December 2027 and June 2028. International students are welcome to apply, and we accept candidates working under CPT.",
  },
  {
    demonstrates: "Research role, PhD-leaning — undergrad eligibility should pull the score down",
    companyName: "Solace Research",
    title: "Research Intern, Interpretability",
    locationRaw: "Berkeley, CA",
    postingUrl: "https://example.com/demo/solace-interp",
    compensationText: "$65/hr",
    description:
      "Solace Research is looking for research interns to work on mechanistic interpretability of transformer language models. You will run experiments on sparse autoencoders, probe feature circuits, and write up results targeting a workshop submission. This role is intended for PhD students in their third year or later; exceptional master's students will be considered. Publication record strongly preferred. Sponsorship available.",
  },
  {
    demonstrates: "Low compensation signal — unpaid, should sink regardless of brand",
    companyName: "Bright Harbor Foundation",
    title: "Data Science Intern (Unpaid)",
    locationRaw: "Remote",
    postingUrl: "https://example.com/demo/brightharbor-ds",
    compensationText: "Unpaid",
    description:
      "Bright Harbor Foundation is seeking a volunteer data science intern to help analyze program outcomes for our education initiatives. This is an unpaid, remote, part-time position of roughly ten hours per week. You will work with survey data in Python, build a small dashboard, and present findings to the program team. Great for a student who wants portfolio work with real social impact.",
  },
  {
    demonstrates: "Hybrid arrangement + technical PM, mid-band",
    companyName: "Vantage Health",
    title: "Technical Product Manager Intern",
    locationRaw: "Boston, MA",
    postingUrl: "https://example.com/demo/vantage-tpm",
    compensationText: "$48/hr",
    description:
      "Vantage Health builds clinical decision support software used by hospital systems. The technical product management intern will work with the data platform team on the pipeline that ingests and normalizes electronic health record feeds. You will write requirements, run acceptance testing against real integration partners, and help triage the issues that come back. Hybrid schedule, three days a week in our Boston office. Undergraduates and recent graduates welcome.",
  },
  {
    demonstrates: "Strong fit but stale posting — freshness penalty",
    companyName: "Quill & Ledger",
    title: "AI Product Intern",
    locationRaw: "Chicago, IL",
    postingUrl: "https://example.com/demo/quill-ai-product",
    compensationText: "$50/hr",
    description:
      "Quill & Ledger is modernizing accounting workflows with language models. The AI product intern will work directly with the founding team on the document understanding product: defining the extraction taxonomy, building the labeling process, and measuring accuracy against customer ground truth. You will talk to customers weekly. We are a small team, so you will own something real. Undergraduate students graduating in 2028 are encouraged to apply. We support CPT and OPT.",
  },
  {
    demonstrates: "Non-US location — eligibility gate",
    companyName: "Aurora Labs Berlin",
    title: "Machine Learning Intern",
    locationRaw: "Berlin, Germany",
    postingUrl: "https://example.com/demo/aurora-berlin",
    compensationText: "€2,400/month",
    description:
      "Aurora Labs is hiring a machine learning intern for our Berlin office. You will work on speech models for European languages, focusing on low-resource fine-tuning and evaluation. The internship runs six months and is intended for students enrolled at a European university. German language skills are helpful but not required; the working language is English.",
  },
  {
    demonstrates: "Rotational program, broad fit",
    companyName: "Summit Grid Energy",
    title: "Product Rotational Intern",
    locationRaw: "Denver, CO",
    postingUrl: "https://example.com/demo/summit-rotational",
    compensationText: "$43/hr",
    description:
      "The Summit Grid rotational internship moves you through three four-week placements: product analytics, customer platform, and grid operations tooling. You will finish the summer with a written recommendation to the leadership team on where the product should invest next. This program is designed for undergraduates who are still deciding between product, analytics, and engineering. Denver based, hybrid.",
  },
  {
    demonstrates: "Strong untracked candidate — gives the review queue something to say yes to",
    companyName: "Beacon Systems",
    title: "AI Engineering Intern, Developer Tools",
    locationRaw: "San Francisco, CA",
    postingUrl: "https://example.com/demo/beacon-ai-eng",
    compensationText: "$56/hr",
    deadline: at(19),
    description:
      "Beacon Systems builds the code review assistant used by several thousand engineering teams. The AI engineering intern will work on retrieval over large monorepos: chunking strategy, index freshness, and the evaluation set that decides whether a change to retrieval actually helped. You will write Python and TypeScript, read a great deal of other people's code, and own an evaluation you designed yourself. We look for undergraduates graduating in 2027 or 2028 with a strong systems foundation and evidence that you build things without being asked. Visa sponsorship is available for this role, and students on CPT and OPT are encouraged to apply.",
  },
  {
    demonstrates: "Mid-strong untracked candidate with a near deadline",
    companyName: "Kestrel Data",
    title: "Data Science Intern, Growth",
    locationRaw: "New York, NY",
    postingUrl: "https://example.com/demo/kestrel-ds",
    compensationText: "$50/hr",
    deadline: at(6),
    description:
      "Kestrel Data is hiring a data science intern for the growth team. You will design and analyze experiments across the signup funnel, build the metrics that the weekly business review runs on, and work with engineers to instrument what is currently guesswork. Comfort with SQL is required; comfort with causal inference is a real advantage. This is a twelve-week summer internship in our New York office, hybrid three days a week. Open to undergraduate and master's students. International students are welcome to apply.",
  },
  {
    demonstrates: "Product role at a strong company, no sponsorship language at all",
    companyName: "Thornfield Commerce",
    title: "Product Management Intern, AI Platform",
    locationRaw: "Remote (US)",
    postingUrl: "https://example.com/demo/thornfield-pm",
    compensationText: "$54/hr",
    description:
      "Thornfield Commerce powers checkout for mid-market online retailers. The AI platform product intern will work on the fraud-decisioning product: understanding where the current model creates false declines, quantifying the revenue cost, and specifying the review tooling that lets an analyst overturn a decision quickly. You will spend time with the risk analysts who use the tool every day. This is a fully remote position for candidates based in the United States. Undergraduates graduating in 2028 are encouraged to apply.",
  },
  {
    demonstrates: "Deadline already passed — should show as closed/overdue in the calendar",
    companyName: "Halcyon Media",
    title: "Applied AI Intern, Recommendations",
    locationRaw: "Los Angeles, CA",
    postingUrl: "https://example.com/demo/halcyon-recs",
    compensationText: "$49/hr",
    deadline: at(-6),
    description:
      "Halcyon Media is hiring an applied AI intern for the recommendations team. You will work on candidate generation and ranking for the video feed, run offline evaluations, and help ship an online experiment. Python and one of PyTorch or TensorFlow required. Undergraduate or master's students graduating 2027-2028. We accept CPT and OPT candidates.",
  },
];

/* Applications the demo starts with, keyed by posting URL so the tracker,
   calendar and analytics pages all have something real to render. Stages are
   spread deliberately across the funnel — a tracker where everything sits in
   INTERESTED tells a reader nothing about how the board behaves. */
const TRACKED: Array<{
  url: string;
  stage:
    | "INTERESTED"
    | "PREPARING"
    | "READY_TO_APPLY"
    | "APPLIED"
    | "ONLINE_ASSESSMENT"
    | "RECRUITER_SCREEN"
    | "TECHNICAL_INTERVIEW"
    | "FINAL_INTERVIEW"
    | "OFFER"
    | "REJECTED";
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  /** Stage, note, days-ago — written as real history rows. */
  history: Array<[stage: string, note: string | null, daysAgo: number]>;
  nextAction?: string;
  followUpInDays?: number;
  appliedDaysAgo?: number;
  finalOutcome?: string;
  rejectionReason?: string;
}> = [
  {
    url: "https://example.com/demo/helio-ai-pm",
    stage: "FINAL_INTERVIEW",
    priority: "URGENT",
    nextAction: "Prepare the product teardown for the final round",
    followUpInDays: 3,
    appliedDaysAgo: 34,
    history: [
      ["INTERESTED", "Top of the list — sponsorship is explicit.", 40],
      ["PREPARING", "Drafted the eval-tooling case study.", 38],
      ["APPLIED", null, 34],
      ["RECRUITER_SCREEN", "30 min with the recruiter. Team is 4 eng + 1 design.", 24],
      ["TECHNICAL_INTERVIEW", "Metrics design question — went well.", 14],
      ["FINAL_INTERVIEW", "Panel scheduled with the head of product.", 4],
    ],
  },
  {
    url: "https://example.com/demo/corvus-apm",
    stage: "ONLINE_ASSESSMENT",
    priority: "HIGH",
    nextAction: "Finish the case assessment before the deadline",
    followUpInDays: 2,
    appliedDaysAgo: 12,
    history: [
      ["INTERESTED", "APM program converts to full-time.", 18],
      ["APPLIED", null, 12],
      ["ONLINE_ASSESSMENT", "Case study sent — 5 days to complete.", 5],
    ],
  },
  {
    url: "https://example.com/demo/northwind-mle",
    stage: "APPLIED",
    priority: "HIGH",
    nextAction: "Follow up with the recruiter if nothing by Friday",
    followUpInDays: 5,
    appliedDaysAgo: 9,
    history: [
      ["INTERESTED", null, 16],
      ["PREPARING", "Reread the ranking-systems notes.", 13],
      ["APPLIED", null, 9],
    ],
  },
  {
    url: "https://example.com/demo/lattice-inference",
    stage: "RECRUITER_SCREEN",
    priority: "MEDIUM",
    nextAction: "Ask directly whether full-time sponsorship is realistic",
    followUpInDays: 1,
    appliedDaysAgo: 20,
    history: [
      ["INTERESTED", "Sponsorship is case-by-case — worth asking early.", 26],
      ["APPLIED", null, 20],
      ["RECRUITER_SCREEN", "Screen booked.", 2],
    ],
  },
  {
    url: "https://example.com/demo/quill-ai-product",
    stage: "PREPARING",
    priority: "MEDIUM",
    nextAction: "Tailor the résumé toward document-understanding work",
    followUpInDays: 4,
    history: [
      ["INTERESTED", null, 9],
      ["PREPARING", "Small team — a referral would matter here.", 6],
    ],
  },
  {
    url: "https://example.com/demo/vantage-tpm",
    stage: "READY_TO_APPLY",
    priority: "MEDIUM",
    nextAction: "Submit — everything is drafted",
    followUpInDays: 1,
    history: [
      ["INTERESTED", null, 7],
      ["PREPARING", null, 5],
      ["READY_TO_APPLY", "Résumé and cover letter done.", 1],
    ],
  },
  {
    url: "https://example.com/demo/cobalt-swe",
    stage: "REJECTED",
    priority: "LOW",
    appliedDaysAgo: 45,
    finalOutcome: "Rejected after the technical round",
    rejectionReason: "Went with a candidate who had prior distributed-systems experience",
    history: [
      ["INTERESTED", null, 52],
      ["APPLIED", null, 45],
      ["TECHNICAL_INTERVIEW", "Two systems questions, one algorithms.", 30],
      ["REJECTED", "Rejected — kept the recruiter contact for next cycle.", 22],
    ],
  },
  {
    url: "https://example.com/demo/summit-rotational",
    stage: "INTERESTED",
    priority: "LOW",
    history: [["INTERESTED", "Backup option — rotational, broad.", 3]],
  },
];

export async function seedDemo(prisma: PrismaClient, userId: string): Promise<void> {
  // ── Listings, scored by the real pipeline ───────────────────────────────
  const byUrl = new Map<string, string>();
  for (const p of POSTINGS) {
    // `demonstrates` is a note to whoever reads this file, not something the
    // pipeline accepts — destructured purely to drop it from the input.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { demonstrates, ...input } = p;
    const tracked = TRACKED.some((t) => t.url === input.postingUrl);
    const { listingId } = await ingestManualPosting({ ...input, track: tracked });
    if (input.postingUrl) byUrl.set(input.postingUrl, listingId);
  }

  // Mark everything the demo created as sample data, so the app's own
  // "clear sample records" control can wipe it exactly like seeded samples.
  const listingIds = [...byUrl.values()];
  await prisma.internshipListing.updateMany({
    where: { id: { in: listingIds } },
    data: { isSample: true },
  });
  const companyIds = (
    await prisma.internshipListing.findMany({
      where: { id: { in: listingIds } },
      select: { companyId: true },
    })
  ).map((l) => l.companyId);
  await prisma.company.updateMany({
    where: { id: { in: companyIds } },
    data: { isSample: true },
  });

  // ── Tracker: stages, history, follow-ups ────────────────────────────────
  for (const t of TRACKED) {
    const listingId = byUrl.get(t.url);
    if (!listingId) continue;
    const app = await prisma.application.findFirst({ where: { userId, listingId } });
    if (!app) continue;

    await prisma.application.update({
      where: { id: app.id },
      data: {
        stage: t.stage,
        priority: t.priority,
        nextAction: t.nextAction ?? null,
        followUpAt: t.followUpInDays === undefined ? null : at(t.followUpInDays),
        appliedAt: t.appliedDaysAgo === undefined ? null : at(-t.appliedDaysAgo),
        acceptedAt: at(-(t.history.at(0)?.[2] ?? 1)),
        lastActivityAt: at(-(t.history.at(-1)?.[2] ?? 0)),
        finalOutcome: t.finalOutcome ?? null,
        rejectionReason: t.rejectionReason ?? null,
      },
    });

    // The tracker reads its timeline from these rows, so a stage set without
    // history renders an application that arrived out of nowhere.
    await prisma.applicationStatusHistory.deleteMany({ where: { applicationId: app.id } });
    let from: string | null = null;
    for (const [stage, note, daysAgo] of t.history) {
      await prisma.applicationStatusHistory.create({
        data: {
          applicationId: app.id,
          fromStage: from as never,
          toStage: stage as never,
          note,
          changedAt: at(-daysAgo),
        },
      });
      from = stage;
    }
  }

  // ── Deadlines the calendar can render ───────────────────────────────────
  const deadlineSpecs: Array<[url: string, kind: string, title: string, days: number, estimated: boolean]> = [
    ["https://example.com/demo/corvus-apm", "ASSESSMENT_DEADLINE", "Corvus case assessment due", 2, false],
    ["https://example.com/demo/helio-ai-pm", "INTERVIEW", "Helio final panel", 3, false],
    ["https://example.com/demo/vantage-tpm", "SUGGESTED_APPLY_BY", "Apply to Vantage Health", 4, true],
    ["https://example.com/demo/quill-ai-product", "SUGGESTED_APPLY_BY", "Apply to Quill & Ledger", 8, true],
    ["https://example.com/demo/lattice-inference", "FOLLOW_UP", "Follow up with Lattice recruiter", 1, false],
  ];
  for (const [url, kind, title, days, isEstimated] of deadlineSpecs) {
    const listingId = byUrl.get(url);
    if (!listingId) continue;
    const app = await prisma.application.findFirst({ where: { userId, listingId } });
    const exists = await prisma.deadline.findFirst({ where: { listingId, title } });
    if (exists) continue;
    await prisma.deadline.create({
      data: {
        kind: kind as never,
        title,
        dueAt: at(days, 17),
        isEstimated,
        listingId,
        applicationId: app?.id ?? null,
      },
    });
  }

  // ── Contacts ────────────────────────────────────────────────────────────
  const contactSpecs: Array<[name: string, position: string, relationship: string, url: string]> = [
    ["Dana Whitfield", "Technical Recruiter", "recruiter", "https://example.com/demo/helio-ai-pm"],
    ["Priya Raman", "Senior PM, Evaluation", "hiring manager", "https://example.com/demo/helio-ai-pm"],
    ["Marcus Oyelaran", "ML Engineer", "alum", "https://example.com/demo/northwind-mle"],
    ["Simone Vasquez", "University Recruiting", "recruiter", "https://example.com/demo/corvus-apm"],
  ];
  for (const [name, position, relationship, url] of contactSpecs) {
    const listingId = byUrl.get(url);
    if (!listingId) continue;
    const listing = await prisma.internshipListing.findUnique({
      where: { id: listingId },
      select: { companyId: true },
    });
    const existing = await prisma.contact.findFirst({ where: { name } });
    if (existing) continue;
    await prisma.contact.create({
      data: {
        name,
        position,
        relationship,
        companyId: listing?.companyId ?? null,
        email: `${name.split(" ")[0]!.toLowerCase()}@example.com`,
        lastContactedAt: at(-7),
        nextFollowUpAt: at(4),
        notesText: "Demo contact — not a real person.",
      },
    });
  }

  // ── Run history ─────────────────────────────────────────────────────────
  // The full deployment writes these from its scheduled collector. The demo
  // has no collector, so a short, plausible history is seeded instead — enough
  // for the runs pages to show what a healthy week looks like, including the
  // partial run, which is the one worth being able to read.
  const runSpecs: Array<[daysAgo: number, status: string, fetched: number, added: number, queued: number, mins: number]> = [
    [6, "SUCCESS", 412, 9, 4, 3],
    [5, "SUCCESS", 388, 4, 2, 3],
    [4, "PARTIAL", 201, 2, 1, 7],
    [3, "SUCCESS", 401, 7, 3, 3],
    [2, "SUCCESS", 377, 3, 1, 2],
    [1, "SUCCESS", 395, 6, 2, 3],
  ];
  for (const [daysAgo, status, fetched, added, queued, mins] of runSpecs) {
    const runDate = dayOnly(-daysAgo);
    const exists = await prisma.agentRun.findFirst({ where: { runDate } });
    if (exists) continue;
    const startedAt = at(-daysAgo, 6);
    const run = await prisma.agentRun.create({
      data: {
        runDate,
        trigger: "SCHEDULED",
        status: status as never,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + mins * 60_000),
        stats: { fetched, added, queued, merged: Math.max(0, fetched - added - 300) },
        version: "demo",
      },
    });
    const events: Array<[stage: string, level: string, message: string]> = [
      ["collect", "INFO", `Collected ${fetched} postings across the enabled sources.`],
      ["dedupe", "INFO", `${fetched - added} already known; ${added} new.`],
      ["eligibility", "INFO", "Season and location gates applied."],
      ["sponsorship", "INFO", "Deterministic sponsorship rules evaluated."],
      ["score", "INFO", `${added} listings scored.`],
      ["queue", "INFO", `${queued} listings met the review threshold.`],
    ];
    if (status === "PARTIAL") {
      events.splice(1, 0, [
        "collect",
        "WARN",
        "One source timed out after 3 attempts; the run continued with the rest.",
      ]);
    }
    for (const [stage, level, message] of events) {
      await prisma.agentRunEvent.create({
        data: { runId: run.id, stage, level: level as never, message },
      });
    }
  }

  // ── Reports ─────────────────────────────────────────────────────────────
  for (const [daysAgo, queued] of [
    [1, 2],
    [3, 3],
    [6, 4],
  ] as const) {
    const reportDate = dayOnly(-daysAgo);
    const exists = await prisma.emailReport.findFirst({ where: { reportDate, kind: "daily" } });
    if (exists) continue;
    await prisma.emailReport.create({
      data: {
        reportDate,
        kind: "daily",
        subject: `Internship Scout — ${queued} to review`,
        htmlBody: `<h1>${queued} listings to review</h1><p>Demo report. The full deployment renders the day's queue here.</p>`,
        textBody: `${queued} listings to review.\n\nDemo report. The full deployment renders the day's queue here.`,
        sendMode: "DRY_RUN",
        skippedReason: "Demo build has no mail transport configured",
      },
    });
  }
}
