import type { ApplicationStage, Priority, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDaysToDayKey, dayKeyTz, utcDayStart } from "@/lib/dates";
import { CLOSED_OUT_STAGES, OPEN_STAGE_FILTER, isFollowUpOverdue } from "@/lib/stages";
import { accessionMap } from "@/server/accession";
import { readUiPrefs } from "@/server/ui-prefs";
import { PRIORITY_ORDER, STAGE_ORDER } from "./meta";
import type { TrackerFilters, TrackerLayout, TrackerRow } from "./types";
import { TrackerClient } from "./tracker-client";

export const dynamic = "force-dynamic";

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // `?view=kanban` is retired with the board itself. An old bookmark carrying
  // it is simply ignored — it falls through to the register, never a 404.
  const layout: TrackerLayout = sp.layout === "flat" ? "flat" : "grouped";
  const stage =
    typeof sp.stage === "string" && (STAGE_ORDER as string[]).includes(sp.stage)
      ? (sp.stage as ApplicationStage)
      : undefined;
  const priority =
    typeof sp.priority === "string" && (PRIORITY_ORDER as string[]).includes(sp.priority)
      ? (sp.priority as Priority)
      : undefined;
  const overdue = sp.overdue === "1";
  const filters: TrackerFilters = { stage, priority, overdue };

  const user = await prisma.user.findFirst();
  const { timezone } = await readUiPrefs();
  // One clock for the whole page: the query below, the overdue chip's total and
  // the `now` the register renders against all read this instant.
  const now = new Date();

  // Overdue means the follow-up's PRINTED day is already past and the
  // application is not closed out — `isFollowUpOverdue` from @/lib/stages, the
  // same function the row badge calls. SQL can express neither half of it (a
  // day key is not a column, and the stage set has to survive an explicit
  // `?stage=`), so the queries here widen to the far edge of the ±1-day bracket
  // around today's UTC midnight (see `utcDayStart`) and the predicate makes
  // every real call in JS. Filtering on the raw instant instead is what stamped
  // OVERDUE on a follow-up due today: it is stored at noon UTC, so it fell
  // behind `new Date()` from 05:00 Pacific onward while still printing today.
  const overdueBracketEnd = utcDayStart(addDaysToDayKey(dayKeyTz(now, timezone), 1));

  const where: Prisma.ApplicationWhereInput = {
    ...(user ? { userId: user.id } : {}),
    deletedAt: null,
    ...(stage ? { stage } : {}),
    ...(priority ? { priority } : {}),
    ...(overdue
      ? {
          followUpAt: { lt: overdueBracketEnd },
          // The stage restriction is NOT dropped for an explicit `?stage=`, and
          // it rides `AND` because the `stage` key above may already be spoken
          // for — a spread would silently overwrite one of the two. Asking for
          // `?overdue=1&stage=REJECTED` therefore returns nothing, which is the
          // honest answer: a closed-out application has no overdue follow-ups.
          // It used to return rows that the badge, the section summary and the
          // chip then all refused to call overdue.
          AND: [{ stage: OPEN_STAGE_FILTER }],
        }
      : {}),
  };

  // The spine index shows the whole network regardless of filters — a map, not
  // a result count — so its per-stage totals come from an unfiltered query.
  const stageCountsRaw = user
    ? await prisma.application.groupBy({
        by: ["stage"],
        where: { userId: user.id, deletedAt: null },
        _count: { _all: true },
      })
    : [];
  const stageCounts = Object.fromEntries(
    stageCountsRaw.map((g) => [g.stage, g._count._all])
  ) as Partial<Record<ApplicationStage, number>>;

  // Network-wide overdue follow-ups — the toolbar chip's count keeps this
  // scope no matter which filters are active, same as the spine's totals. A
  // `count` cannot be day-key-aware, so this selects the one column the test
  // needs and counts the survivors.
  const overdueCandidates = user
    ? await prisma.application.findMany({
        where: {
          userId: user.id,
          deletedAt: null,
          followUpAt: { lt: overdueBracketEnd },
          stage: OPEN_STAGE_FILTER,
        },
        select: { followUpAt: true, stage: true },
      })
    : [];
  const overdueTotal = overdueCandidates.filter((a) =>
    isFollowUpOverdue(a.followUpAt, a.stage, now, timezone)
  ).length;

  const apps = user
    ? await prisma.application.findMany({
        where,
        include: {
          listing: {
            include: { company: true, locations: { orderBy: { createdAt: "asc" } } },
          },
          statusHistory: { orderBy: { changedAt: "desc" } },
          tags: { include: { tag: true } },
          contacts: { include: { contact: true }, orderBy: { createdAt: "asc" } },
          referrals: { include: { contact: true }, orderBy: { createdAt: "asc" } },
          notes: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { lastActivityAt: "desc" },
      })
    : [];

  // Accession numbers (A2): one `SELECT id` over the user's applications,
  // soft-deleted rows deliberately included so a number is never reused.
  const accessions = user ? await accessionMap(user.id) : new Map<string, string>();

  // The widened `where` above deliberately over-fetches by up to a day at the
  // bracket edge; this is where those rows are dropped. The row set handed to
  // the client is therefore literally `rows.filter(isFollowUpOverdue)` — the
  // same call the badge makes per row — so "selected as overdue" and "printed
  // as overdue" are the same predicate applied to the same values, whatever the
  // query did.
  const visible = overdue
    ? apps.filter((a) => isFollowUpOverdue(a.followUpAt, a.stage, now, timezone))
    : apps;

  const rows: TrackerRow[] = visible.map((a): TrackerRow => {
    const l = a.listing;
    const primaryLocation = l.locations.find((loc) => loc.isPrimary) ?? l.locations[0] ?? null;
    return {
      id: a.id,
      accession: accessions.get(a.id) ?? "A-????",
      listingId: l.id,
      companyId: l.companyId,
      companyName: l.company.name,
      title: l.title,
      isSample: l.isSample || l.company.isSample,
      origin: l.origin,
      stage: a.stage,
      priority: a.priority,
      score: l.currentScore,
      band: l.currentBand,
      sponsorshipCategory: l.currentSponsorshipCategory,
      sponsorshipConfidence: l.currentSponsorshipConfidence,
      location: primaryLocation?.rawText ?? null,
      workArrangement: l.workArrangement,
      durationText: l.durationText,
      sponsorshipLanguage: l.sponsorshipLanguage,
      workAuthLanguage: l.workAuthLanguage,
      deadline: l.applicationDeadline?.toISOString() ?? null,
      deadlineIsEstimated: l.deadlineIsEstimated,
      acceptedAt: a.acceptedAt.toISOString(),
      appliedAt: a.appliedAt?.toISOString() ?? null,
      lastActivityAt: a.lastActivityAt.toISOString(),
      nextAction: a.nextAction,
      followUpAt: a.followUpAt?.toISOString() ?? null,
      recruiterName: a.recruiterName,
      hiringManagerName: a.hiringManagerName,
      contactEmail: a.contactEmail,
      contactLinkedin: a.contactLinkedin,
      referralStatus: a.referralStatus,
      finalOutcome: a.finalOutcome,
      rejectionReason: a.rejectionReason,
      postingUrl: l.postingUrl,
      applyUrl: l.applyUrl,
      tags: a.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
      contacts: a.contacts.map((c) => ({
        linkId: c.id,
        role: c.role,
        contactId: c.contact.id,
        name: c.contact.name,
        position: c.contact.position,
        relationship: c.contact.relationship,
        email: c.contact.email,
        linkedinUrl: c.contact.linkedinUrl,
      })),
      referrals: a.referrals.map((r) => ({
        id: r.id,
        contactId: r.contactId,
        contactName: r.contact.name,
        stage: r.stage,
        requestedAt: r.requestedAt?.toISOString() ?? null,
        receivedAt: r.receivedAt?.toISOString() ?? null,
        notesText: r.notesText,
      })),
      notes: a.notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
      })),
      history: a.statusHistory.map((h) => ({
        id: h.id,
        fromStage: h.fromStage,
        toStage: h.toStage,
        note: h.note,
        changedAt: h.changedAt.toISOString(),
      })),
    };
  });

  // The figures describe the whole network — the same totals the spine index
  // shows — so "N on file" stays true no matter which filters are active.
  const total = Object.values(stageCounts).reduce((a, b) => a + b, 0);
  const offers = stageCounts.OFFER ?? 0;
  const closedOut = CLOSED_OUT_STAGES.reduce((a, s) => a + (stageCounts[s] ?? 0), 0);
  const active = total - offers - closedOut;

  return (
    <TrackerClient
      rows={rows}
      layout={layout}
      filters={filters}
      stageCounts={stageCounts}
      overdueTotal={overdueTotal}
      timezone={timezone}
      figures={{ total, active, offers, closedOut }}
      // The same clock the overdue filter used, so the tape's axis and the
      // register's overdue marks cannot drift from it or from each other
      // between render and hydration.
      now={now.toISOString()}
    />
  );
}
