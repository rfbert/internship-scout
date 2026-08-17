import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, SampleBadge, rowRoleCls } from "@/components/ui";
import { PageFrame } from "@/components/register/page-frame";
import { Footnote } from "@/components/register/footnote";
import {
  Ledger,
  LedgerCell,
  LedgerHead,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { BAND_LABELS, TOKEN_TEXT } from "@/lib/format";
import { readUiPrefs } from "@/server/ui-prefs";
import { fmtDateTz } from "@/lib/dates";
import { DECISION_LABELS, decisionTone } from "@/app/review/meta";
import { ARCHIVED_STATES, type ArchivedState } from "./meta";
import { ArchiveFilterChips, type ArchiveFilters } from "./archive-filters";
import { RestoreButton } from "./restore-button";

export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   CLOSED RECORDS — `/archive` (spec C4)

   The same instrument as `/opportunities`, pointed at what was decided against.
   It was already a table, so the conversion is an idiom swap: the bespoke
   `<table>` head becomes `Ledger` + `LedgerHead`, the second hand-rolled
   chip row becomes `Chip`, and the restore verb becomes `OutlineVerb`.

   Nothing about restoring changed — same endpoint, same payload, same refresh.
   ══════════════════════════════════════════════════════════════════════════ */

const COLS: LedgerCol[] = [
  { label: "Company — Role", w: "minmax(0,1.6fr)" },
  /* A bare numeral now (see the SCORE cell below), so the track no longer has
     to hold `98 HIGH PRIORITY`: 104px → 64px.

     WHAT THOSE 40px ACTUALLY BUY, since this comment used to claim they went
     "back to Reason and Note" and at the width this constant governs they do
     not. `MIN_WIDTH` came down by the same 40px in the same commit, so at the
     floor the flexible space is unchanged — measured in the browser at a
     1100px viewport, the three `fr` tracks total 650.0px both before and
     after, because 1140 − 406 fixed and 1180 − 446 fixed are the same
     subtraction. What the floor gains is 40px LESS HORIZONTAL SCROLL inside
     the ledger's own frame (178px → 138px at that viewport).

     Above 1180 the gain is real and is the one first claimed: the container
     sets the width, the fixed tracks shrank, and the 40px does go to Company,
     Reason and Note. */
  { label: "Score", w: "64px", align: "right" },
  { label: "State", w: "126px" },
  { label: "Reason", w: "minmax(0,0.9fr)" },
  { label: "Decided", w: "100px" },
  { label: "Note", w: "minmax(0,1fr)" },
  { label: "", w: "116px", align: "right" },
];

/** Below this the ledger scrolls inside itself — the page never does. */
const MIN_WIDTH = 1140;

/** `decisionTone` still speaks the old `Tone` vocabulary; the cell needs a token. */
const DECISION_COLOR = {
  accent: "blue",
  success: "green",
  warning: "ochre",
  danger: "carmine",
  neutral: "ink-3",
} as const;

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const stateParam = typeof sp.state === "string" ? sp.state : undefined;
  const filters: ArchiveFilters = {
    state: ARCHIVED_STATES.includes(stateParam as ArchivedState)
      ? (stateParam as ArchivedState)
      : undefined,
    reason: typeof sp.reason === "string" ? sp.reason : undefined,
  };

  const user = await prisma.user.findFirst();
  const [reasons, prefs] = await Promise.all([
    prisma.discardReason.findMany({
      orderBy: { sortOrder: "asc" },
      select: { key: true, label: true },
    }),
    readUiPrefs(),
  ]);
  // `decidedAt` is a true instant — the moment you archived the row — so it
  // reads in your zone, not the deployment's UTC wall clock.
  const { timezone } = prefs;

  const where: Prisma.UserListingDecisionWhereInput = {
    ...(user ? { userId: user.id } : {}),
    state: filters.state ? filters.state : { in: [...ARCHIVED_STATES] },
    ...(filters.reason ? { discardReason: { key: filters.reason } } : {}),
    listing: { deletedAt: null },
  };

  const decisions = user
    ? await prisma.userListingDecision.findMany({
        where,
        include: {
          discardReason: true,
          listing: { include: { company: true } },
        },
        orderBy: { decidedAt: "desc" },
      })
    : [];

  const anyFilter = Boolean(filters.state || filters.reason);

  /* No legend. A legend expands the marks that are ON SCREEN, and after the
     band came out of the SCORE column this page prints no coded mark at all —
     every state and every reason is already a full English phrase. */

  const filterLine = anyFilter
    ? [
        filters.state ? DECISION_LABELS[filters.state] : null,
        filters.reason
          ? (reasons.find((r) => r.key === filters.reason)?.label ?? filters.reason)
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
        .toUpperCase()
    : "ALL CLOSED STATES";

  return (
    <>
      <PageFrame
        eyebrow="CLOSED RECORDS · DISCARDED · INELIGIBLE · DUPLICATE · APPLIED"
        title="Archive"
        figures={
          <>
            {decisions.length} {decisions.length === 1 ? "record" : "records"}
            <br />
            {filterLine}
          </>
        }
      />

      <ArchiveFilterChips
        filters={filters}
        reasons={reasons}
        right={
          <span className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
            {decisions.length} shown
          </span>
        }
      />

      {decisions.length === 0 ? (
        <Card>
          <EmptyState
            title={anyFilter ? "Nothing archived matches these filters" : "The archive is empty"}
            hint={
              anyFilter
                ? "Try clearing a filter — archived items keep their state and discard reason."
                : "Listings you discard, mark ineligible or duplicate, or flag as already applied land here. The agent never re-recommends an archived listing unless its content materially changes, and you can restore any of them to the review queue."
            }
          />
        </Card>
      ) : (
        <Ledger cols={COLS} minWidth={MIN_WIDTH} label="Archived decisions">
          <LedgerHead cols={COLS} />
          <LedgerSection>
            {decisions.map((d) => {
              const l = d.listing;
              return (
                /* No `struck` here, deliberately. `LedgerRow`'s strikethrough
                   says "this record is closed" on a docket where most are open;
                   on a page where EVERY record is closed it marks nothing and
                   costs the titles their legibility — and Restore is this
                   page's one verb, so the title has to stay readable. The STATE
                   column carries the closure, in words. */
                <LedgerRow key={d.id} title={`${l.company.name} — ${l.title}`}>
                  <LedgerCell title={`${l.company.name} — ${l.title}`}>
                    <span data-row-title className="text-[13px]">
                      <span className="font-semibold">{l.company.name}</span>
                      <span aria-hidden className="mx-1 text-ink-3">
                        —
                      </span>
                      <span className={rowRoleCls}>{l.title}</span>
                    </span>
                    {l.isSample || l.company.isSample ? (
                      <span className="ml-1.5">
                        <SampleBadge isSample />
                      </span>
                    ) : null}
                    {l.postingUrl ? (
                      <a
                        href={l.postingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open the original posting"
                        aria-label={`Open the original posting for ${l.title} at ${l.company.name}`}
                        className="ml-1.5 font-mono text-[11px] text-blue underline-offset-2 hover:underline"
                      >
                        ↗
                      </a>
                    ) : null}
                  </LedgerCell>

                  {/* The NUMERAL only — no band word, and no band color.

                      86 of the 88 records on this page carry the band
                      INELIGIBLE and 83 of them carry the state MARKED
                      INELIGIBLE, so the ledger printed the word `INELIGIBLE`
                      twice per row, in carmine, in adjacent columns. Of the
                      two, STATE is the one that earns its column: it is the
                      dimension the chips above filter on, and it is the only
                      thing that tells one closed record from another. The band
                      is a classification of the SCORE, and on a page where it
                      is constant it classifies nothing — while the score
                      itself (a 70 you closed reads very differently from a 29)
                      still does real work.

                      D3 is satisfied by removal, not by color: no band meaning
                      is carried here at all, so none is carried by color
                      alone.

                      AND THE BAND IS GONE FROM THIS PAGE, FOR EVERYONE. This
                      comment used to say it "still rides `title`/`aria-label`".
                      There is no `aria-label` — `LedgerRow` below is passed
                      only `title` — and `title` on a `role="cell"` div is an
                      accessible DESCRIPTION at best, announced inconsistently
                      and unreachable by keyboard or touch. So the claim was
                      false twice over.

                      It is corrected rather than made true because making it
                      true is the worse option here. Adding the band to the
                      cell's accessible name would rebuild, in audio, exactly
                      the duplication that was removed from the page: a screen
                      reader would hear "70, ineligible" and then "marked
                      ineligible" one cell later, on 83 of 88 rows. Nothing
                      filters or sorts on the band, so a reader who never sees
                      it loses no capability. What remains is a sighted hover
                      hint, which is a convenience and is not load-bearing. */}
                  <LedgerCell
                    align="right"
                    mono
                    title={
                      l.currentBand
                        ? `Score ${l.currentScore ?? "—"} · ${BAND_LABELS[l.currentBand]}`
                        : undefined
                    }
                  >
                    <span className="text-[12.5px] font-semibold text-ink">
                      {l.currentScore ?? "—"}
                    </span>
                  </LedgerCell>

                  <LedgerCell>
                    <span
                      className={`font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
                        TOKEN_TEXT[DECISION_COLOR[decisionTone(d.state)]]
                      }`}
                    >
                      {DECISION_LABELS[d.state]}
                    </span>
                  </LedgerCell>

                  <LedgerCell mono muted title={d.discardReason?.label ?? undefined}>
                    {d.discardReason?.label.toUpperCase() ?? "—"}
                  </LedgerCell>

                  <LedgerCell mono muted>
                    {fmtDateTz(d.decidedAt, timezone).toUpperCase()}
                  </LedgerCell>

                  <LedgerCell muted title={d.note ?? undefined}>
                    {d.note ? <span className="text-[12.5px]">{d.note}</span> : "—"}
                  </LedgerCell>

                  <LedgerCell align="right" className="overflow-visible">
                    <RestoreButton listingId={l.id} />
                  </LedgerCell>
                </LedgerRow>
              );
            })}
          </LedgerSection>
        </Ledger>
      )}

      <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
        Never hard-deleted · not re-recommended unless the posting materially changes ·
        restoring returns a record to the{" "}
        <Link href="/review" className="underline-offset-2 hover:text-ink hover:underline">
          review queue
        </Link>
      </p>

      <Footnote
        legend={<span>Every record here is closed — the register keeps them all.</span>}
        keys={<span>Restore returns a record to the review queue</span>}
      />
    </>
  );
}
