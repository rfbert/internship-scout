import type { ScoreBand } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui";
import { PageFrame } from "@/components/register/page-frame";
import { Footnote, Legend } from "@/components/register/footnote";
import { SectionRule } from "@/components/register/rule";
import { SourcesTable } from "./sources-table";
import { ImportUrlForm } from "./import-url";
import { ImportCsvForm } from "./import-csv";
import type { SourceRow } from "./types";
import { warningForSource } from "@/app/runs/meta";
import { readUiPrefs } from "@/server/ui-prefs";

export const dynamic = "force-dynamic";

const TOP_BANDS: ScoreBand[] = ["EXCEPTIONAL", "HIGH_PRIORITY", "STRONG", "WORTH_REVIEWING"];

/**
 * Everything the page needs, loaded outside the component.
 *
 * `now` and the timezone are minted ONCE here: the table computes staleness
 * against this value rather than a fresh `Date.now()` per row, so the markup
 * the server sends and the markup the client hydrates cannot disagree. The
 * read also lives in a plain async function rather than in render — the route
 * is `force-dynamic`, so a per-request clock read is correct, but a component
 * body must stay pure (react-hooks/purity).
 */
async function loadSources() {
  const now = Date.now();
  const { timezone } = await readUiPrefs();

  const sources = await prisma.dataSource.findMany({
    orderBy: [{ automated: "desc" }, { priority: "asc" }],
    include: { _count: { select: { sources: true } } },
  });

  /*
   * The top-band tally for EVERY source, in ONE query.
   *
   * This used to be `prisma.internshipListing.count()` per source inside a
   * `Promise.all`, which opens N connections AT THE SAME INSTANT. In
   * production that took the page down: Supabase's session-mode pooler caps
   * at 15 clients, the fan-out plus whatever else was in flight went past it,
   * and the page rendered its error boundary with
   *
   *   FATAL: (EMAXCONNSESSION) max clients reached in session mode
   *
   * It never failed locally — one reader, no contention — which is exactly
   * why it survived a smoke test that only checked status codes. The error
   * boundary answers 200.
   *
   * Grouping by (dataSourceId, listingId) rather than by dataSourceId alone
   * is deliberate: `InternshipSource` is unique on (dataSourceId, url), so one
   * listing reachable at two URLs from the same source has two join rows, and
   * counting join rows would report more top-band listings than exist. The
   * pairs are counted in JS, which restores the DISTINCT the original
   * `count()` had for free.
   */
  const topBandPairs = await prisma.internshipSource.groupBy({
    by: ["dataSourceId", "listingId"],
    where: { listing: { deletedAt: null, currentBand: { in: TOP_BANDS } } },
  });

  const topBandBySource = new Map<string, number>();
  for (const { dataSourceId } of topBandPairs) {
    topBandBySource.set(dataSourceId, (topBandBySource.get(dataSourceId) ?? 0) + 1);
  }

  /*
   * What the connectors warned about on the last run.
   *
   * On 12 Aug five of eleven automated connectors brought back nothing — two
   * GitHub lists whose repo is missing, one whose HTML no longer has a table
   * the parser recognises, and three ATS watchlists reachable with zero
   * intern-titled postings between them. Every one of them showed HEALTH OK ·
   * 10 HOURS AGO on this page, because `collect()` stamps `lastSuccessAt` on
   * any fetch that did not throw, and health is computed from that timestamp.
   * The page was reporting, accurately, that the fetch happened — and a reader
   * takes it as reporting that the source works.
   *
   * ONE query, awaited AFTER the two above rather than beside them. The block
   * comment on `topBandPairs` is the reason: this page has already been taken
   * down once by opening several connections at the same instant, and adding a
   * third leg to a `Promise.all` is how that happens again.
   */
  const lastRun = await prisma.agentRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      events: {
        where: { stage: "collect", level: { not: "INFO" } },
        select: { message: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  /* `collect()` logs `${source.key}: ${warning}`, so the key is the join.
     Matched on the exact prefix — several keys share a long head. */
  const warningsBySource = new Map<string, string[]>();
  for (const s of sources) {
    const mine = (lastRun?.events ?? [])
      .map((e) => warningForSource(e.message, s.key))
      .filter((w): w is string => w !== null);
    if (mine.length > 0) warningsBySource.set(s.id, mine);
  }

  const rows: SourceRow[] = sources.map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    kind: s.kind,
    enabled: s.enabled,
    automated: s.automated,
    priority: s.priority,
    rateLimitMs: s.rateLimitMs,
    config: s.config ?? null,
    notes: s.notes,
    lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
    lastErrorAt: s.lastErrorAt?.toISOString() ?? null,
    lastErrorMessage: s.lastErrorMessage,
    sightings: s._count.sources,
    topBandListings: topBandBySource.get(s.id) ?? 0,
    warnings: warningsBySource.get(s.id) ?? [],
  }));

  return {
    now,
    timezone,
    automated: rows.filter((r) => r.automated),
    manual: rows.filter((r) => !r.automated),
  };
}

export default async function SourcesPage() {
  const { now, timezone, automated, manual } = await loadSources();

  return (
    // `min-w-0` on every wrapper: without it a ledger wider than the viewport
    // pushes the document itself, and the whole page scrolls sideways rather
    // than the table inside its own frame.
    <div className="min-w-0">
      <PageFrame
        eyebrow="Intake · where the register gets its records"
        title="Data Sources"
        figures={
          <>
            <b className="font-semibold text-ink">{automated.length}</b> automated ·{" "}
            <b className="font-semibold text-ink">{manual.length}</b> manual
          </>
        }
      />

      <div className="min-w-0">
        <SectionRule
          label="Automated connectors"
          right={<span>fetched every run, in priority order</span>}
        />
        {automated.length === 0 ? (
          <EmptyState
            title="No automated sources configured"
            hint="Run the database seed (npm run db:seed) to install the default GitHub-list and ATS connectors, or add rows to the data_sources table."
          />
        ) : (
          <SourcesTable rows={automated} timezone={timezone} now={now} label="Automated connectors" />
        )}
      </div>

      <div className="mt-6 min-w-0">
        <SectionRule
          label="Manual sources"
          right={<span>you bring the posting, the agent analyzes it</span>}
        />
        {manual.length === 0 ? (
          <EmptyState
            title="No manual sources found"
            hint="Run the database seed (npm run db:seed) to create the URL-import and CSV-import sources — the forms below need them."
          />
        ) : (
          <SourcesTable rows={manual} timezone={timezone} now={now} label="Manual sources" />
        )}
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionRule label="Add by URL" right={<span>prefetched for confirmation</span>} />
          <ImportUrlForm />
        </div>
        <div className="min-w-0">
          <SectionRule label="CSV import" right={<span>Handshake, university portals</span>} />
          <ImportCsvForm />
        </div>
      </div>

      {/* The collection policy, as the page's own footnote — it is a standing
          rule about how this register is filled, which is exactly what a
          footnote strip is for. */}
      <Footnote
        legend={
          <Legend
            title="Collection order"
            items={[
              { mark: "1", meaning: "official APIs" },
              { mark: "2", meaning: "public feeds" },
              { mark: "3", meaning: "job-board endpoints" },
              { mark: "4", meaning: "public career pages" },
              { mark: "5", meaning: "permitted scraping, then GitHub lists" },
            ]}
          />
        }
        keys={
          <span>
            Never bypasses auth, CAPTCHAs, rate limits or robots rules — auth-walled portals use
            the manual imports above. See docs/DATA_SOURCES.md.
          </span>
        }
      />
    </div>
  );
}
