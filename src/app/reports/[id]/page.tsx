import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageFrame } from "@/components/register/page-frame";
import { Footnote, Legend } from "@/components/register/footnote";
import { DotLeader, SectionRule } from "@/components/register/rule";
import { EmptyState } from "@/components/ui";
import { TOKEN_TEXT, fmtAgo, upper } from "@/lib/format";
import { fmtDateTimeTz, fmtDateTz } from "@/lib/dates";
import { readUiPrefs } from "@/server/ui-prefs";
import { SEND_MODE_LABELS, fmtChars, resolveDispatch } from "../meta";
import { DigestFrame } from "../digest-frame";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   ONE DISPATCH, AS COMPOSED — `/reports/[id]`

   Three things, in the order a reader needs them:
     I   · THE DELIVERY RECORD — what happened to it, and why. While sending is
           off this is the only account of that, so it leads.
     II  · THE RENDERED DIGEST — the HTML, quarantined in a sandboxed iframe.
           See `../digest-frame.tsx` for why it is an iframe and why the CSP
           did not have to change.
     III · THE PLAIN-TEXT ALTERNATIVE — the multipart `text/plain` half. It is
           not a duplicate: links inside the sandboxed frame are inert, so this
           is where the reader gets a selectable URL, and it is what a text-only
           client would actually show.

   THE TWO CLOCKS (same rule as /runs and the index):
     · `reportDate` is `@db.Date` — Prisma hydrates it at exactly UTC midnight,
       so it is a floating calendar day and `fmtDateTz` renders its UTC day.
     · `sentAt` and `createdAt` are true instants, rendered in the user's
       stored timezone.
   ══════════════════════════════════════════════════════════════════════════ */

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [report, prefs] = await Promise.all([
    prisma.emailReport.findUnique({ where: { id } }),
    readUiPrefs(),
  ]);
  if (!report) notFound();

  const tz = prefs.timezone;
  const day = upper(fmtDateTz(report.reportDate, tz));
  const outcome = resolveDispatch({
    sendMode: report.sendMode,
    sentAt: report.sentAt,
    skippedReason: report.skippedReason,
    error: report.error,
    htmlChars: report.htmlBody.length,
    textChars: report.textBody.length,
  });

  return (
    <div className="min-w-0">
      <div className="pt-3.5">
        <Link
          href="/reports"
          className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          ← All reports
        </Link>
      </div>

      <PageFrame
        eyebrow={`DISPATCH BOOK · REPORT ${day} · ${upper(report.kind)}`}
        title={report.subject}
        figures={
          <>
            <span className={`font-semibold ${TOKEN_TEXT[outcome.tone]}`}>{outcome.label}</span> ·{" "}
            {SEND_MODE_LABELS[report.sendMode]}
            <br />
            Composed {fmtDateTimeTz(report.createdAt, tz)} · {fmtAgo(report.createdAt)}
          </>
        }
      />

      {/* ── I · The delivery record ──────────────────────────────────────── */}
      <section>
        <SectionRule
          label="Delivery record"
          tick={outcome.tone}
          right={`${upper(outcome.label)} · ${upper(SEND_MODE_LABELS[report.sendMode])}`}
        />

        {/* The explanation in a full sentence, above the dot-leaders. A reader
            who came here asking "why didn't I get this?" gets the answer in
            prose before they get it in fields. */}
        {outcome.detail ? (
          <p className={`px-1 pt-2.5 text-[12.5px] ${TOKEN_TEXT[outcome.tone]}`}>
            <span className="mr-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em]">
              {outcome.label}
            </span>
            {outcome.detail}
          </p>
        ) : null}

        <div className="grid gap-x-10 px-1 pt-2 lg:grid-cols-2">
          <ul>
            <DotLeader
              label="Report date"
              value={day}
              title="A calendar day (Postgres date), not a timestamp — rendered as its own day in every timezone."
            />
            <DotLeader label="Kind" value={upper(report.kind)} />
            <DotLeader
              label="Outcome"
              value={<span className={TOKEN_TEXT[outcome.tone]}>{outcome.label}</span>}
            />
            <DotLeader
              label="Send mode"
              value={
                <span className={report.sendMode === "DRY_RUN" ? TOKEN_TEXT.ochre : TOKEN_TEXT.green}>
                  {SEND_MODE_LABELS[report.sendMode]}
                </span>
              }
              title={
                report.sendMode === "DRY_RUN"
                  ? "EMAIL_MODE=dry-run when this ran: the digest is stored but no transport is called."
                  : "A live transport was selected for this report."
              }
            />
          </ul>
          <ul>
            <DotLeader
              label="Sent at"
              value={report.sentAt ? fmtDateTimeTz(report.sentAt, tz) : "never"}
              muted={!report.sentAt}
              title={report.sentAt ? `Clock: ${tz}` : "No transport ever acknowledged this report."}
            />
            <DotLeader
              label="Composed at"
              value={fmtDateTimeTz(report.createdAt, tz)}
              title={`Clock: ${tz}`}
            />
            <DotLeader
              label="Skipped reason"
              value={report.skippedReason ?? "—"}
              muted={!report.skippedReason}
            />
            <DotLeader
              label="Stored size"
              value={`${fmtChars(report.htmlBody.length)} HTML · ${fmtChars(
                report.textBody.length
              )} text`}
              muted={!outcome.composed}
            />
          </ul>
        </div>

        {/* The transport's own words, in the inset treatment every quoted
            machine string gets on this codebase — it is evidence, not prose. */}
        {report.error ? (
          <pre className="mx-1 mt-2.5 overflow-x-auto whitespace-pre-wrap break-words rounded border border-carmine bg-inset px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] text-carmine">
            {report.error}
          </pre>
        ) : null}
      </section>

      {/* ── II · The rendered digest ─────────────────────────────────────── */}
      <section className="mt-5">
        <SectionRule
          label="Rendered digest"
          right={
            outcome.composed
              ? `${upper(fmtChars(report.htmlBody.length))} · SANDBOXED · LINKS INERT`
              : "NOT COMPOSED"
          }
        />
        {outcome.composed ? (
          <div className="mt-2 overflow-hidden rounded border border-rule bg-surface">
            <DigestFrame html={report.htmlBody} subject={report.subject} />
          </div>
        ) : (
          <div className="mt-2 rounded border border-rule bg-surface">
            <EmptyState
              title="No digest was composed"
              hint="The run reached the email stage and decided there was nothing worth reporting, so it stored the decision instead of a message. The reason is in the delivery record above."
            />
          </div>
        )}
        {/* Only when there IS a frame. Explaining the sandbox under an empty
            state describes something that is not on the page. */}
        {outcome.composed ? (
          <p className="px-1 pt-2 text-[11.5px] text-ink-3">
            Shown in a sandboxed frame with scripting off, so the digest cannot reach this page and
            its links do not navigate. The email is a light-theme sheet by design (spec A6) and
            does not follow the register&rsquo;s theme. Copy a link from the plain-text alternative
            below.
          </p>
        ) : null}
      </section>

      {/* ── III · The plain-text alternative ─────────────────────────────── */}
      <section className="mt-5">
        <SectionRule
          label="Plain-text alternative"
          right={
            outcome.composed ? `${upper(fmtChars(report.textBody.length))} · AS STORED` : "EMPTY"
          }
        />
        {report.textBody.length > 0 ? (
          <pre className="mx-1 mt-2 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded border border-rule bg-inset px-3 py-2.5 font-mono text-[11.5px] leading-[1.6] text-ink-2">
            {report.textBody}
          </pre>
        ) : (
          <div className="mt-2 rounded border border-rule bg-surface">
            <EmptyState
              title="No text body stored"
              hint="Nothing was composed for this day, so the text/plain half is empty too."
            />
          </div>
        )}
      </section>

      <Footnote
        legend={`REPORT ${day} · ${upper(outcome.label)} · ${upper(
          SEND_MODE_LABELS[report.sendMode]
        )} · ${upper(fmtChars(report.htmlBody.length))} HTML`}
        /* Same two-item glossary as the index; same reason it is no longer a
           `|` painted in `--rule`, which is a graphic-only token and measured
           1.47:1 in day, 1.64:1 at night when used as text. */
        keys={
          <Legend
            items={[
              { mark: "REPORT DATE", meaning: "calendar day" },
              { mark: "SENT / COMPOSED", meaning: `clock ${tz}` },
            ]}
          />
        }
      />
    </div>
  );
}
