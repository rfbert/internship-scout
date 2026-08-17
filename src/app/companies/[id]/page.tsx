import Link from "next/link";
import { notFound } from "next/navigation";
import type { ScoreBand } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Figure, FigureStrip, PageFrame } from "@/components/register/page-frame";
import { Footnote, Legend, type LegendItem } from "@/components/register/footnote";
import { DotLeader, SectionRule } from "@/components/register/rule";
import { Dossier, DossierPanel } from "@/components/register/dossier";
import { Spectrum } from "@/components/register/spectrum";
import { Quote } from "@/components/register/well";
import { OutlineVerb } from "@/components/register/stamp";
import {
  Ledger,
  LedgerCell,
  LedgerHead,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { Band, Priority, Sponsorship } from "@/components/register/notation";
import { EmptyState, SampleBadge, rowRoleCls } from "@/components/ui";
import {
  BAND_LABELS,
  PRIORITY_WORDS,
  SPONSORSHIP_LABELS,
  STAGE_LABELS,
  TOKEN_TEXT,
  bandIsStruck,
  fmtAgo,
  stageGroupColor,
  stageGroupOf,
  upper,
} from "@/lib/format";
import { bandText, sponsorshipText } from "@/lib/notation";
import { readUiPrefs } from "@/server/ui-prefs";
import { fmtDateShortTz, fmtDateTz } from "@/lib/dates";
import {
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KIND_MARKS,
  LISTING_STATUS_LABELS,
  RELIABILITY_LABELS,
  RELIABILITY_PIPS,
  listingStatusColor,
  reliabilityColor,
} from "../meta";
import { OverviewForm } from "./overview-form";
import { EvidenceForm } from "./evidence-form";
import { NoteForm } from "./note-form";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   THE CORRESPONDENT'S DOSSIER — `/companies/[id]` (spec C5)

   One company, read as a paper file: the terms of the record and your own
   assessment at the top in a PULLED RECORD (the same carmine-edged frame the
   tracker uses, because this page IS a record lifted out of `/companies`),
   then the evidence file, then the ledgers — listings, applications, contacts
   — and finally the notes.

   THE QUERIES ARE UNTOUCHED (D4): the same `findFirst` with its four includes
   and the same two-way `Promise.all` beneath it, whose second leg is now the
   guarded `readUiPrefs()` (A5) — it carries the timezone this page always
   needed plus the notation the footnote legend needs in order to list only
   marks that are actually on screen.

   Six card frames are gone. A card said "these things are separate"; on a
   dossier every block is the same file, so section RULES separate them.

   Deviation from C5, recorded: the brief puts the quoted evidence `summary`
   in a `Well`. The built primitive disagrees with itself there — `well.tsx`
   reserves the well for INSTRUMENTS ("anything with a bar, tick or gauge")
   and ships `Quote` for exactly this case, a prose quotation on `--inset`
   with a `cite`. Prose in five dark instrument panels would also read as five
   charts. So the summary uses `Quote`, and the page's real instrument — the
   score spectrum of this company's listings — gets the well.
   ══════════════════════════════════════════════════════════════════════════ */

const LISTING_COLS: LedgerCol[] = [
  { label: "Title", w: "minmax(0,1fr)" },
  { label: "Status", w: "88px" },
  { label: "Score", w: "150px", align: "right" },
  { label: "Sponsorship", w: "168px" },
  { label: "Discovered", w: "96px", align: "right" },
];

const APPLICATION_COLS: LedgerCol[] = [
  { label: "Listing", w: "minmax(0,1fr)" },
  { label: "Stage", w: "160px" },
  { label: "Priority", w: "104px" },
  { label: "Last activity", w: "108px", align: "right" },
];

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const company = await prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      sponsorshipEvidence: {
        orderBy: [{ evidenceDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      },
      listings: {
        where: { deletedAt: null },
        orderBy: [{ currentScore: { sort: "desc", nulls: "last" } }, { discoveredAt: "desc" }],
      },
      contacts: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
      },
      notes: {
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!company) notFound();

  const [applications, prefs] = await Promise.all([
    prisma.application.findMany({
      where: { deletedAt: null, listing: { companyId: id } },
      include: { listing: { select: { title: true, isSample: true } } },
      orderBy: { lastActivityAt: "desc" },
    }),
    readUiPrefs(),
  ]);

  // `evidenceDate` is a calendar date off a filing or a statement; the other
  // two are true instants. `fmtDateTz` is right for both — it renders a
  // floating date-only value as its own day and an instant in the user's zone.
  const { timezone: tz, notation } = prefs;

  const hq = [company.hqCity, company.hqState, company.hqCountry].filter(Boolean).join(", ");
  const host = company.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null;

  const activeListings = company.listings.filter((l) => l.status === "ACTIVE");
  const strongEvidence = company.sponsorshipEvidence.filter((e) => e.reliability === "STRONG");

  // The spectrum reads the SAME rows the ledger below prints — it is their
  // shape, not a second sample. Listings with no score have no position on it.
  const spectrumPoints = company.listings
    .filter((l): l is typeof l & { currentScore: number; currentBand: ScoreBand } =>
      l.currentScore != null && l.currentBand != null
    )
    .map((l) => ({ id: l.id, score: l.currentScore, band: l.currentBand }));
  const sorted = spectrumPoints.map((p) => p.score).sort((a, b) => a - b);
  const median = sorted.length
    ? Math.round(
        sorted.length % 2
          ? sorted[(sorted.length - 1) / 2]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      )
    : undefined;

  /* ── The map key — only the marks actually on this screen ──────────────── */

  const legendItems: LegendItem[] = [];
  if (notation === "COMPACT") {
    const bands: ScoreBand[] = [];
    for (const l of company.listings) {
      if (l.currentBand && !bands.includes(l.currentBand)) bands.push(l.currentBand);
    }
    for (const b of bands) {
      legendItems.push({ mark: bandText(b, notation), meaning: BAND_LABELS[b].toLowerCase() });
    }
    const spons: NonNullable<(typeof company.listings)[number]["currentSponsorshipCategory"]>[] = [];
    for (const l of company.listings) {
      const c = l.currentSponsorshipCategory;
      if (c && !spons.includes(c)) spons.push(c);
    }
    for (const s of spons) {
      legendItems.push({
        mark: sponsorshipText(s, notation),
        meaning: SPONSORSHIP_LABELS[s].toLowerCase(),
      });
    }
  }
  if (company.sponsorshipEvidence.length > 0) {
    legendItems.push({ mark: "▪▪▪", meaning: "evidence reliability, out of three" });
  }

  return (
    <>
      <PageFrame
        eyebrow={`CORRESPONDENT DOSSIER · ${
          hq ? upper(hq) : "HQ UNRECORDED"
        } · SUMMER 2027`}
        title={company.name}
        figures={
          <>
            {host ? (
              <a
                href={company.website as string}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue underline-offset-2 hover:underline"
              >
                {host} <span aria-hidden>↗</span>
              </a>
            ) : (
              "NO WEBSITE ON FILE"
            )}
            <br />
            {[company.industry, company.sizeRange, company.stage].filter(Boolean).join(" · ") ||
              "No industry, size or stage recorded"}
          </>
        }
        verbs={
          <>
            <SampleBadge isSample={company.isSample} />
            <OutlineVerb href="/companies">All companies</OutlineVerb>
          </>
        }
      />

      <FigureStrip>
        <Figure
          value={company.priorityScore ?? "—"}
          label="Priority"
          sub="Your score"
          tone={company.priorityScore != null && company.priorityScore >= 70 ? "green" : undefined}
        />
        <Figure value={activeListings.length} label="Active" sub="Listings" />
        <Figure value={company.listings.length} label="All time" sub="Listings" />
        <Figure
          value={company.sponsorshipEvidence.length}
          label="Evidence"
          sub={strongEvidence.length > 0 ? `${strongEvidence.length} strong` : "None strong"}
          tone={strongEvidence.length > 0 ? "green" : undefined}
        />
        <Figure value={applications.length} label="Applications" sub="Tracked" href="/tracker" />
        <Figure value={company.contacts.length} label="Contacts" sub="On file" />
      </FigureStrip>

      {/* 1 · The record itself — terms on the left, your assessment on the
             right, inside the carmine-edged pulled frame. */}
      <Dossier label={`Company record — ${company.name}`}>
        <DossierPanel title="Terms of the record">
          <ul>
            <DotLeader label="Industry" value={company.industry ?? "—"} muted={!company.industry} />
            <DotLeader label="Size" value={company.sizeRange ?? "—"} muted={!company.sizeRange} />
            <DotLeader label="Stage" value={company.stage ?? "—"} muted={!company.stage} />
            <DotLeader label="HQ" value={hq || "—"} muted={!hq} title={hq || undefined} />
            <DotLeader
              label="Priority"
              value={company.priorityScore ?? "—"}
              muted={company.priorityScore == null}
              title="Your own 0–100 score. Feeds the company-quality scoring component."
            />
            <DotLeader
              label="On file since"
              value={upper(fmtDateShortTz(company.createdAt, tz))}
              title={fmtDateTz(company.createdAt, tz)}
            />
            <DotLeader label="Evidence" value={company.sponsorshipEvidence.length} muted={company.sponsorshipEvidence.length === 0} />
          </ul>
          {company.reputationNote || company.aiRelevance || company.internshipProgramNote ? null : (
            <p className="mt-3 text-[12px] text-ink-3">
              Nothing written up yet. The three notes on the right feed the company-quality
              component of every score at this company.
            </p>
          )}
        </DossierPanel>

        <DossierPanel title="Examiner's assessment" className="lg:col-span-2">
          <OverviewForm
            companyId={company.id}
            initial={{
              priorityScore: company.priorityScore,
              industry: company.industry,
              sizeRange: company.sizeRange,
              stage: company.stage,
              reputationNote: company.reputationNote,
              aiRelevance: company.aiRelevance,
              internshipProgramNote: company.internshipProgramNote,
            }}
          />
        </DossierPanel>
      </Dossier>

      {/* 2 · The evidence file. Historical sponsorship evidence is never a
             promise about a specific listing, so the caveat rides the rule
             itself rather than a subtitle nobody reads. */}
      <section className="mt-5">
        <SectionRule
          label="Sponsorship evidence"
          right={
            company.sponsorshipEvidence.length > 0
              ? `${company.sponsorshipEvidence.length} ON FILE · ${strongEvidence.length} STRONG`
              : "NONE ON FILE"
          }
        />
        <div className="rounded-b border border-t-0 border-rule bg-surface">
          {company.sponsorshipEvidence.length === 0 ? (
            <EmptyState
              title="No sponsorship evidence recorded"
              hint="Add H-1B filing data, employer statements, or verified reports below. Evidence here supports — but never replaces — per-listing sponsorship analysis."
            />
          ) : (
            <ul>
              {company.sponsorshipEvidence.map((e) => {
                const pips = RELIABILITY_PIPS[e.reliability];
                return (
                  <li key={e.id} className="border-b border-feint px-3.5 py-2.5 last:border-b-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.06em]">
                      <span
                        className="font-semibold text-ink-2"
                        title={EVIDENCE_KIND_LABELS[e.kind]}
                      >
                        {EVIDENCE_KIND_MARKS[e.kind]}
                      </span>
                      <span
                        className={`font-semibold ${TOKEN_TEXT[reliabilityColor(e.reliability)]}`}
                        title={`${RELIABILITY_LABELS[e.reliability]} reliability`}
                        aria-label={`${RELIABILITY_LABELS[e.reliability]} reliability, ${pips} of 3`}
                      >
                        {upper(RELIABILITY_LABELS[e.reliability])}{" "}
                        <span aria-hidden>{"▪".repeat(pips)}</span>
                      </span>
                      {e.evidenceDate ? (
                        <span className="text-ink-3" title={fmtDateTz(e.evidenceDate, tz)}>
                          {upper(fmtDateTz(e.evidenceDate, tz))}
                        </span>
                      ) : (
                        <span className="text-ink-3">UNDATED</span>
                      )}
                    </div>
                    <Quote
                      source={
                        e.sourceUrl ? (
                          <a
                            href={e.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue underline-offset-2 hover:underline"
                          >
                            {e.sourceName} <span aria-hidden>↗</span>
                          </a>
                        ) : (
                          e.sourceName
                        )
                      }
                    >
                      {e.summary}
                    </Quote>
                  </li>
                );
              })}
            </ul>
          )}
          <EvidenceForm companyId={company.id} />
        </div>
      </section>

      {/* 3 · Every posting ever discovered here, closed ones included — the
             point of a company file is the pattern across seasons. */}
      <section className="mt-5">
        <SectionRule
          label="Listings"
          right={`${activeListings.length} ACTIVE · ${company.listings.length} EVER DISCOVERED`}
        />
        {spectrumPoints.length > 1 ? (
          <div className="pb-2.5 pt-2.5">
            <Spectrum points={spectrumPoints} median={median} label="Listing spectrum" />
          </div>
        ) : null}
        {company.listings.length === 0 ? (
          <div className="rounded-b border border-t-0 border-rule bg-surface">
            <EmptyState
              title="No listings discovered yet"
              hint="This company may still be worth tracking — set a priority score above and its future postings will surface with that context."
            />
          </div>
        ) : (
          <Ledger
            cols={LISTING_COLS}
            minWidth={880}
            label={`Listings at ${company.name}`}
            className={spectrumPoints.length > 1 ? "" : "rounded-t-none border-t-0"}
          >
            <LedgerHead cols={LISTING_COLS} />
            <LedgerSection>
              {company.listings.map((l) => (
                <LedgerRow key={l.id} struck={bandIsStruck(l.currentBand)}>
                  <LedgerCell title={l.title}>
                    <span data-row-title className="text-[13px] font-semibold">
                      {l.postingUrl ? (
                        <a
                          href={l.postingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline-offset-2 hover:underline"
                        >
                          {l.title} <span aria-hidden className="text-ink-3">↗</span>
                        </a>
                      ) : (
                        l.title
                      )}
                    </span>{" "}
                    <SampleBadge isSample={l.isSample || company.isSample} />
                  </LedgerCell>

                  <LedgerCell mono>
                    <span
                      className={`font-semibold uppercase tracking-[0.06em] ${
                        TOKEN_TEXT[listingStatusColor(l.status)]
                      }`}
                    >
                      {upper(LISTING_STATUS_LABELS[l.status])}
                    </span>
                  </LedgerCell>

                  <LedgerCell align="right">
                    {l.currentBand || l.currentScore != null ? (
                      <Band band={l.currentBand} score={l.currentScore} />
                    ) : (
                      <span className="font-mono text-[11px] text-ink-3">—</span>
                    )}
                  </LedgerCell>

                  <LedgerCell>
                    {l.currentSponsorshipCategory ? (
                      <Sponsorship
                        category={l.currentSponsorshipCategory}
                        confidence={l.currentSponsorshipConfidence}
                      />
                    ) : (
                      <span
                        className={`font-mono text-[10.5px] font-medium ${TOKEN_TEXT.ochre}`}
                        title="This listing has not been through sponsorship analysis yet."
                      >
                        NOT ANALYZED
                      </span>
                    )}
                  </LedgerCell>

                  <LedgerCell mono align="right" muted>
                    {upper(fmtDateShortTz(l.discoveredAt, tz))}
                  </LedgerCell>
                </LedgerRow>
              ))}
            </LedgerSection>
          </Ledger>
        )}
      </section>

      {/* 4 · What is in flight, and who you know. Two ledgers side by side
             below xl; each keeps its own minimum measure. */}
      <div className="mt-5 grid gap-x-6 gap-y-5 xl:grid-cols-2">
        <section className="min-w-0">
          <SectionRule
            label="Applications"
            right={applications.length > 0 ? `${applications.length} TRACKED` : "NONE"}
          />
          {applications.length === 0 ? (
            <div className="rounded-b border border-t-0 border-rule bg-surface">
              <EmptyState
                title="No applications yet"
                hint="Accept a listing in the Review Queue to start tracking an application here."
              />
            </div>
          ) : (
            <Ledger
              cols={APPLICATION_COLS}
              minWidth={560}
              label={`Applications to ${company.name}`}
              className="rounded-t-none border-t-0"
            >
              <LedgerHead cols={APPLICATION_COLS} />
              <LedgerSection>
                {applications.map((a) => (
                  <LedgerRow key={a.id} tick={stageGroupColor(stageGroupOf(a.stage))}>
                    <LedgerCell title={a.listing.title}>
                      <Link href="/tracker" className="text-[13px] underline-offset-2 hover:underline">
                        <span className="font-semibold">{a.listing.title}</span>
                      </Link>{" "}
                      <SampleBadge isSample={a.listing.isSample} />
                    </LedgerCell>
                    <LedgerCell mono>
                      <span
                        className={`font-semibold uppercase tracking-[0.06em] ${
                          TOKEN_TEXT[stageGroupColor(stageGroupOf(a.stage))]
                        }`}
                      >
                        {upper(STAGE_LABELS[a.stage])}
                      </span>
                    </LedgerCell>
                    <LedgerCell mono>
                      <span className="inline-flex items-center gap-1.5">
                        <Priority priority={a.priority} />
                        <span className="uppercase tracking-[0.06em] text-ink-2">
                          {upper(PRIORITY_WORDS[a.priority])}
                        </span>
                      </span>
                    </LedgerCell>
                    <LedgerCell mono align="right" muted>
                      {fmtAgo(a.lastActivityAt)}
                    </LedgerCell>
                  </LedgerRow>
                ))}
              </LedgerSection>
            </Ledger>
          )}
        </section>

        <section className="min-w-0">
          <SectionRule
            label="Contacts"
            right={company.contacts.length > 0 ? `${company.contacts.length} ON FILE` : "NONE"}
          />
          <div className="rounded-b border border-t-0 border-rule bg-surface">
            {company.contacts.length === 0 ? (
              <EmptyState
                title="No contacts at this company"
                hint="Alumni, recruiters, and warm intros recorded in the tracker will show up here."
              />
            ) : (
              <ul>
                {company.contacts.map((c) => (
                  <li key={c.id} className="border-b border-feint px-3.5 py-2.5 last:border-b-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                      <span className="font-semibold">{c.name}</span>
                      {c.position ? <span className={rowRoleCls}>— {c.position}</span> : null}
                      {c.relationship ? (
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                          {upper(c.relationship)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 font-mono text-[10.5px] text-ink-3">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="text-blue underline-offset-2 hover:underline"
                        >
                          {c.email}
                        </a>
                      ) : null}
                      {c.linkedinUrl ? (
                        <a
                          href={c.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue underline-offset-2 hover:underline"
                        >
                          LINKEDIN <span aria-hidden>↗</span>
                        </a>
                      ) : null}
                      {c.lastContactedAt ? (
                        <span title={fmtDateTz(c.lastContactedAt, tz)}>
                          LAST CONTACTED {fmtAgo(c.lastContactedAt)}
                        </span>
                      ) : (
                        <span>NEVER CONTACTED</span>
                      )}
                    </div>
                    {c.notesText ? (
                      <p className="mt-1 text-[12px] text-ink-3">{c.notesText}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* 5 · The examiner's own notes. Pinned ones float to the top and say so
             in a word, not only in their position. */}
      <section className="mt-5">
        <SectionRule
          label="Notes"
          right={
            company.notes.length > 0
              ? `${company.notes.length} · PINNED FIRST`
              : "NONE"
          }
        />
        <div className="rounded-b border border-t-0 border-rule bg-surface">
          <NoteForm companyId={company.id} />
          {company.notes.length === 0 ? (
            <EmptyState
              title="No notes yet"
              hint="Capture recruiter conversations, program research, or anything worth remembering about this company."
            />
          ) : (
            <ul className="border-t border-rule">
              {company.notes.map((n) => (
                <li key={n.id} className="border-b border-feint px-3.5 py-2.5 last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                    {n.pinned ? (
                      <span
                        className={`font-semibold ${TOKEN_TEXT.carmine}`}
                        title="Pinned — kept at the top of this company's notes."
                      >
                        PINNED
                      </span>
                    ) : null}
                    <span title={fmtDateTz(n.createdAt, tz)}>{upper(fmtDateTz(n.createdAt, tz))}</span>
                    <span>{fmtAgo(n.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px]">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Footnote
        legend={
          <>
            {company.listings.length} {company.listings.length === 1 ? "LISTING" : "LISTINGS"} ·{" "}
            {company.sponsorshipEvidence.length} EVIDENCE ·{" "}
            {applications.length} {applications.length === 1 ? "APPLICATION" : "APPLICATIONS"}
            {legendItems.length > 0 ? " · " : null}
            <Legend items={legendItems} />
          </>
        }
        keys={
          /* No keycap: this page binds no keys, and a printed key must be a
             real one (D1). The strip carries the caveat instead — it is the
             one thing on the page that must not be misread. */
          <span>EVIDENCE IS COMPANY HISTORY, NEVER A GUARANTEE FOR A LISTING</span>
        }
      />
    </>
  );
}
