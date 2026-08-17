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
import { RUN_STATUS_LABELS, TOKEN_TEXT, fmtAgo, runStatusColor, upper } from "@/lib/format";
import { fmtDateTimeTz, fmtDateTz, fmtTimeTz } from "@/lib/dates";
import { readUiPrefs } from "@/server/ui-prefs";
import {
  TRIGGER_LABELS,
  aboveInfoColor,
  aboveInfoLabel,
  agentVersionLabel,
  runDuration,
  statCounters,
  statErrors,
  statLine,
  statNum,
  type AboveInfo,
} from "./meta";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   THE INTAKE LOG — `/runs` (spec C7)

   An ops surface is a log book: one ruled line per run, read down the column.
   The card-with-a-table-in-it is gone; so are the badge pills, which put five
   rounded fills on every row of a page whose whole job is to let you scan a
   hundred rows for the one that went wrong.

   TWO CLOCKS, AND THEY MUST NOT BE MIXED (the C7 note):
     · `AgentRun.runDate` is a Postgres `date` (`schema.prisma` `@db.Date`), so
       Prisma hands it back at exactly UTC midnight. That is a floating calendar
       day, not an instant — `fmtDateTz` detects the shape and renders its UTC
       day. The old `fmtDate` read it against the server's local clock and
       printed the day before for every US user.
     · `startedAt` / `finishedAt` ARE instants, and render in the user's stored
       timezone via `fmtDateTimeTz` / `fmtTimeTz`.
   The footnote prints both rules, because a log whose reader cannot tell which
   column is a calendar day and which is a clock is not evidence.

   ONE ADDED QUERY, AND IT IS NOT A FAN-OUT. The strip used to be pure
   arithmetic over the rows already on the page. It cannot be any more: a run's
   warnings live in `AgentRunEvent`, not in the run row, and a page that grades
   runs without reading them grades them wrong (see the WARNINGS block in
   ./meta.ts). The read is ONE `groupBy` over the hundred ids already fetched,
   awaited AFTER them — not a `count()` per run inside a `Promise.all`, which
   is the shape that took `/sources` down by exhausting the pooler. Two
   sequential round trips, one connection at a time.
   ══════════════════════════════════════════════════════════════════════════ */

/* Named, and pinned in tests/unit/run-log.test.ts. It rose from 980 when the
   WARNINGS column arrived and DURATION widened to hold "did not finish"; the
   ceiling is /opportunities' 1340. */
const MIN_WIDTH = 1120;

const COLS: LedgerCol[] = [
  { label: "Run date", w: "112px" },
  { label: "Trigger", w: "78px" },
  { label: "Status", w: "84px" },
  { label: "Warnings", w: "92px" },
  { label: "Started", w: "84px" },
  { label: "Ago", w: "80px", align: "right" },
  { label: "Duration", w: "104px", align: "right" },
  { label: "Counters", w: "minmax(0,1fr)" },
  { label: "", w: "62px", align: "right" },
];

