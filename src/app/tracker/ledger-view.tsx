"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { ApplicationStage } from "@prisma/client";
import { ManualBadge, SampleBadge } from "@/components/ui";
import {
  Ledger,
  LedgerCell,
  LedgerHead,
  LedgerRow,
  LedgerSection,
  type LedgerCol,
} from "@/components/register/ledger";
import { SectionRule } from "@/components/register/rule";
import { Band, Estimated, Priority, Sponsorship, useNotation } from "@/components/register/notation";
import { daysUntil } from "@/components/register/deadline-tape";
import {
  STAGE_GROUPS,
  STAGE_SHORT_LABELS,
  TOKEN_TEXT,
  bandIsStruck,
  stageGroupColor,
  type StageGroup,
} from "@/lib/format";
import { fmtDateShortTz } from "@/lib/dates";
import { fmtAgoShort, isOverdue, stageGroup } from "./meta";
import type { TrackerRow } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   THE REGISTER OF APPLICATIONS

   One ledger replaces three idioms: the twelve-column ~100px table, the
   fourteen-column kanban, and the transit line-map. Eleven columns of content
   on ONE 34px line, grouped into five roman-numbered stage sections, with the
   focused record pulling a dossier open beneath its own row.

   Every cell here is single-line and ellipsised, and every truncated cell
   carries its full text in `title`. That is the whole density argument: the
   reader gets thirty rows where they used to get six, and loses nothing,
   because depth lives one keystroke away in the dossier rather than being
   wrapped into the row.
   ══════════════════════════════════════════════════════════════════════════ */

export type SortKey = "accession" | "score" | "deadline" | "activity";

/**
 * Column widths are the one thing notation mode changes about the layout:
 * `EXCEPTIONAL · PRIOR SPONSOR` needs about 70px more than `EXC · HIST`, and
 * reflowing on every row would be worse than reserving it once.
 */
function columnsFor(compact: boolean): LedgerCol[] {
  return [
    { label: "No.", w: "58px", sort: "accession" },
    { label: "Company — Role", w: "minmax(0,1fr)" },
    { label: "Stage", w: "94px" },
    { label: "Pri", w: "26px" },
    { label: "Score", w: compact ? "78px" : "132px", align: "right", sort: "score" },
    { label: "Sponsorship", w: compact ? "118px" : "158px" },
    { label: "Location", w: "88px" },
    { label: "Deadline", w: "104px", sort: "deadline" },
    { label: "Applied", w: "62px" },
    { label: "Activity", w: "66px", sort: "activity" },
    { label: "Next action", w: "170px" },
  ];
}

const dateVal = (iso: string | null): number | null => (iso ? new Date(iso).getTime() : null);

/** Compare with nulls always last, regardless of direction. */
function cmpNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

function compare(a: TrackerRow, b: TrackerRow, key: SortKey, dir: 1 | -1): number {
  switch (key) {
    case "accession":
      return a.accession.localeCompare(b.accession) * dir;
    case "score":
      return cmpNullable(a.score, b.score, dir);
    case "deadline":
      return cmpNullable(dateVal(a.deadline), dateVal(b.deadline), dir);
    case "activity":
      return cmpNullable(dateVal(a.lastActivityAt), dateVal(b.lastActivityAt), dir);
  }
}

/**
 * The section's right-hand readout. Derived, never decorative: how many
 * records, and the single most urgent fact about them — overdue follow-ups if
 * there are any, otherwise the nearest deadline.
 */
function sectionSummary(
  rows: TrackerRow[],
  timezone: string,
  now: string,
  group?: StageGroup
): string {
  const n = rows.length;
  const head = `${n} record${n === 1 ? "" : "s"}`;
  // Section V ships collapsed, so its one visible line has to carry the whole
  // section: an outcome breakdown, not a deadline nobody is waiting on.
  if (group === "closed") {
    const parts = STAGE_GROUPS.find((g) => g.group === "closed")!
      .stages.map((s) => ({ s, k: rows.filter((r) => r.stage === s).length }))
      .filter((x) => x.k > 0)
      .map((x) => `${x.k} ${STAGE_SHORT_LABELS[x.s].toLowerCase()}`);
    return parts.length > 0 ? `${head} · ${parts.join(" · ")}` : head;
  }
  const overdueCount = rows.filter((r) => isOverdue(r.followUpAt, r.stage, now, timezone)).length;
  if (overdueCount > 0) return `${head} · ${overdueCount} overdue`;
  const upcoming = rows
    .filter((r) => r.deadline && daysUntil(r.deadline, now) >= 0)
    .sort((a, b) => (dateVal(a.deadline) ?? 0) - (dateVal(b.deadline) ?? 0))[0];
  if (upcoming?.deadline) {
    return `${head} · next ${fmtDateShortTz(upcoming.deadline, timezone).toUpperCase()}`;
  }
  return head;
}

