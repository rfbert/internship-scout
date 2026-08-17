"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ApplicationStage, ScoreBand, SponsorshipCategory } from "@prisma/client";
import { Card, EmptyState, Toast, btn } from "@/components/ui";
import { PageFrame } from "@/components/register/page-frame";
import { SpineIndex } from "@/components/register/spine-index";
import { Chip, ChipRow } from "@/components/register/chip";
import { Footnote, Legend, Keys, type LegendItem } from "@/components/register/footnote";
import { DeadlineTape, daysUntil, type TapeItem } from "@/components/register/deadline-tape";
import { useNotation } from "@/components/register/notation";
import {
  BAND_CODES,
  BAND_LABELS,
  SPONSORSHIP_CODES,
  SPONSORSHIP_LABELS,
  STAGE_CODES,
  STAGE_LABELS,
  stageGroupColor,
} from "@/lib/format";
import { ESTIMATED_GLOSS } from "@/lib/notation";
import { deleteJson, postJson } from "@/lib/client-api";
import { PRIORITY_LABELS, PRIORITY_ORDER, stageGroup, type RemovalReason } from "./meta";
import type { TrackerFilters, TrackerLayout, TrackerRow } from "./types";
import { GroupTick, LedgerView, groupsPresent } from "./ledger-view";
import { TrackerDossier } from "./dossier";
import { nextStageOf } from "./next-action";
import { AddEntry } from "./add-entry";

/* ══════════════════════════════════════════════════════════════════════════
   REGISTER OF APPLICATIONS — the page shell.

   What this file used to hold: a table/board switch, a transit line-map, three
   hand-rolled filter-chip treatments, and a fixed drawer. What it holds now:
   the spine index (all fourteen stages in ~64px, where the board needed ~3.5k
   px of horizontal scroll to show five), one chip row, one ledger, and the
   record pulled open inside it.

   Everything about the DATA is unchanged — same props, same queries, same
   endpoints, same soft-delete-with-undo. This is a visual conversion (D4).
   ══════════════════════════════════════════════════════════════════════════ */

