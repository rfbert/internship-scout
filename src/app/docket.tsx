import type { ReactNode } from "react";
import Link from "next/link";
import type {
  DeadlineKind,
  ReferralStage,
  ScoreBand,
  SponsorshipCategory,
  SponsorshipConfidence,
} from "@prisma/client";
import {
  Ledger,
  LedgerRow,
  LedgerCell,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { SectionRule } from "@/components/register/rule";
import { Band, Estimated, Sponsorship } from "@/components/register/notation";
import { EmptyState, SampleBadge, rowRoleCls } from "@/components/ui";
import { DEADLINE_KIND_LABELS, REFERRAL_STAGE_LABELS, bandIsStruck, fmtAgo } from "@/lib/format";

/* ══════════════════════════════════════════════════════════════════════════
   THE MORNING DOCKET — the dashboard's left column.

   Three ruled sections, all on the one table idiom (B3 #9): the day's duties,
   the overnight intake, and the correspondence that is waiting on a reply.
   `page.tsx` owns every query and every derivation; this file owns only the
   rendering, which is why it takes flat props rather than Prisma payloads.

   Two things the mock shows that are deliberately NOT built here, both for the
   same reason — there is no data or no behavior behind them, and C1's rule is
   to drop the element rather than add a query:

     · The leading CHECKBOX. `liveDeadline` filters `completedAt: null`, so a
       completed duty is never loaded and the box could never be ticked; there
       is also no write path from this page (D4). A control that cannot act is
       worse than no control, so the leading cell is the dated status stamp the
       mock also carries — `OVERDUE 1d` / `TODAY` — and nothing pretends to be
       interactive.
     · The `SOURCE` column on the acquisitions rows (`greenhouse`, `lever`).
       `InternshipListing` has no source scalar — sources are the
       `InternshipSource[]` relation, which the dashboard's query does not
       include and may not start including (D4).
   ══════════════════════════════════════════════════════════════════════════ */

/* ── I · The day's duties ─────────────────────────────────────────────────── */

export interface DocketDuty {
  id: string;
  /** Whole days past due. `0` = due today, `null` = later today's list only. */
  overdueDays: number | null;
  /** Already formatted in the user's zone, e.g. `AUG 12`. */
  dayStamp: string;
  company: string | null;
  title: string;
  kind: DeadlineKind;
  isEstimated: boolean;
  isSample: boolean;
}

const DOCKET_COLS: LedgerCol[] = [
  { label: "When", w: "112px" },
  { label: "Duty", w: "minmax(0,1fr)" },
  { label: "Due", w: "160px", align: "right" },
];

/**
 * The empty frame. Deliberately NOT a `Ledger` with an `EmptyState` inside a
 * `LedgerSection`: that puts a non-row element inside `role="rowgroup"`, which
 * is an illegal ARIA table tree (D7). An empty section is a sheet, not a table.
 */
function EmptySheet({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded border border-rule bg-surface">
      <EmptyState title={title} hint={hint} />
    </div>
  );
}

export function Docket({
  weekday,
  duties,
  queueCount,
}: {
  /** `SATURDAY` — the docket is always the docket *of a day*. */
  weekday: string;
  duties: DocketDuty[];
  /** Listings sitting in the review queue; the queue is itself a duty. */
  queueCount: number;
}) {
  const overdue = duties.filter((d) => d.overdueDays != null && d.overdueDays > 0).length;
  const due = duties.length - overdue;

  return (
    <section>
      <SectionRule
        /* `Duties`, not `Docket`. /review teaches "the docket" and means the
           review queue by it; this section is the day's deadlines, and the
           ledger under it already calls them duties. One word, one thing. */
        label={`Duties · ${weekday}`}
        right={
          duties.length === 0 && queueCount === 0
            ? "NOTHING DUE"
            : `${overdue} OVERDUE · ${due} DUE`
        }
      />
      {duties.length === 0 && queueCount === 0 ? (
        <EmptySheet
          title="The day is clear"
          hint="Deadlines and follow-ups land here on the morning they come due."
        />
      ) : (
        <Ledger cols={DOCKET_COLS} minWidth={520} label={`Duties for ${weekday}`}>
          <LedgerSection>
            {duties.map((d) => {
              const late = d.overdueDays != null && d.overdueDays > 0;
              return (
                <LedgerRow
                  key={d.id}
                  tick={late ? "carmine" : undefined}
                  title={`${DEADLINE_KIND_LABELS[d.kind]} · due ${d.dayStamp}`}
                >
                  <LedgerCell mono>
                    {late ? (
                      <span className="font-semibold uppercase tracking-[0.06em] text-carmine">
                        Overdue {d.overdueDays}d
                      </span>
                    ) : (
                      <span className="uppercase tracking-[0.06em]">Today</span>
                    )}
                  </LedgerCell>
                  <LedgerCell title={`${d.company ? `${d.company} · ` : ""}${d.title}`}>
                    {d.company ? <b className="font-semibold">{d.company}</b> : null}
                    {d.company ? <span className={rowRoleCls}> · </span> : null}
                    <span className={rowRoleCls}>{d.title}</span>{" "}
                    <SampleBadge isSample={d.isSample} />
                  </LedgerCell>
                  <LedgerCell mono align="right" muted>
                    {d.isEstimated ? (
                      <Estimated label={`${d.dayStamp}, ${DEADLINE_KIND_LABELS[d.kind]}`}>
                        {d.dayStamp}
                      </Estimated>
                    ) : (
                      d.dayStamp
                    )}
                  </LedgerCell>
                </LedgerRow>
              );
            })}

            {/* The queue is a duty like any other — it is the one the whole page
                is arguing for, so it gets the day's only verb-shaped link. */}
            {queueCount > 0 ? (
              <LedgerRow title="Open the review queue">
                <LedgerCell mono>
                  <span className="uppercase tracking-[0.06em]">Today</span>
                </LedgerCell>
                <LedgerCell>
                  <b className="font-semibold">Clear the review queue</b>
                  <span className={rowRoleCls}>
                    {" "}
                    · {queueCount} record{queueCount === 1 ? "" : "s"} awaiting a verdict
                  </span>
                </LedgerCell>
                <LedgerCell align="right">
                  <Link
                    href="/review"
                    className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-blue underline-offset-2 hover:underline"
                  >
                    Review →
                  </Link>
                </LedgerCell>
              </LedgerRow>
            ) : null}
          </LedgerSection>
        </Ledger>
      )}
    </section>
  );
}

/* ── II · Acquisitions ────────────────────────────────────────────────────── */

export interface AcquisitionRow {
  id: string;
  listingId: string;
  company: string;
  title: string;
  score: number | null;
  band: ScoreBand | null;
  category: SponsorshipCategory | null;
  confidence: SponsorshipConfidence | null;
  location: string;
  /** Discovered on today's calendar day, in the user's zone. */
  isNew: boolean;
  isSample: boolean;
}

const ACQUISITION_COLS: LedgerCol[] = [
  { label: "Score", w: "132px", align: "right" },
  { label: "Company — role", w: "minmax(0,1fr)" },
  { label: "Sponsorship", w: "180px" },
  { label: "Location", w: "132px" },
  { label: "", w: "48px", align: "right" },
];

export function Acquisitions({
  rows,
  queueCount,
  right,
  spectrum,
}: {
  rows: AcquisitionRow[];
  queueCount: number;
  /** The intake readout: `31 NEW TODAY · 9 QUEUED`. */
  right: string;
  /**
   * A `Spectrum` well, printed between the section rule and the rows (C1). It
   * answers the question the rows cannot: is tonight's intake good, or does it
   * only contain one good thing?
   */
  spectrum?: ReactNode;
}) {
  return (
    <section className="mt-4">
      {/* Not "Overnight": the readout on the right counts today's day key, so a
          run at 3pm files rows here, and the rows themselves are the best
          undecided records whenever they were found. */}
      <SectionRule label="Acquisitions" right={right} />
      {rows.length === 0 ? (
        <EmptySheet
          title="Nothing awaiting review"
          hint="New listings land here after each agent run. Check Data Sources, or trigger a run from Runs."
        />
      ) : (
        <>
          {spectrum ? <div className="py-2.5">{spectrum}</div> : null}
          <Ledger cols={ACQUISITION_COLS} minWidth={760} label="Acquisitions">
            <LedgerSection>
              {rows.map((r) => (
                <LedgerRow key={r.id} struck={bandIsStruck(r.band)}>
                  <LedgerCell align="right">
                    <Band band={r.band} score={r.score} />
                  </LedgerCell>
                  <LedgerCell title={`${r.company} — ${r.title}`}>
                    <Link
                      href={`/review?listing=${r.listingId}`}
                      className="underline-offset-2 hover:underline"
                      data-row-title
                    >
                      <b className="font-semibold">{r.company}</b>
                      <span className={rowRoleCls}> — {r.title}</span>
                    </Link>{" "}
                    <SampleBadge isSample={r.isSample} />
                  </LedgerCell>
                  <LedgerCell>
                    <Sponsorship category={r.category} confidence={r.confidence} />
                  </LedgerCell>
                  <LedgerCell mono muted title={r.location}>
                    {r.location}
                  </LedgerCell>
                  <LedgerCell align="right">
                    {/* 10px is the type floor (B1) — the 9.5px step is deleted. */}
                    {r.isNew ? (
                      <span className="rounded border border-green px-1 py-px font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-green">
                        New
                      </span>
                    ) : null}
                  </LedgerCell>
                </LedgerRow>
              ))}
            </LedgerSection>
          </Ledger>
          <p className="mt-1.5 font-mono text-[11px] tracking-[0.04em] text-ink-3">
            <Link
              href="/review"
              className="font-semibold uppercase tracking-[0.08em] text-blue underline-offset-2 hover:underline"
            >
              Review all {queueCount} in queue →
            </Link>{" "}
            · showing the top {rows.length} by score
          </p>
        </>
      )}
    </section>
  );
}

/* ── III · Correspondence ─────────────────────────────────────────────────── */

export interface CorrespondenceRow {
  id: string;
  name: string;
  /** `Stripe, APM team · Product Intern` — position and what it is about. */
  context: string;
  stage: ReferralStage;
  updatedAt: Date;
}

const CORRESPONDENCE_COLS: LedgerCol[] = [
  { label: "Contact", w: "160px" },
  { label: "Context", w: "minmax(0,1fr)" },
  { label: "Stage", w: "170px" },
  { label: "Last touch", w: "110px", align: "right" },
];

export function Correspondence({ rows }: { rows: CorrespondenceRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-4">
      <SectionRule
        label="Correspondence"
        right={`REFERRALS · ${rows.length} OPEN`}
      />
      <Ledger cols={CORRESPONDENCE_COLS} minWidth={620} label="Referrals awaiting follow-up">
        <LedgerSection>
          {rows.map((r) => (
            <LedgerRow key={r.id}>
              <LedgerCell title={r.name}>
                <b className="font-semibold">{r.name}</b>
              </LedgerCell>
              <LedgerCell muted title={r.context}>
                {r.context}
              </LedgerCell>
              <LedgerCell mono>
                <span
                  className={`uppercase tracking-[0.06em] ${
                    r.stage === "REFERRAL_REQUESTED" ? "text-ochre" : "text-blue"
                  }`}
                >
                  {REFERRAL_STAGE_LABELS[r.stage]}
                </span>
              </LedgerCell>
              <LedgerCell mono align="right" muted>
                {fmtAgo(r.updatedAt)}
              </LedgerCell>
            </LedgerRow>
          ))}
        </LedgerSection>
      </Ledger>
    </section>
  );
}