/** `~AUG 30 · 21d`, `AUG 15 · 6d`, `JUL 02 · OVERDUE`. */
function DeadlineCell({
  row,
  timezone,
  now,
}: {
  row: TrackerRow;
  timezone: string;
  now: string;
}) {
  if (!row.deadline) return <span className="text-ink-3">—</span>;
  const d = daysUntil(row.deadline, now);
  const printed = fmtDateShortTz(row.deadline, timezone).toUpperCase();
  // <7d carmine · <21d ochre · overdue carmine AND the literal word (B4/D3).
  const tone = d < 0 || d < 7 ? "text-carmine" : d < 21 ? "text-ochre" : "text-ink-2";
  const tail = d < 0 ? "OVERDUE" : d <= 45 ? `${d}d` : null;
  return (
    <span className={`${tone} font-medium`}>
      {row.deadlineIsEstimated ? <Estimated>{printed}</Estimated> : printed}
      {tail ? <span className="text-ink-3"> · </span> : null}
      {tail}
    </span>
  );
}

function NextActionCell({
  row,
  timezone,
  now,
}: {
  row: TrackerRow;
  timezone: string;
  now: string;
}) {
  const overdue = isOverdue(row.followUpAt, row.stage, now, timezone);
  if (!row.nextAction && !row.followUpAt) return <span className="text-ink-3">—</span>;
  const due = row.followUpAt
    ? `${overdue ? "OVERDUE" : "DUE"} ${fmtDateShortTz(row.followUpAt, timezone).toUpperCase()}`
    : null;
  return (
    <span className={overdue ? "text-carmine" : undefined}>
      {row.nextAction ?? ""}
      {row.nextAction && due ? <span className="text-ink-3"> · </span> : null}
      {due ? <span className="font-mono text-[10.5px]">{due}</span> : null}
    </span>
  );
}