export function TrackerClient({
  rows,
  layout,
  filters,
  stageCounts,
  overdueTotal,
  timezone,
  figures,
  now,
}: {
  rows: TrackerRow[];
  layout: TrackerLayout;
  filters: TrackerFilters;
  stageCounts: Partial<Record<ApplicationStage, number>>;
  overdueTotal: number;
  timezone: string;
  /** Network-wide totals — true whatever the filters say. */
  figures: { total: number; active: number; offers: number; closedOut: number };
  /** The server's clock, so every relative date agrees across hydration. */
  now: string;
}) {
  const router = useRouter();
  const compact = useNotation() === "COMPACT";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The record `A` is armed against. Compared against the OPEN record on every
  // read, so switching records is implicitly disarmed — no effect needed.
  const [armedAdvance, setArmedAdvance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    actions?: Array<{ label: string; onClick: () => void }>;
  } | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const anyFilter = Boolean(filters.stage || filters.priority || filters.overdue);
  const activeFilterCount =
    (filters.stage ? 1 : 0) + (filters.priority ? 1 : 0) + (filters.overdue ? 1 : 0);
  /** The chip row is chrome until you need it — but never hides a live filter. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showFilters = filtersOpen || anyFilter;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const navigate = (patch: {
    layout?: TrackerLayout;
    stage?: string;
    priority?: string;
    overdue?: boolean;
  }) => {
    const q = new URLSearchParams();
    const l = patch.layout ?? layout;
    if (l === "flat") q.set("layout", "flat");
    const s = "stage" in patch ? patch.stage : filters.stage;
    if (s) q.set("stage", s);
    const p = "priority" in patch ? patch.priority : filters.priority;
    if (p) q.set("priority", p);
    const o = "overdue" in patch ? patch.overdue : filters.overdue;
    if (o) q.set("overdue", "1");
    const qs = q.toString();
    router.replace(qs ? `/tracker?${qs}` : "/tracker");
  };

  /** Shared stage transition. Resolves to null on success, or the server's own
   *  message — the dossier shows it, since the page banner can be off-screen. */
  const changeStage = useCallback(
    async (
      id: string,
      stage: ApplicationStage,
      note?: string,
      changedAt?: string
    ): Promise<string | null> => {
      setError(null);
      const res = await postJson(`/api/applications/${id}/stage`, {
        stage,
        ...(note?.trim() ? { note: note.trim() } : {}),
        ...(changedAt ? { changedAt } : {}),
      });
      if (!res.ok) {
        const message = res.error ?? "The stage change could not be saved.";
        setError(message);
        return message;
      }
      router.refresh();
      return null;
    },
    [router]
  );

  /** Remove from the register. Soft delete, so the toast can offer a real undo. */
  const removeApplication = useCallback(
    async (id: string, reason: RemovalReason, company: string): Promise<string | null> => {
      setError(null);
      const res = await deleteJson(`/api/applications/${id}`, { reason });
      if (!res.ok) {
        const message = res.error ?? "The application could not be removed.";
        setError(message);
        return message;
      }
      setSelectedId(null);
      router.refresh();
      setToast({
        message: `Removed ${company} from your register`,
        actions: [
          {
            label: "Undo",
            onClick: () => {
              setToast(null);
              void postJson(`/api/applications/${id}/restore`).then((r) => {
                if (r.ok) {
                  router.refresh();
                } else {
                  // A silent failed undo reads as data loss — say what happened.
                  setError(r.error ?? `${company} could not be restored to the register.`);
                }
              });
            },
          },
        ],
      });
      return null;
    },
    [router]
  );

  /** `A` — move the open record one stage along, same endpoint as the stamp. */
  /**
   * `A` arms the advance; a second `A` commits it. Everything else the tracker
   * binds is navigation — this is the one keystroke that writes, and a stage
   * transition is recorded in the case history where an accidental one is
   * visible forever. Arming is cheap to undo (Escape, or just look away: the
   * prompt states the destination stage by name).
   */
  const advanceSelected = useCallback(async () => {
    if (!selected) return;
    const next = nextStageOf(selected.stage);
    if (!next) return;
    if (armedAdvance !== selected.id) {
      setArmedAdvance(selected.id);
      return;
    }
    setArmedAdvance(null);
    await changeStage(selected.id, next);
  }, [selected, changeStage, armedAdvance]);

  /* ── Keys ─────────────────────────────────────────────────────────────────
     J/K walk the register, E (or ⏎) pulls the record open, A advances the open
     one. The cursor is real DOM focus rather than a second piece of state, so
     it cannot disagree with what the ledger is actually showing — sorted,
     grouped, or with section V collapsed. Rows are the page's only focusable
     `role="row"`, which is what makes the query safe. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      if (key !== "j" && key !== "k" && key !== "e" && key !== "a") return;
      // Never steal a keystroke from something the reader is typing into.
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;

      if (key === "a") {
        e.preventDefault();
        void advanceSelected();
        return;
      }
      const list = Array.from(
        document.querySelectorAll<HTMLElement>('[role="row"][tabindex="0"]')
      );
      if (list.length === 0) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      if (key === "e") {
        if (at >= 0) list[at].click();
        else list[0].focus();
        return;
      }
      if (at < 0) list[0].focus();
      else list[key === "j" ? Math.min(at + 1, list.length - 1) : Math.max(at - 1, 0)].focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advanceSelected]);

  /* ── The urgent window ────────────────────────────────────────────────────
     A compact 14-day tape, and only when there is something inside it: an
     empty axis is graticule without data. Overdue items are never dropped —
     the tape clusters them in its own gutter left of NOW. */
  const tapeItems = useMemo<TapeItem[]>(
    () =>
      rows
        .filter((r) => r.deadline && daysUntil(r.deadline, now) <= 14)
        .map((r) => ({
          id: r.id,
          label: `${r.companyName.toUpperCase()} · ${STAGE_CODES[r.stage]}`,
          dueAt: r.deadline as string,
          isEstimated: r.deadlineIsEstimated,
        })),
    [rows, now]
  );

  /* ── The map key ──────────────────────────────────────────────────────────
     Only notations that are actually on this screen. In Plain mode the bands
     and sponsorship categories print their own words, so a legend for them
     would be a glossary of English; only the marks that are genuinely
     shorthand earn a line. */
  const legendItems = useMemo<LegendItem[]>(() => {
    const items: LegendItem[] = [];
    if (compact) {
      const bands = new Set<ScoreBand>();
      const spons = new Set<SponsorshipCategory>();
      for (const r of rows) {
        if (r.band) bands.add(r.band);
        if (r.sponsorshipCategory) spons.add(r.sponsorshipCategory);
      }
      for (const b of bands) items.push({ mark: BAND_CODES[b], meaning: BAND_LABELS[b].toLowerCase() });
      for (const c of spons)
        items.push({ mark: SPONSORSHIP_CODES[c], meaning: SPONSORSHIP_LABELS[c].toLowerCase() });
    }
    // These are shorthand in BOTH modes — a dot, a pip and a strikethrough
    // carry meaning no matter which vocabulary the bands are printed in, and
    // this is the densest notation in the app. Gating the whole legend on
    // `compact` left the page that needs a key the only page without one.
    //
    // THE CERTAINTY STROKE GOES FIRST, and the order is load-bearing here in a
    // way it is on no other page. This legend is one nowrap line with an
    // ellipsis, and measured in Chrome it already overruns its track at 1280
    // with four items and nothing estimated on screen (906px of an 838px
    // track) — so whatever is last is not merely cramped, it is invisible. Of
    // these four marks the stroke is the only one a reader cannot decode by
    // looking: a filled dot reads as a rank and a strikethrough reads as
    // "closed", but `~` says nothing until it is glossed, and what it hides is
    // a date that may be wrong. It is the last line that should ever be
    // dropped, so it is the first one printed.
    if (rows.some((r) => r.deadlineIsEstimated)) {
      items.push({ mark: "~", meaning: ESTIMATED_GLOSS });
    }
    if (rows.some((r) => r.priority)) {
      items.push({ mark: "●", meaning: "priority — urgent, high, medium, low" });
    }
    if (rows.some((r) => r.sponsorshipConfidence)) {
      items.push({ mark: "▪▪▪", meaning: "sponsorship confidence, out of three" });
    }
    if (rows.some((r) => r.band === "INELIGIBLE")) {
      items.push({ mark: "s\u0336t\u0336r\u0336u\u0336c\u0336k\u0336", meaning: "ineligible — kept on file, not in play" });
    }
    return items;
  }, [rows, compact]);

  return (
    <div>
      <PageFrame
        eyebrow="Register of applications · Summer 2027 · F-1 aware"
        title="Application Tracker"
        figures={
          <>
            <b className="font-semibold text-ink">{figures.total}</b> on file ·{" "}
            <b className="font-semibold text-ink">{figures.active}</b> moving ·{" "}
            <b className="font-semibold text-ink">{figures.offers}</b> at offer ·{" "}
            <b className="font-semibold text-ink">{figures.closedOut}</b> closed out
          </>
        }
        verbs={
          <>
            {/* A native button, not `OutlineVerb`: this is a disclosure and it
                owes the reader an `aria-expanded` (D7), which the verb
                primitive has no prop for. Same `btn` class, same look. */}
            <button
              type="button"
              className={btn}
              aria-expanded={showFilters}
              onClick={() => setFiltersOpen((v) => !v)}
              title="Show the filter row"
            >
              Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
              <span aria-hidden>▾</span>
            </button>
            <AddEntry />
          </>
        }
      />

      {/* ── The spine index: all fourteen drawers, ~64px, no scroll ──────── */}
      <SpineIndex
        counts={stageCounts}
        activeStage={filters.stage}
        onSelect={(stage) => navigate({ stage: stage ?? "" })}
      />

      {showFilters ? (
        <ChipRow
          label="Filter the register"
          right={
            <>
              <Chip
                label="Grouped"
                active={layout === "grouped"}
                onClick={() => navigate({ layout: "grouped" })}
                title="Five roman-numbered stage sections"
              />
              <Chip
                label="Flat"
                active={layout === "flat"}
                onClick={() => navigate({ layout: "flat" })}
                title="One sortable run; the group survives as each row's tick"
              />
            </>
          }
        >
          {filters.stage ? (
            <Chip
              label={`${STAGE_LABELS[filters.stage]} ×`}
              tick={stageGroupColor(stageGroup(filters.stage))}
              active
              onClick={() => navigate({ stage: "" })}
              title={`Clear stage filter: ${STAGE_LABELS[filters.stage]}`}
            />
          ) : null}

          {PRIORITY_ORDER.map((p) => (
            <Chip
              key={p}
              label={PRIORITY_LABELS[p]}
              active={filters.priority === p}
              onClick={() => navigate({ priority: filters.priority === p ? "" : p })}
              title={`Priority: ${PRIORITY_LABELS[p]}`}
            />
          ))}

          <Chip
            label="Overdue follow-ups"
            count={overdueTotal}
            tick="carmine"
            active={filters.overdue}
            onClick={() => navigate({ overdue: !filters.overdue })}
            title="Follow-ups past due on applications that are still moving"
          />

          {anyFilter ? (
            <button
              type="button"
              className="ml-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
              onClick={() => navigate({ stage: "", priority: "", overdue: false })}
            >
              Clear
            </button>
          ) : null}
        </ChipRow>
      ) : null}

      {tapeItems.length > 0 ? (
        <div className="py-2.5">
          <DeadlineTape items={tapeItems} now={now} span={14} label="Deadlines · next 14 days" />
        </div>
      ) : null}

      {error ? (
        <p className="mb-2 rounded border border-carmine bg-inset px-3 py-2 text-[12.5px] text-carmine">
          <span className="mr-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">
            Error
          </span>
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={anyFilter ? "No records match these filters" : "The register is empty"}
            hint={
              anyFilter
                ? "Try clearing a filter — applications only appear here once accepted from the Review Queue."
                : "Accept opportunities in the Review Queue, or add your own internship with + New record."
            }
            action={
              anyFilter ? undefined : (
                <Link href="/review" className={btn}>
                  Open Review Queue
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <LedgerView
          rows={rows}
          layout={layout}
          selectedId={selectedId}
          onSelect={setSelectedId}
          timezone={timezone}
          now={now}
          activeStage={filters.stage}
          dossier={
            selected ? (
              <TrackerDossier
                row={selected}
                timezone={timezone}
                now={now}
                onClose={() => setSelectedId(null)}
                onStageChange={changeStage}
                onRemove={removeApplication}
              />
            ) : null
          }
        />
      )}

      <Footnote
        legend={
          <>
            <Legend items={legendItems} />
            {layout === "flat" && rows.length > 0 ? (
              <span>
                {legendItems.length > 0 ? " · " : null}
                {groupsPresent(rows).map((g, i) => (
                  <span key={g.group}>
                    {i > 0 ? " " : null}
                    <GroupTick group={g.group} /> {g.roman}
                  </span>
                ))}
              </span>
            ) : null}
          </>
        }
        keys={
          <Keys
            items={[
              { key: "J K", label: "row" },
              { key: "E ⏎", label: "dossier" },
              // Says what the key will actually do right now: `A` arms, a
              // second `A` commits. An armed mode the reader cannot see would
              // be worse than the unguarded key it replaced.
              {
                key: "A",
                label: selected && armedAdvance === selected.id ? `again → ${STAGE_LABELS[nextStageOf(selected.stage) ?? selected.stage].toLowerCase()}` : "advance",
              },
              { key: "Esc", label: "close" },
            ]}
          />
        }
      />

      {toast ? (
        <Toast message={toast.message} actions={toast.actions} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}
