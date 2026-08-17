import Link from "next/link";
import type { Prisma, ScoreBand } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Figure, FigureStrip, PageFrame } from "@/components/register/page-frame";
import { Footnote, Keys, Legend, type LegendItem } from "@/components/register/footnote";
import {
  Ledger,
  LedgerCell,
  LedgerHead,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { Band } from "@/components/register/notation";
import { EmptyState, SampleBadge, btn, inputCls, rowRoleCls } from "@/components/ui";
import { BAND_LABELS, TOKEN_TEXT } from "@/lib/format";
import { bandText } from "@/lib/notation";
import { readUiPrefs } from "@/server/ui-prefs";
import { evidenceVerdict } from "./meta";
import { compareCompanies } from "./ranking";
import { PriorityInput } from "./priority-input";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   THE REGISTER OF CORRESPONDENTS — `/companies` (spec C5)

   A company is not a listing. It stays on the books with zero active postings,
   because sponsorship history and program quality are what make its NEXT
   posting worth reading — so this page is a standing register, one 34px line
   per correspondent, not a search result.

   THE QUERY IS UNTOUCHED (D4): the same single `findMany` with the same two
   includes and the same JS derivation. Only the rendering is new.

   Two later changes, both about what the page LEADS with rather than what it
   loads: the sort gained a sample-sinking first key (`./ranking.ts`), and the
   two columns that printed a dash on every row folded into the company's own
   cell (see the note on COLS below). Nothing was dropped from the read.
   ══════════════════════════════════════════════════════════════════════════ */

/* `Industry / stage` and `HQ` are gone, and this is a data finding rather than
   a taste one. Of the 278 companies on file, 2 carry an industry, 2 carry a
   stage, and ZERO carry any part of an HQ — no city, no state, no country. The
   agent pipeline does not populate these fields; nothing does. So the two
   columns held roughly a third of the row to print a dash 278 times, and did
   it in two different typefaces — the same U+2014 in the proportional face for
   the industry and in the mono face for the HQ, which is why they read as two
   different glyphs for one meaning. (The review called this an em dash beside
   an en dash. The characters were identical; only the faces differed.)

   Both facts now ride the company's own cell, printed only when they exist, so
   the two companies that have an industry show it and the other 276 show a
   clean name. `EVIDENCE` stays: it looks constant in the first screen but is
   not — 64 companies have a record on file and 214 read NONE ON FILE.

   Deleting two columns leaves ~370px of slack, and slack in a grid has to land
   in some track. Rather than pool it behind the company names as a gutter, it
   goes to the one fact this register was missing: WHAT the company currently
   has open. `BEST BAND` printed `50 REACH` with no referent — a score for a
   listing the page never named. The title beside it is that listing, and it is
   populated on the 231 of 278 rows that have an active posting. It costs no
   query: `title` joins a `select` the page already runs. */
/* Both flexible tracks are FLOORED, and the second floor is not cosmetic: a
   `minmax(0,1fr)` title track collapsed to 100px at a 1100px viewport while its
   own head label needed 140, and a `whitespace-nowrap` head does not truncate —
   `BEST ACTIVE LISTING` printed straight over `LISTINGS`. The fixed tracks were
   measured against their widest real value (the widest band, `57 WORTH
   REVIEWING`, sets `Best band` at 118px) rather than left at the round numbers
   they shipped with, which is what buys the two floors their room. */
const COLS: LedgerCol[] = [
  { label: "Company", w: "minmax(240px,0.8fr)" },
  { label: "Best active listing", w: "minmax(148px,1fr)" },
  { label: "Listings", w: "88px", align: "right" },
  { label: "Apps", w: "60px", align: "right" },
  { label: "Best band", w: "124px", align: "right" },
  { label: "Evidence", w: "112px" },
  { label: "Priority", w: "104px", align: "right" },
];

/** Below this the ledger scrolls inside itself — the page never does. */
// 488px of fixed tracks + 84px of row chrome + 388px of floors = 960. At 1000
// the register clears a 1100px laptop (1010px of content) without scrolling at
// all, where the eight-column version dragged two empty tracks past the fold.
const MIN_WIDTH = 1000;

/**
 * "We have nothing for this cell" — one glyph, one face, one ink, wherever it
 * appears on the row. Two columns saying the same absence in two typefaces is
 * what made the old INDUSTRY and HQ pair read as two different marks.
 */
const NOTHING_HERE = "font-mono text-[11px] text-ink-3";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const where: Prisma.CompanyWhereInput = {
    deletedAt: null,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };

  const companies = await prisma.company.findMany({
    where,
    include: {
      sponsorshipEvidence: { select: { reliability: true } },
      listings: {
        where: { deletedAt: null },
        select: {
          status: true,
          title: true,
          currentScore: true,
          currentBand: true,
          applications: { where: { deletedAt: null }, select: { id: true } },
        },
      },
    },
  });

  // Guarded read — see src/server/ui-prefs.ts for why this is its own call and
  // not a field on some other select.
  const { notation } = await readUiPrefs();

  const rows = companies.map((c) => {
    const active = c.listings.filter((l) => l.status === "ACTIVE");
    let bestScore: number | null = null;
    let bestBand: ScoreBand | null = null;
    // The listing the band belongs to, so the column can name it. Highest
    // `currentScore` wins and unscored listings sort last, which means a
    // company whose only open role has never been scored still shows the role
    // (with an em dash for its band) rather than showing nothing at all.
    let bestTitle: string | null = null;
    // −Infinity, not −1: an unscored listing ranks −1 and still has to beat
    // "nothing chosen yet", or the fallback above never fires.
    let bestRank = -Infinity;
    for (const l of active) {
      const rank = l.currentScore ?? -1;
      if (rank <= bestRank) continue;
      bestRank = rank;
      bestTitle = l.title;
      bestScore = l.currentScore;
      bestBand = l.currentScore != null ? l.currentBand : null;
    }
    return {
      company: c,
      // Flattened for `compareCompanies`, which is deliberately Prisma-free.
      name: c.name,
      isSample: c.isSample,
      priorityScore: c.priorityScore,
      activeCount: active.length,
      totalCount: c.listings.length,
      bestScore,
      bestBand,
      bestTitle,
      applicationCount: c.listings.reduce((n, l) => n + l.applications.length, 0),
      evidenceCount: c.sponsorshipEvidence.length,
      hasStrongEvidence: c.sponsorshipEvidence.some((e) => e.reliability === "STRONG"),
    };
  });

  // Samples last, then priorityScore desc (nulls last), then best active-listing
  // score desc, then name. See src/app/companies/ranking.ts for the why.
  rows.sort(compareCompanies);

  const sampleCount = rows.reduce((n, r) => n + (r.isSample ? 1 : 0), 0);

  /* ── The figures — all four read off `rows`, no extra query ────────────── */

  const withActive = rows.filter((r) => r.activeCount > 0).length;
  const verified = rows.filter((r) => r.hasStrongEvidence).length;
  const noEvidence = rows.filter((r) => r.evidenceCount === 0).length;
  /* VERIFIED and NO EVIDENCE sat side by side reading as a partition — 0 and
     214 against a register of 278, with the 64 companies in between simply
     absent from the strip. Printing the middle band closes it: the three
     evidence figures now add to `rows.length` by construction. */
  const partialEvidence = rows.length - verified - noEvidence;
  const tracked = rows.reduce((n, r) => n + r.applicationCount, 0);

  /* ── The map key — only the marks actually on this screen ──────────────── */

  const legendItems: LegendItem[] = [];
  if (rows.some((r) => r.hasStrongEvidence)) {
    legendItems.push({ mark: "VERIFIED", meaning: "a strong-reliability record on file" });
  }
  if (rows.some((r) => r.evidenceCount > 0 && !r.hasStrongEvidence)) {
    legendItems.push({ mark: "PARTIAL", meaning: "evidence on file, none of it strong" });
  }
  if (notation === "COMPACT") {
    const bands: ScoreBand[] = [];
    for (const r of rows) if (r.bestBand && !bands.includes(r.bestBand)) bands.push(r.bestBand);
    for (const b of bands) {
      legendItems.push({ mark: bandText(b, notation), meaning: BAND_LABELS[b].toLowerCase() });
    }
  }

  return (
    <>
      <PageFrame
        eyebrow="CORRESPONDENTS · SUMMER 2027"
        title="Companies on file."
        figures={
          <>
            {q ? `MATCHING “${q.toUpperCase()}”` : "WHOLE REGISTER"}
            <br />
            Real records first, then priority, then best active score
          </>
        }
        verbs={
          /* The search contract is unchanged: a GET form on `/companies` with a
             single `q` param, so every existing deep link still resolves. */
          <form action="/companies" className="flex items-center gap-1.5">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Company name…"
              aria-label="Search companies by name"
              className={`${inputCls} w-56`}
            />
            <button type="submit" className={btn}>
              Search
            </button>
            {q ? (
              <Link href="/companies" className={btn}>
                Clear
              </Link>
            ) : null}
          </form>
        }
      />

      <FigureStrip>
        <Figure value={rows.length} label="Companies" sub={q ? "Matching" : "On file"} />
        <Figure value={withActive} label="With active" sub="Listings" href="/opportunities" />
        <Figure
          value={verified}
          label="Verified"
          sub="Strong evidence"
          tone={verified > 0 ? "green" : undefined}
        />
        <Figure value={partialEvidence} label="Partial" sub="Weaker evidence" />
        <Figure
          value={noEvidence}
          label="No evidence"
          sub="Unresearched"
          tone={noEvidence > 0 ? "ochre" : undefined}
        />
        {/* `36 APPLICATIONS · TRACKED` used to close this strip. Every other
            cell counts COMPANIES — 278 on file, 231 of them with an active
            listing, and the three evidence bands that add back to 278 — and
            that one counted applications, which is the same category slip
            /analytics had. The number keeps its place in the footnote, where
            it sits beside the correspondent count as a stated pair rather than
            as the sixth cell of a partition it is not part of. */}
      </FigureStrip>

      {rows.length === 0 ? (
        <div className="rounded border border-rule bg-surface">
          <EmptyState
            title={q ? `No companies match “${q}”` : "No companies yet"}
            hint={
              q
                ? "Try a shorter fragment of the name — the search matches anywhere in the company name, case-insensitively."
                : "Companies appear automatically as the daily agent discovers listings. Check Data Sources to confirm sources are enabled, or trigger a manual run from Runs."
            }
          />
        </div>
      ) : (
        <Ledger cols={COLS} minWidth={MIN_WIDTH} label="Companies on file">
          <LedgerHead cols={COLS} />
          <LedgerSection>
            {rows.map((r) => {
              const c = r.company;
              // Industry, stage and HQ, in one muted phrase after the name —
              // present on 2 of 278 rows, and worth nothing as columns.
              const context = [
                c.industry,
                c.stage,
                [c.hqCity, c.hqState, c.hqCountry].filter(Boolean).join(", ") || null,
              ]
                .filter(Boolean)
                .join(" · ");
              const ev = evidenceVerdict(r.evidenceCount, r.hasStrongEvidence);
              return (
                <LedgerRow key={c.id}>
                  <LedgerCell title={context ? `${c.name} — ${context}` : c.name}>
                    <Link
                      href={`/companies/${c.id}`}
                      className="text-[13px] font-semibold underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </Link>{" "}
                    <SampleBadge isSample={c.isSample} />
                    {context ? (
                      <span className="ml-1.5 text-[12.5px] text-ink-3">{context}</span>
                    ) : null}
                  </LedgerCell>

                  <LedgerCell
                    title={
                      r.bestTitle ??
                      (r.totalCount > 0
                        ? "Nothing open here right now — every listing on file has closed."
                        : "No listing from this company has ever been discovered.")
                    }
                  >
                    {r.bestTitle ? (
                      <span className={rowRoleCls}>{r.bestTitle}</span>
                    ) : (
                      /* The same glyph, the same face and the same ink as the
                         `BEST BAND` placeholder two columns along. One row
                         printing "nothing here" two ways is what made the old
                         INDUSTRY and HQ columns read as two different marks. */
                      <span className={NOTHING_HERE}>—</span>
                    )}
                  </LedgerCell>

                  <LedgerCell
                    mono
                    align="right"
                    title={`${r.activeCount} active of ${r.totalCount} ever discovered`}
                  >
                    <span className={r.activeCount > 0 ? "font-semibold text-ink" : "text-ink-3"}>
                      {r.activeCount}
                    </span>
                    <span className="text-ink-3"> / {r.totalCount}</span>
                  </LedgerCell>

                  <LedgerCell mono align="right" muted={r.applicationCount === 0}>
                    {r.applicationCount}
                  </LedgerCell>

                  <LedgerCell align="right">
                    {r.bestBand ? (
                      <Band band={r.bestBand} score={r.bestScore} />
                    ) : (
                      <span className={NOTHING_HERE} title="No scored active listing at this company.">
                        —
                      </span>
                    )}
                  </LedgerCell>

                  <LedgerCell mono title={ev.title}>
                    <span className={`font-semibold ${TOKEN_TEXT[ev.color]}`}>{ev.label}</span>
                    {r.evidenceCount > 0 ? (
                      <span className="text-ink-3"> {r.evidenceCount}</span>
                    ) : null}
                  </LedgerCell>

                  <LedgerCell align="right">
                    <PriorityInput companyId={c.id} value={c.priorityScore} />
                  </LedgerCell>
                </LedgerRow>
              );
            })}
          </LedgerSection>
        </Ledger>
      )}

      <Footnote
        legend={
          <>
            {rows.length} {rows.length === 1 ? "CORRESPONDENT" : "CORRESPONDENTS"} ·{" "}
            {tracked} TRACKED {tracked === 1 ? "APPLICATION" : "APPLICATIONS"}
            {sampleCount > 0
              ? ` · ${sampleCount} ${sampleCount === 1 ? "SAMPLE" : "SAMPLES"} SORTED LAST`
              : null}
            {legendItems.length > 0 ? " · " : null}
            <Legend items={legendItems} />
          </>
        }
        keys={
          /* A printed keycap must be a real binding (D1). This one is:
             `PriorityInput` blurs on Enter, which is what commits the score. */
          <Keys label="IN PRIORITY" items={[{ key: "ENTER", label: "save" }]} />
        }
      />
    </>
  );
}
