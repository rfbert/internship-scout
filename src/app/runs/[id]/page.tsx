import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageFrame } from "@/components/register/page-frame";
import { Footnote, Legend } from "@/components/register/footnote";
import { SectionRule } from "@/components/register/rule";
import { Well } from "@/components/register/well";
import {
  Ledger,
  LedgerCell,
  LedgerHead,
  LedgerMicroRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { EmptyState } from "@/components/ui";
import { RUN_STATUS_LABELS, TOKEN_TEXT, fmtAgo, runStatusColor, upper } from "@/lib/format";
import { fmtDateTimeTz, fmtDateTz, fmtTimeTz } from "@/lib/dates";
import { readUiPrefs } from "@/server/ui-prefs";
import {
  LEVEL_COLOR,
  TRIGGER_LABELS,
  aboveInfo,
  aboveInfoColor,
  aboveInfoLabel,
  agentVersionLabel,
  isStatsDigestEvent,
  redactPaths,
  runDuration,
  statErrors,
  summarizeFailure,
} from "../meta";
import { StatChips } from "../stat-chips";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   ONE RUN, LINE BY LINE — `/runs/[id]` (spec C7)

   The event stream is the reason this page exists, so it gets the Register's
   24px micro-row and a mono timestamp gutter: a hundred log lines read as a
   log, not as a hundred table rows with five badges each.

   THE TWO CLOCKS (the C7 note), on one page and never mixed:
     · `runDate` is `@db.Date` — Prisma hydrates it at exactly UTC midnight, so
       it is a floating calendar day and `fmtDateTz` renders its UTC day.
     · `startedAt`, `finishedAt`, every `event.createdAt` and every
       `error.createdAt` are true instants, rendered in the user's stored
       timezone with `fmtDateTimeTz` / `fmtTimeTz`.
   Printing the run's day tz-aware while its event clock stayed on the
   deployment's UTC wall clock would have the head and the stream disagree by a
   day for half of every evening.

   The `include` is untouched (D4): the same run, its events in order, and its
   collection errors with their data sources.
   ══════════════════════════════════════════════════════════════════════════ */

const EVENT_COLS: LedgerCol[] = [
  { label: "Time", w: "82px" },
  { label: "Stage", w: "132px" },
  { label: "Level", w: "62px" },
  { label: "Message", w: "minmax(0,1fr)" },
];

/** `pl-2.5` + the 82px Time track + the grid's 10px gap. */
const DATA_INDENT = "pl-[102px]";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [run, prefs] = await Promise.all([
    prisma.agentRun.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: "asc" } },
        errors: { include: { dataSource: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    readUiPrefs(),
  ]);
  if (!run) notFound();

  const tz = prefs.timezone;
  const day = upper(fmtDateTz(run.runDate, tz));

  /* The run's closing line logs the stats blob at itself, as JSON, into a
     stream that sits 400px under a chip row of the same numbers. Dropped here
     rather than skipped at render, so that everything downstream — the event
     count in the section rule, the footnote's total — counts what is actually
     on the page. See `isStatsDigestEvent`. */
  const events = run.events.filter((e) => !isStatsDigestEvent(e));

  const above = aboveInfo(events);
  const counterErrors = statErrors(run.stats);
  const dur = runDuration(run);
  const version = agentVersionLabel(run.version);
  /* SUCCESS is written on `CollectionError` rows alone (run.ts:1163), so a run
     whose sources came back empty is stamped SUCCESS with warnings to its
     name. The header prints both words; neither is editable from here. */
  const statusColor =
    above.total > 0 && run.status === "SUCCESS"
      ? (aboveInfoColor(above) ?? "ochre")
      : runStatusColor(run.status);

  return (
    <>
      <div className="pt-3.5">
        <Link
          href="/runs"
          className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          ← All runs
        </Link>
      </div>

      <PageFrame
        eyebrow={`INTAKE LOG · RUN ${day} · ${upper(TRIGGER_LABELS[run.trigger])}${
          version ? ` · AGENT ${upper(version)}` : ""
        }`}
        title="One run, line by line."
        figures={
          <>
            <span className={`font-semibold ${TOKEN_TEXT[statusColor]}`}>
              {upper(RUN_STATUS_LABELS[run.status])}
            </span>
            {/* The qualifier rides WITH the status word, not in a section
                further down: "SUCCESS" alone is what let a run that read none
                of five sources pass for a good one. */}
            {above.total > 0 ? (
              <span className={`font-semibold ${TOKEN_TEXT[aboveInfoColor(above) ?? "ochre"]}`}>
                {" "}
                · {aboveInfoLabel(above)}
              </span>
            ) : null}{" "}
            <span title={dur.title}>· {dur.sentence}</span> · {fmtAgo(run.startedAt)}
            <br />
            Started {fmtDateTimeTz(run.startedAt, tz)}
            {run.finishedAt ? ` · closed ${fmtTimeTz(run.finishedAt, tz)}` : " · still open"}
          </>
        }
      />

      {/* The stats blob, as the Register's one chip idiom. */}
      <StatChips stats={run.stats} label="Run counters" />

      {/* ── I · The event stream ─────────────────────────────────────────── */}
      <section className="mt-5">
        <SectionRule
          label="Event stream"
          tick={aboveInfoColor(above)}
          right={`${events.length} EVENT${events.length === 1 ? "" : "S"}${
            above.total > 0 ? ` · ${aboveInfoLabel(above)}` : ""
          }`}
        />
        {events.length === 0 ? (
          <div className="rounded border border-rule bg-surface">
            <EmptyState
              title="No events recorded"
              hint="This run has not logged anything yet — if it is still running, check back shortly."
            />
          </div>
        ) : (
          <Ledger cols={EVENT_COLS} minWidth={720} label="Run events, in order">
            <LedgerHead cols={EVENT_COLS} />
            {/* Each event is a Fragment, not a wrapper div: `LedgerSection` is
                the ARIA rowgroup, and a div between it and its rows would break
                the table tree. */}
            <LedgerSection>
              {events.map((e) => (
                <Fragment key={e.id}>
                  <LedgerMicroRow>
                    <LedgerCell mono muted title={fmtDateTimeTz(e.createdAt, tz)}>
                      {fmtTimeTz(e.createdAt, tz)}
                    </LedgerCell>
                    <LedgerCell mono muted title={e.stage}>
                      {upper(e.stage)}
                    </LedgerCell>
                    {/* `tone`, not `className` — as a class, ERROR's carmine
                        lost to the cell's `text-ink-2` and read as INFO. */}
                    <LedgerCell mono tone={LEVEL_COLOR[e.level]} className="font-semibold">
                      {e.level}
                    </LedgerCell>
                    {/* Redacted here too. An event message is usually the
                        agent's own prose, but the failure paths that reach
                        `CollectionError.message` are frequently logged as an
                        event first, and one unredacted surface is enough. */}
                    <LedgerCell title={redactPaths(e.message)}>{redactPaths(e.message)}</LedgerCell>
                  </LedgerMicroRow>

                  {/* An event's payload hangs UNDER its line, indented to the
                      message column, so the stream still reads as one column of
                      timestamps. Closed by default: the log is the record, the
                      JSON is the appendix. */}
                  {e.data != null ? (
                    <div
                      role="row"
                      className={`border-b border-feint py-1 pr-3.5 ${DATA_INDENT}`}
                    >
                      <div role="cell">
                        <details className="group">
                          <summary className="inline-flex cursor-pointer list-none font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3 hover:text-ink">
                            <span aria-hidden className="mr-1.5">
                              +
                            </span>
                            Data
                          </summary>
                          <Well className="mt-1.5 max-w-3xl">
                            <pre className="overflow-x-auto font-mono text-[10.5px] leading-[1.5]">
                              {JSON.stringify(e.data, null, 2)}
                            </pre>
                          </Well>
                        </details>
                      </div>
                    </div>
                  ) : null}
                </Fragment>
              ))}
            </LedgerSection>
          </Ledger>
        )}
      </section>

      {/* ── II · Collection errors ───────────────────────────────────────── */}
      <section className="mt-5">
        <SectionRule
          label="Collection errors"
          tick={run.errors.length > 0 ? "carmine" : undefined}
          right={
            run.errors.length > 0
              ? `${run.errors.length} SOURCE FAILURE${run.errors.length === 1 ? "" : "S"}`
              : "NONE"
          }
        />
        {run.errors.length === 0 ? (
          <div className="rounded border border-rule bg-surface">
            <EmptyState
              title="No collection errors"
              hint="Every source fetch in this run succeeded."
            />
          </div>
        ) : (
          <ul className="rounded border border-rule bg-surface">
            {run.errors.map((err) => (
              <li key={err.id} className="border-b border-feint px-3.5 py-2.5 last:border-b-0">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-carmine">
                    {err.dataSource?.name ?? "Unknown source"}
                  </span>
                  <span
                    className="font-mono text-[10.5px] text-ink-3"
                    title={fmtDateTimeTz(err.createdAt, tz)}
                  >
                    {fmtTimeTz(err.createdAt, tz)}
                  </span>
                  {err.url ? (
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-ink-3" title={err.url}>
                      {err.url}
                    </span>
                  ) : null}
                </div>
                {/* The classified line leads; the machine's full paragraph
                    waits behind a disclosure. This used to print `err.message`
                    raw, which for a Prisma failure is the absolute path of the
                    file the query lives in plus an excerpt of this repo's
                    source — thirteen of them on one run, two screens of a home
                    directory on a page anyone can be shown. Both halves go
                    through `redactPaths`. That sentence used to end "so no
                    branch can put a path on screen", which the function did
                    not deliver: it required a file extension and so ignored
                    every path ending in a directory. The claim is now carried
                    by `tests/unit/redact.test.ts`, which asserts the property
                    over the shapes that leaked, rather than by this comment.
                    See the block comment in ../meta.ts. */}
                <p className="mt-1.5 rounded border border-rule bg-inset px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] text-carmine">
                  {summarizeFailure(err.message)}
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 hover:text-ink">
                    Full failure text
                  </summary>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded border border-rule bg-inset px-2.5 py-1.5 font-mono text-[10.5px] leading-[1.5] text-ink-2">
                    {redactPaths(err.message)}
                  </pre>
                </details>
                {err.detail ? (
                  <p className="mt-1 text-[12px] text-ink-3">{err.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* "0 COUNTED ERRORS" was the last thing a reader saw on a run that had
          just told them, six times, that it could not read a source. It is
          still true and still printed — `statErrors` counts the stats blob's
          error buckets, which is what `run.ts` grades on — but it no longer
          stands alone, and the phrasing now says which population it counted
          rather than implying it counted everything that went wrong. */}
      <Footnote
        legend={[
          `RUN ${day}`,
          // "FAILED IN DID NOT FINISH" is not a sentence. When there is no
          // runtime to report, the status and the reason are simply adjacent.
          dur.unfinished
            ? `${upper(RUN_STATUS_LABELS[run.status])} · ${upper(dur.sentence)}`
            : `${upper(RUN_STATUS_LABELS[run.status])} IN ${upper(dur.text)}`,
          `${events.length} EVENTS`,
          `${above.total} ABOVE INFO`,
          `${run.errors.length} SOURCE FAILURE${run.errors.length === 1 ? "" : "S"}`,
          `${counterErrors} IN THE ERROR COUNTERS`,
        ].join(" · ")}
        /* See `runs/page.tsx` — `--rule` is graphic only, never text. */
        keys={
          <Legend
            items={[
              { mark: "RUN DATE", meaning: "calendar day" },
              { mark: "EVENT TIMES", meaning: `clock ${tz}` },
            ]}
          />
        }
      />
    </>
  );
}
