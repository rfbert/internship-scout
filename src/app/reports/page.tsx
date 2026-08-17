import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Figure, FigureStrip, PageFrame } from "@/components/register/page-frame";
import { Footnote, Legend } from "@/components/register/footnote";
import { SectionRule } from "@/components/register/rule";
import {
  Ledger,
  LedgerCell,
  LedgerHead,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { EmptyState } from "@/components/ui";
import { TOKEN_TEXT, fmtAgo, upper } from "@/lib/format";
import { fmtDateTimeTz, fmtDateTz, fmtTimeTz } from "@/lib/dates";
import { readUiPrefs } from "@/server/ui-prefs";
import { dispatchBacklogLine, resolveDispatch } from "./meta";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   THE DISPATCH BOOK — `/reports`

   WHY THIS URL, AND NOT UNDER `/runs`:
   `/runs` was the obvious neighbour, so it got looked at first. Three things
   said no.
     · There is no relation to hang it on. `EmailReport` (schema.prisma:916)
       carries no `runId` — it is keyed `@@unique([reportDate, kind])` and
       UPSERTED by date, so one report row can be touched by several runs of
       the same day and belongs to none of them. `/runs/[id]/report` would
       assert a containment the schema does not have, and could only be
       resolved by a date join, which is exactly the kind of guess this
       codebase's date comments exist to prevent.
     · The lifetimes differ. A report survives for a day with no successful
       run at all (`kind: "test"` rows, and the skip branch at run.ts:1009).
     · `/runs/reports` would sit as a static sibling of the `[id]` dynamic
       segment — legal, and resolved static-first, but it makes every future
       reader check the precedence rule to be sure `/runs/<cuid>` still works.

   So: a top-level sibling of `/runs`, and next to it in the masthead's MORE
   drawer. `/runs` is what the agent COLLECTED; `/reports` is what it WROTE.
   Two log books, side by side, neither inside the other.

   TWO CLOCKS, AND THEY MUST NOT BE MIXED (the same rule /runs prints):
     · `reportDate` is a Postgres `date` (`@db.Date`), so Prisma hands it back
       at exactly UTC midnight. That is a floating calendar day, not an instant
       — `fmtDateTz` detects the shape and renders its UTC day. Reading it as
       an instant prints the day BEFORE for every US reader.
     · `createdAt` and `sentAt` ARE instants and render in the user's stored
       timezone via `fmtDateTimeTz` / `fmtTimeTz`.
   ══════════════════════════════════════════════════════════════════════════ */

const COLS: LedgerCol[] = [
  { label: "Report date", w: "116px" },
  { label: "Kind", w: "62px" },
  { label: "Subject", w: "minmax(0,1.4fr)" },
  { label: "Outcome", w: "150px" },
  { label: "Stored note", w: "minmax(0,1fr)" },
  { label: "Composed", w: "88px" },
  { label: "Ago", w: "88px", align: "right" },
  { label: "", w: "62px", align: "right" },
];

/** Six months of daily rows. The book is one row per day; it does not need all of them at once. */
const WINDOW = 180;

/**
 * Below this the ledger scrolls inside itself — the page never does.
 *
 * Named rather than inlined so `tests/unit/ledger-width.test.ts` can hold it
 * to the same ceiling as every other ledger: that test extracts a named
 * integer out of each page's source, so a hardcoded `minWidth={1180}` was
 * literally unreachable by the pin, and the newest ledger in the app was the
 * one instrument with no enforcement on it.
 */
const MIN_WIDTH = 1180;

/**
 * Everything the page needs, loaded outside the component.
 *
 * The bodies ARE selected, only to be measured and thrown away — `htmlChars`
 * is the "was anything composed at all" signal the outcome turns on
 * (`meta.ts`), and it is the difference between printing "NOT COMPOSED" and
 * "COMPOSED · NOT SENT" on 23 of the rows on file. Postgres could answer that
 * with `length(html_body)` for a fraction of the bytes, but `$queryRaw` would
 * hydrate `report_date` through a different path than `findMany`, and this
 * page's correctness rests on that column arriving at exactly UTC midnight.
 * A verified date beats a cheaper query on a single-user, force-dynamic page.
 */
async function loadReports() {
  const [rows, prefs] = await Promise.all([
    prisma.emailReport.findMany({
      orderBy: [{ reportDate: "desc" }, { kind: "asc" }],
      take: WINDOW,
    }),
    readUiPrefs(),
  ]);

  return {
    timezone: prefs.timezone,
    reports: rows.map((r) => ({
      id: r.id,
      reportDate: r.reportDate,
      kind: r.kind,
      subject: r.subject,
      sendMode: r.sendMode,
      createdAt: r.createdAt,
      outcome: resolveDispatch({
        sendMode: r.sendMode,
        sentAt: r.sentAt,
        skippedReason: r.skippedReason,
        error: r.error,
        htmlChars: r.htmlBody.length,
        textChars: r.textBody.length,
      }),
    })),
  };
}

export default async function ReportsPage() {
  const { timezone: tz, reports } = await loadReports();

  /* ── The window, counted ───────────────────────────────────────────────── */

  const tally = (state: string) => reports.filter((r) => r.outcome.state === state).length;
  const sent = tally("SENT");
  const dryRun = tally("DRY_RUN");
  const notComposed = tally("NOT_COMPOSED");
  const held = tally("HELD");
  const failed = tally("FAILED");

  const last = reports[0] ?? null;

  return (
    <div className="min-w-0">
      <PageFrame
        eyebrow={`DISPATCH BOOK · LATEST ${reports.length} REPORT${
          reports.length === 1 ? "" : "S"
        } · CLOCK ${upper(tz)}`}
        title="Every digest the agent wrote."
        figures={
          last ? (
            <>
              Last dispatch {upper(fmtDateTz(last.reportDate, tz))} ·{" "}
              <span className={TOKEN_TEXT[last.outcome.tone]}>{last.outcome.label}</span>
              <br />
              composed {fmtTimeTz(last.createdAt, tz)} · {fmtAgo(last.createdAt)}
            </>
          ) : (
            <>No dispatch on file</>
          )
        }
      />

      {/* The window's arithmetic on ONE ruled line. HELD and FAILED only earn a
          cell when they have happened — a permanent `0 FAILED` is a cell that
          never says anything, and this page already has a story to tell. */}
      <FigureStrip>
        <Figure value={reports.length} label="Reports" sub="In window" />
        <Figure value={sent} label="Sent" sub="Delivered" tone={sent > 0 ? "green" : undefined} />
        <Figure
          value={dryRun}
          label="Composed"
          sub="Not sent"
          tone={dryRun > 0 ? "blue" : undefined}
        />
        <Figure value={notComposed} label="Quiet" sub="Nothing to say" />
        {held > 0 ? <Figure value={held} label="Held" sub="Not configured" tone="ochre" /> : null}
        {failed > 0 ? <Figure value={failed} label="Failed" sub="Transport" tone="carmine" /> : null}
      </FigureStrip>

      <SectionRule
        label="Daily dispatches"
        right={reports.length > 0 ? `NEWEST FIRST · ${reports.length} ON FILE` : "EMPTY"}
      />

      {reports.length === 0 ? (
        <div className="rounded border border-rule bg-surface">
          <EmptyState
            title="No reports on file"
            hint="The daily agent writes one row per day when it reaches the email stage. Run it with “Run agent now” on the Runs page, or npm run agent:daily from a terminal, then come back."
            action={
              <Link
                href="/runs"
                className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-blue underline-offset-2 hover:underline"
              >
                Go to the intake log →
              </Link>
            }
          />
        </div>
      ) : (
        <Ledger cols={COLS} minWidth={MIN_WIDTH} label="Daily email reports, newest first">
          <LedgerHead cols={COLS} />
          <LedgerSection>
            {reports.map((r) => {
              const day = upper(fmtDateTz(r.reportDate, tz));
              const { outcome } = r;
              return (
                <LedgerRow key={r.id} tick={outcome.tone}>
                  <LedgerCell mono>
                    {/* The dispatch's day is its name — so the day is the link. */}
                    <Link
                      href={`/reports/${r.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {day}
                    </Link>
                  </LedgerCell>

                  <LedgerCell mono muted>
                    {upper(r.kind)}
                  </LedgerCell>

                  <LedgerCell title={r.subject}>{r.subject}</LedgerCell>

                  {/* The word always prints; `tone` only colors it (D3). */}
                  <LedgerCell
                    mono
                    className={`font-semibold ${TOKEN_TEXT[outcome.tone]}`}
                    title={`${outcome.label}${outcome.detail ? ` — ${outcome.detail}` : ""}`}
                  >
                    {outcome.label}
                  </LedgerCell>

                  {/* The row's own words, not the state's boilerplate — see the
                      `note` comment in meta.ts. The friendly sentence is on the
                      detail page, where it is said once instead of 23 times. */}
                  <LedgerCell mono muted title={outcome.note || undefined}>
                    {outcome.note || "—"}
                  </LedgerCell>

                  {/* An instant: clock in the user's zone, full stamp on hover. */}
                  <LedgerCell mono title={fmtDateTimeTz(r.createdAt, tz)}>
                    {fmtTimeTz(r.createdAt, tz)}
                  </LedgerCell>

                  <LedgerCell mono muted align="right">
                    {fmtAgo(r.createdAt)}
                  </LedgerCell>

                  <LedgerCell align="right">
                    <Link
                      href={`/reports/${r.id}`}
                      aria-label={`Read the digest for ${day}`}
                      className="font-mono text-[10px] font-medium tracking-[0.06em] text-blue underline-offset-2 hover:underline"
                    >
                      READ →
                    </Link>
                  </LedgerCell>
                </LedgerRow>
              );
            })}
          </LedgerSection>
        </Ledger>
      )}

      {/* The map key. The left slot carries the one thing this book has to
          declare — how many of these nobody ever received — and the right slot
          carries the same two-clocks rule /runs prints, because the same two
          kinds of date sit in the same table.

          The sentence is built in `meta.ts` and unit-tested, because getting it
          wrong is not a typo: it is the page contradicting its own figure
          strip, which is exactly what it did. */}
      <Footnote
        legend={dispatchBacklogLine(reports.map((r) => r.outcome.state))}
        /* Two-item glossary → the glossary primitive. The hand-rolled `|` this
           replaces was painted in `--rule`, a token the design declares
           graphic-only, never text; as text it measured 1.47:1 in day and
           1.64:1 at night. `Legend` separates with a mid dot in the footnote's
           own ink and sets each term in `--ink-2`. */
        keys={
          <Legend
            items={[
              { mark: "REPORT DATE", meaning: "calendar day" },
              { mark: "COMPOSED", meaning: `clock ${tz}` },
            ]}
          />
        }
      />
    </div>
  );
}