function RegisterRow({
  row,
  focused,
  onSelect,
  timezone,
  now,
  tick,
}: {
  row: TrackerRow;
  focused: boolean;
  onSelect: (id: string | null) => void;
  timezone: string;
  now: string;
  /** Group colour, printed on the left edge in FLAT mode only. */
  tick?: ReturnType<typeof stageGroupColor>;
}) {
  const nextActionText = [row.nextAction, row.followUpAt ? `follow up ${fmtDateShortTz(row.followUpAt, timezone)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <LedgerRow
      focused={focused}
      struck={bandIsStruck(row.band)}
      tick={tick}
      ariaLabel={`${focused ? "Close" : "Open"} record ${row.accession}: ${row.companyName} — ${row.title}`}
      onClick={() => onSelect(focused ? null : row.id)}
      // Preserved verbatim from `table-view.tsx`: the row is the control, and
      // only the row itself answers — a key pressed inside a nested control
      // must not open the record (D1).
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect(focused ? null : row.id);
        }
      }}
      className="cursor-pointer"
    >
      <LedgerCell mono muted className="text-[10.5px]">
        {focused ? (
          <span aria-hidden className="text-carmine">
            ▸{" "}
          </span>
        ) : null}
        {row.accession}
      </LedgerCell>

      <LedgerCell title={`${row.companyName} — ${row.title}`}>
        <span data-row-title className="font-semibold">
          {row.companyName}
        </span>
        <span className="text-ink-2"> — {row.title}</span>
        <ManualBadge origin={row.origin} />
        <SampleBadge isSample={row.isSample} />
      </LedgerCell>

      <LedgerCell mono className="text-[10.5px] font-medium">
        {STAGE_SHORT_LABELS[row.stage]}
      </LedgerCell>

      <LedgerCell>
        <Priority priority={row.priority} />
      </LedgerCell>

      <LedgerCell align="right">
        <Band band={row.band} score={row.score} />
      </LedgerCell>

      <LedgerCell>
        <Sponsorship category={row.sponsorshipCategory} confidence={row.sponsorshipConfidence} />
      </LedgerCell>

      <LedgerCell mono className="text-[10.5px]" title={row.location ?? undefined}>
        {row.location ? row.location.toUpperCase() : <span className="text-ink-3">—</span>}
      </LedgerCell>

      <LedgerCell mono className="text-[10.5px]">
        <DeadlineCell row={row} timezone={timezone} now={now} />
      </LedgerCell>

      <LedgerCell mono className="text-[10.5px]">
        {row.appliedAt ? (
          fmtDateShortTz(row.appliedAt, timezone).toUpperCase()
        ) : (
          <span className="text-ink-3">—</span>
        )}
      </LedgerCell>

      <LedgerCell mono className="text-[10.5px]">
        {fmtAgoShort(row.lastActivityAt, now)}
      </LedgerCell>

      <LedgerCell className="text-[12px] text-ink-2" title={nextActionText || undefined}>
        <NextActionCell row={row} timezone={timezone} now={now} />
      </LedgerCell>
    </LedgerRow>
  );
}

/**
 * The pulled record, injected as a full-width row of the ledger.
 *
 * It has to be a `role="row"` containing one `role="cell"`: a `role="table"`
 * may only parent rowgroups and rows, so a bare `<div>` here would make the
 * whole register's accessibility tree invalid. This is the standard
 * expandable-detail-row shape, and it keeps the dossier visually inside the
 * ledger frame the way the design requires.
 */
function DossierRow({ children }: { children: ReactNode }) {
  return (
    <div role="row" className="block border-b border-feint last:border-b-0">
      <div role="cell" className="block">
        {children}
      </div>
    </div>
  );
}

export function LedgerView({
  rows,
  layout,
  selectedId,
  onSelect,
  timezone,
  now,
  dossier,
  activeStage,
}: {
  rows: TrackerRow[];
  layout: "grouped" | "flat";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  timezone: string;
  /** The server's clock — every relative date on this page derives from it. */
  now: string;
  /** The pulled record for `selectedId`, injected under its own row. */
  dossier: ReactNode;
  activeStage?: ApplicationStage;
}) {
  const compact = useNotation() === "COMPACT";
  const cols = useMemo(() => columnsFor(compact), [compact]);

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  /**
   * Terminal records ship collapsed — they are the archive's back matter, not
   * its working face. `null` means "nobody has touched the disclosure", in
   * which case filtering to a closed stage opens it: the reader asked for
   * exactly those records, so hiding them would be perverse.
   */
  const [closedOverride, setClosedOverride] = useState<boolean | null>(null);
  const closedCollapsed =
    closedOverride ?? !(activeStage && stageGroup(activeStage) === "closed");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    const k = key as SortKey;
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      // Score and activity read best newest/highest first; the rest ascend.
      setSortDir(k === "score" || k === "activity" ? -1 : 1);
    }
  };

  const rowProps = { onSelect, timezone, now };

  if (layout === "flat") {
    return (
      <Ledger cols={cols} minWidth={compact ? 1240 : 1340} label="Applications, flat">
        <LedgerHead
          cols={cols}
          onSort={toggleSort}
          sortKey={sortKey ?? undefined}
          sortDir={sortDir === 1 ? "asc" : "desc"}
        />
        <LedgerSection>
          {sorted.map((r) => (
            <RegisterRow
              key={r.id}
              row={r}
              focused={selectedId === r.id}
              tick={stageGroupColor(stageGroup(r.stage))}
              {...rowProps}
            />
          ))}
          {/* In FLAT mode the record still pulls open, but under the run
              rather than inside a section. */}
          {selectedId && sorted.some((r) => r.id === selectedId) ? (
            <DossierRow>{dossier}</DossierRow>
          ) : null}
        </LedgerSection>
      </Ledger>
    );
  }

  const byGroup = new Map<StageGroup, TrackerRow[]>();
  for (const r of rows) {
    const g = stageGroup(r.stage);
    const bucket = byGroup.get(g);
    if (bucket) bucket.push(r);
    else byGroup.set(g, [r]);
  }

  return (
    <Ledger cols={cols} minWidth={compact ? 1240 : 1340} label="Applications by stage">
      <LedgerHead cols={cols} />
      {STAGE_GROUPS.map((g) => {
        const groupRows = byGroup.get(g.group) ?? [];
        if (groupRows.length === 0) return null;
        const isClosed = g.group === "closed";
        const collapsed = isClosed ? closedCollapsed : false;
        return (
          <LedgerSection key={g.group}>
            <SectionRule
              label={g.label}
              roman={g.roman}
              tick={g.tick}
              right={sectionSummary(groupRows, timezone, now, g.group)}
              {...(isClosed
                ? { collapsed, onToggle: () => setClosedOverride(!collapsed) }
                : {})}
            />
            {collapsed
              ? null
              : groupRows.map((r) => (
                  <RegisterRow key={r.id} row={r} focused={selectedId === r.id} {...rowProps} />
                ))}
            {!collapsed && selectedId && groupRows.some((r) => r.id === selectedId) ? (
              <DossierRow>{dossier}</DossierRow>
            ) : null}
          </LedgerSection>
        );
      })}
    </Ledger>
  );
}

/** Exported for the footnote: which group ticks are actually on screen. */
export function groupsPresent(rows: TrackerRow[]): typeof STAGE_GROUPS {
  const present = new Set(rows.map((r) => stageGroup(r.stage)));
  return STAGE_GROUPS.filter((g) => present.has(g.group));
}

/** A group tick swatch for the footnote legend. */
export function GroupTick({ group }: { group: StageGroup }) {
  return <span className={TOKEN_TEXT[stageGroupColor(group)]}>▮</span>;
}