export default async function RunsPage() {
  const [runs, prefs] = await Promise.all([
    prisma.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    readUiPrefs(),
  ]);
  const tz = prefs.timezone;

  /* Anything the agent logged above INFO, per run — one grouped read over the
     ids already in hand, sequential to the query above. Runs with no warnings
     are simply absent from the result, which is why the map is read through
     `NONE` rather than iterated. */
  const warnRows =
    runs.length === 0
      ? []
      : await prisma.agentRunEvent.groupBy({
          by: ["runId", "level"],
          where: { runId: { in: runs.map((r) => r.id) }, level: { not: "INFO" } },
          _count: { _all: true },
        });

  const warnByRun = new Map<string, AboveInfo>();
  for (const row of warnRows) {
    const a = warnByRun.get(row.runId) ?? { warn: 0, error: 0, total: 0 };
    if (row.level === "WARN") a.warn += row._count._all;
    else if (row.level === "ERROR") a.error += row._count._all;
    a.total = a.warn + a.error;
    warnByRun.set(row.runId, a);
  }
  const NONE: AboveInfo = { warn: 0, error: 0, total: 0 };

  /* ── The window, counted ───────────────────────────────────────────────── */

  /* CLEAN MEANS CLEAN. This counted every SUCCESS, which is how a run that
     logged six warnings and read half its sources came to be filed under "13
     CLEAN" on the first screen an operator sees. A SUCCESS carrying warnings
     is now counted as WARNED and nowhere else — the two cells are disjoint and
     sum to the SUCCESS total, so nothing has gone missing from the strip. */
  const success = runs.filter((r) => r.status === "SUCCESS");
  const warned = success.filter((r) => (warnByRun.get(r.id) ?? NONE).total > 0).length;
  const clean = success.length - warned;
  const partial = runs.filter((r) => r.status === "PARTIAL").length;
  const failed = runs.filter((r) => r.status === "FAILED").length;
  const running = runs.filter((r) => r.status === "RUNNING").length;
  const newListings = runs.reduce((n, r) => n + (statNum(r.stats, "new") ?? 0), 0);
  const errors = runs.reduce((n, r) => n + statErrors(r.stats), 0);
  const warnEvents = warnRows.reduce((n, w) => n + (w.level === "WARN" ? w._count._all : 0), 0);
  const errorEvents = warnRows.reduce((n, w) => n + (w.level === "ERROR" ? w._count._all : 0), 0);

  const last = runs[0] ?? null;
  const lastVersion = agentVersionLabel(last?.version);

  return (
    <>
      <PageFrame
        eyebrow={`INTAKE LOG · LATEST ${runs.length} RUN${runs.length === 1 ? "" : "S"} · CLOCK ${upper(tz)}`}
        title="Every run, and what it brought in."
        figures={
          last ? (
            <>
              Last intake {upper(fmtDateTz(last.runDate, tz))} ·{" "}
              <span className={TOKEN_TEXT[runStatusColor(last.status)]}>
                {upper(RUN_STATUS_LABELS[last.status])}
              </span>
              <br />
              {last.finishedAt
                ? `closed ${fmtTimeTz(last.finishedAt, tz)}`
                : `started ${fmtTimeTz(last.startedAt, tz)}`}{" "}
              · {fmtAgo(last.finishedAt ?? last.startedAt)}
            </>
          ) : (
            <>No intake on file</>
          )
        }
      />

      {/* The window's arithmetic on ONE ruled line. `RUNNING` only earns a cell
          while something is actually running — a permanent `0 RUNNING` is a
          cell that never says anything. */}
      <FigureStrip>
        <Figure value={runs.length} label="Runs" sub="In window" />
        <Figure value={clean} label="Clean" sub="No warnings" tone={clean > 0 ? "green" : undefined} />
        <Figure
          value={warned}
          label="Warned"
          sub="Success, but"
          tone={warned > 0 ? "ochre" : undefined}
        />
        <Figure value={partial} label="Partial" sub="With errors" tone={partial > 0 ? "ochre" : undefined} />
        <Figure value={failed} label="Failed" sub="No intake" tone={failed > 0 ? "carmine" : undefined} />
        {running > 0 ? <Figure value={running} label="Running" sub="Now" tone="blue" /> : null}
        <Figure value={newListings} label="New" sub="Listings found" href="/opportunities" />
        <Figure
          value={errors}
          label="Errors"
          sub="Collection"
          tone={errors > 0 ? "carmine" : undefined}
        />
      </FigureStrip>

      <SectionRule
        label="Collection runs"
        right={runs.length > 0 ? `NEWEST FIRST · ${runs.length} ON FILE` : "EMPTY"}
      />

      {runs.length === 0 ? (
        <div className="rounded border border-rule bg-surface">
          <EmptyState
            title="No agent runs yet"
            hint='Start one with "Run agent now" above, use "Run now" on a single source in Data Sources, run npm run agent:daily from a terminal, or wait for the daily schedule.'
          />
        </div>
      ) : (
        <Ledger cols={COLS} minWidth={MIN_WIDTH} label="Agent runs, newest first">
          <LedgerHead cols={COLS} />
          <LedgerSection>
            {runs.map((run) => {
              const day = upper(fmtDateTz(run.runDate, tz));
              const counters = statCounters(run.stats);
              const dur = runDuration(run);
              const above = warnByRun.get(run.id) ?? NONE;
              /* The margin tick follows the WARNING, not just the status: a
                 SUCCESS with warnings is the row this page exists to help you
                 find, and it used to carry the same green tab as a clean one. */
              const tick =
                above.total > 0 && run.status === "SUCCESS"
                  ? (aboveInfoColor(above) ?? "ochre")
                  : runStatusColor(run.status);
              return (
                <LedgerRow key={run.id} tick={tick}>
                  <LedgerCell mono>
                    {/* The run's day is its name — so the day is the link. */}
                    <Link href={`/runs/${run.id}`} className="underline-offset-2 hover:underline">
                      {day}
                    </Link>
                  </LedgerCell>

                  <LedgerCell mono muted>
                    {upper(TRIGGER_LABELS[run.trigger])}
                  </LedgerCell>

                  {/* `tone`, not `className` — see LedgerCell. As a class this
                      lost to the cell's own `text-ink-2` and a FAILED run
                      printed in the same ink as a SUCCESS one. */}
                  <LedgerCell mono tone={runStatusColor(run.status)} className="font-semibold">
                    {upper(RUN_STATUS_LABELS[run.status])}
                  </LedgerCell>

                  {/* Its own column, beside the status it qualifies. A count
                      and not a mark: "6 WARN" beside SUCCESS is a row you stop
                      on, and it reads down the column against every other run
                      in the window. */}
                  <LedgerCell
                    mono
                    tone={aboveInfoColor(above)}
                    muted={above.total === 0}
                    className={above.total > 0 ? "font-semibold" : ""}
                    title={
                      above.total > 0
                        ? `${above.warn} WARN and ${above.error} ERROR event${
                            above.error === 1 ? "" : "s"
                          } — open the run to read them`
                        : "Nothing above INFO in this run's event log"
                    }
                  >
                    {aboveInfoLabel(above, true)}
                  </LedgerCell>

                  {/* An instant: clock in the user's zone, full stamp on hover. */}
                  <LedgerCell mono title={fmtDateTimeTz(run.startedAt, tz)}>
                    {fmtTimeTz(run.startedAt, tz)}
                  </LedgerCell>

                  <LedgerCell mono muted align="right">
                    {fmtAgo(run.startedAt)}
                  </LedgerCell>

                  {/* "237h 45m" for a run that died in its first minutes — see
                      `runDuration`. When the span is not a runtime the cell
                      says so instead of printing it. */}
                  <LedgerCell
                    mono
                    align="right"
                    tone={dur.unfinished ? "ochre" : undefined}
                    title={dur.title}
                  >
                    {dur.text}
                  </LedgerCell>

                  {/* A FIXED set of counters in a FIXED order, each in its own
                      track, so the third position is CHANGED on every row and
                      the column can be read downward. `tabular-nums` from
                      LedgerCell keeps the numerals in vertical register. */}
                  <LedgerCell mono muted title={statLine(run.stats, 8) || undefined}>
                    <span className="grid grid-cols-4 gap-x-2.5">
                      {counters.map((c) => (
                        <span key={c.key} className="truncate">
                          <span className={c.value === null ? "" : "text-ink-2"}>
                            {c.value ?? "—"}
                          </span>{" "}
                          {c.label}
                        </span>
                      ))}
                    </span>
                  </LedgerCell>

                  <LedgerCell align="right">
                    <Link
                      href={`/runs/${run.id}`}
                      aria-label={`Run details for ${day}`}
                      className="font-mono text-[10px] font-medium tracking-[0.06em] text-blue underline-offset-2 hover:underline"
                    >
                      OPEN →
                    </Link>
                  </LedgerCell>
                </LedgerRow>
              );
            })}
          </LedgerSection>
        </Ledger>
      )}

      {/* The map key. This page binds no keys, so the right slot carries the
          thing a log book actually has to declare: which column is a calendar
          day and which is a clock, and whose clock it is. */}
      <Footnote
        /* The warning total sits beside the error total, because a footnote
           that totals only what `CollectionError` recorded is the same false
           all-clear the status column gives. `AGENT dev` is gone: `run.ts`
           stamps that placeholder in every environment, so it named nothing —
           see `agentVersionLabel`. */
        legend={
          last
            ? [
                `${newListings} NEW LISTINGS`,
                `${warnEvents} WARNING${warnEvents === 1 ? "" : "S"}`,
                `${errorEvents} ERROR EVENT${errorEvents === 1 ? "" : "S"}`,
                `${errors} IN THE ERROR COUNTERS`,
                `ACROSS ${runs.length} RUN${runs.length === 1 ? "" : "S"}`,
                ...(lastVersion ? [`AGENT ${upper(lastVersion)}`] : []),
              ].join(" · ")
            : "NO INTAKE ON FILE"
        }
        /* This is a two-item glossary, so it is rendered by the glossary
           primitive. It used to hand-roll the separator as `|` painted in
           `--rule` — a token the design declares GRAPHIC ONLY, NEVER TEXT
           (globals.css, and the contrast gate's decorative allow-list says so
           in as many words). As text it landed at 1.47:1 in day and 1.64:1 at
           night: a character nobody could read in either theme. `Legend`
           separates its items with a mid dot in the footnote's own ink and
           sets each term in `--ink-2`. */
        keys={
          <Legend
            items={[
              { mark: "RUN DATE", meaning: "calendar day" },
              { mark: "STARTED", meaning: `clock ${tz}` },
            ]}
          />
        }
      />
    </>
  );
}
