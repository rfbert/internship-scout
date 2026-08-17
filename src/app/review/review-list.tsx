"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ScoreBand } from "@prisma/client";
import { ErrorState, Toast } from "@/components/ui";
import { PageFrame } from "@/components/register/page-frame";
import { Footnote, Keys, Legend, type LegendItem } from "@/components/register/footnote";
import { Chip, ChipRow } from "@/components/register/chip";
import { SectionRule } from "@/components/register/rule";
import { Ledger, LedgerHead, LedgerSection } from "@/components/register/ledger";
import { Spectrum } from "@/components/register/spectrum";
import { DangerVerb, OutlineVerb, Stamp } from "@/components/register/stamp";
import { useNotation } from "@/components/register/notation";
import { BAND_CODES, BAND_LABELS, bandColor } from "@/lib/format";
import { ESTIMATED_GLOSS, bandText, formatQueueNo } from "@/lib/notation";
import { DiscardPicker } from "./discard-picker";
import { QUEUE_COLS, QUEUE_MIN_WIDTH, QueueRow } from "./queue-row";
import { ReviewWorksheet } from "./worksheet";
import { useDecisions, useDiscardReasons, type DecisionExtras } from "./decisions";
import { DEFAULT_REVIEW_SORT, REVIEW_KEYS, REVIEW_SORTS, type ReviewSort } from "./meta";
import {
  COMPARATORS,
  advancePastDecided,
  caretAtIndex,
  flattenVisible,
  groupRowsByBand,
  isCollapsible,
  openingCaret,
  resolveCaret,
  sectionIsOpen,
} from "./order";
import type { DecisionAction, ReviewRow, Verdict } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   THE REVIEW DOCKET — shell

   What used to be one 924-line component is now seven files. This one owns
   layout and sitting state only: the caret, the keyboard, bulk selection, band
   grouping, the frozen Q-numbers, and the verdict memory that keeps a decided
   record on screen after it leaves the server query. Every question of what
   order anything is in is answered by `./order`.

   KEYBOARD (D1, verbatim): j next · k previous · a accept · s save ·
   d discard picker · o open posting · n note. The guard that ignores events
   inside INPUT / TEXTAREA / SELECT / contentEditable and when meta, ctrl or alt
   is held is reproduced exactly. `j` and `k` walk `visible` — the rows the
   reader can actually see, in the order they are painted — so "next" is never
   a row in a collapsed section or 32 rows up the page.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The sitting: the NUMBERING register plus the last props seen for each record.
 *
 * `order` is append-only and is not the reading order. It exists for one job —
 * assigning `Q-04` and keeping it `Q-04` for the rest of the sitting. What the
 * reader sees is `display`, sorted by the chip that is currently lit. Welding
 * those two together is what used to force a full remount on every re-sort.
 */
type Sitting = { order: string[]; store: Map<string, ReviewRow> };

const EMPTY_SITTING: Sitting = { order: [], store: new Map() };

/**
 * Fold a fresh `rows` prop into the sitting. Pure, and returns the SAME object
 * when the fold changes nothing — which is what lets the caller adjust state
 * during render without looping.
 */
function foldRows(sitting: Sitting, rows: ReviewRow[]): Sitting {
  const changed = rows.some((r) => sitting.store.get(r.listingId) !== r);
  if (!changed) return sitting;
  const order = sitting.order.slice();
  const store = new Map(sitting.store);
  for (const r of rows) {
    if (!store.has(r.listingId)) order.push(r.listingId);
    store.set(r.listingId, r);
  }
  return { order, store };
}

/**
 * The docket's order, as a real control. Three chips, one active, all of them
 * writing `?sort=` — so the order survives a reload the way every other filter
 * in this app does. `score` is the default and clears the param rather than
 * writing it, which keeps `/review` the canonical URL.
 *
 * `listing` is dropped on the way out because it is a MOUNT-TIME anchor: it
 * seeds the caret and nothing reads it afterwards, so carrying it through a
 * re-sort would leave a stale row id in the URL bar the moment the caret moved.
 * The caret itself is unaffected — it is held by record id and follows the
 * record through the new order.
 */
function SortControl({ sort }: { sort: ReviewSort }) {
  const router = useRouter();
  const keys = Object.keys(REVIEW_SORTS) as ReviewSort[];
  return (
    <div role="group" aria-label="Order the docket" className="flex items-center gap-1.5">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        Sort
      </span>
      {keys.map((k) => (
        <Chip
          key={k}
          label={REVIEW_SORTS[k].label}
          title={REVIEW_SORTS[k].title}
          active={k === sort}
          onClick={() =>
            router.replace(k === DEFAULT_REVIEW_SORT ? "/review" : `/review?sort=${k}`, {
              scroll: false,
            })
          }
        />
      ))}
    </div>
  );
}

export function ReviewList({
  rows,
  highlightId,
  timezone,
  intakeLabel,
  dateLabel,
  sort,
}: {
  rows: ReviewRow[];
  highlightId?: string;
  timezone: string;
  /** `INTAKE AUG 09` — the sitting's intake, named by date (see page.tsx). */
  intakeLabel: string;
  dateLabel: string;
  /** Already resolved and validated by the page; drives the active chip. */
  sort: ReviewSort;
}) {
  const mode = useNotation();
  const reasons = useDiscardReasons();
  const {
    busy,
    bulkRunning,
    error,
    toast,
    setToast,
    verdicts,
    decide,
    reanalyze,
    saveNote,
    runBulk,
  } = useDecisions();

  /* Deep link: `?listing=<id>` opens the section that row is in and puts the
     caret on it (lazy init, not an effect — the id only matters for the
     opening render). `openingCaret` resolves it against the RENDERED order, so
     a deep link cannot seat the caret on a row that is never painted. */
  const [opening] = useState(() => openingCaret(rows, highlightId));
  const [caret, setCaret] = useState(opening.caret);
  /** Band groups the user has explicitly opened (ineligible starts collapsed). */
  const [openBands, setOpenBands] = useState<Set<string>>(opening.openBands);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  /** listingId currently showing the discard-reason picker, or "__bulk__". */
  const [discardFor, setDiscardFor] = useState<string | null>(null);
  const [discardReasonKey, setDiscardReasonKey] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  /* ── The sitting ─────────────────────────────────────────────────────────
     A decided record leaves `PENDING_REVIEW` and so leaves the server query on
     the next refresh. The docket keeps it — same row, same number, now stamped
     — by holding the props already in hand:

       order — append-only, and NUMBERING ONLY. This is what makes `Q-04` stay
               `Q-04` after you file `Q-01`. It is not the reading order.
       store — the last props seen for every listing in the sitting.

     This is state adjusted during render, not a ref: refs may not be read or
     written while rendering (react.dev/reference/react/useRef), and the caret
     and the queue numbers both depend on this being correct on the very first
     pass. `foldRows` returns the SAME object when nothing changed, so the
     adjustment converges after one extra pass and a StrictMode double-render
     is a no-op. */
  const [sitting, setSitting] = useState(() => foldRows(EMPTY_SITTING, rows));
  const folded = foldRows(sitting, rows);
  if (folded !== sitting) setSitting(folded);

  /* The docket, numbered by the sitting and ordered by the lit chip.
     Memoised so the keyboard effect below re-binds only when the docket really
     changes, not on every render.

     The sort runs on the CLIENT as well as the server because the sitting is
     wider than the server's query: `rows` holds only what is still pending,
     while the docket also shows every record this sitting has already decided.
     Sorting the union here with the same comparator the server used is what
     lets a re-sort re-order the whole docket in place — stamps, notes, bulk
     selection and all — instead of remounting the component and discarding the
     sitting. On the first render the union IS `rows`, already in this order, so
     the sort is a stable no-op and there is nothing for hydration to disagree
     about. */
  const { display, queueNos } = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.listingId, r]));
    const out: ReviewRow[] = [];
    const nos = new Map<string, string>();
    folded.order.forEach((id, ordinal) => {
      // Still pending ⇒ use the fresh props. Gone but decided ⇒ verdict memory.
      // Gone and never decided ⇒ it genuinely left the docket; drop it.
      const row = byId.get(id) ?? (verdicts.has(id) ? folded.store.get(id) : undefined);
      if (!row) return;
      nos.set(id, formatQueueNo(ordinal));
      out.push(row);
    });
    out.sort(COMPARATORS[sort]);
    return { display: out, queueNos: nos };
  }, [folded, rows, verdicts, sort]);

  /* ── The reader's order ──────────────────────────────────────────────────
     `groups` prints in the canonical band ladder and a collapsed section
     prints nothing, so neither `rows` nor `display` is the sequence on screen.
     `visible` IS that sequence, and the caret, j/k and the post-decision
     advance all index into it and nothing else. */
  const groups = useMemo(() => groupRowsByBand(display), [display]);
  const visible = useMemo(() => flattenVisible(groups, openBands), [groups, openBands]);
  const visibleIdx = useMemo(
    () => new Map(visible.map((r, i) => [r.listingId, i])),
    [visible]
  );

  /* Total on a non-empty docket: `resolveCaret` returns the index of a row that
     is actually painted, so there is no state in which the caret is nowhere.
     That is what replaced the old clamp-during-render — the invariant is now
     held by the function rather than by a correction after the fact. */
  const caretAt = resolveCaret(visible, caret);
  const focusedRow = caretAt >= 0 ? visible[caretAt] : null;

  // Latest-value refs for the keyboard handler, which binds once. Written
  // after commit, never during render — same rule as the sitting above.
  const visibleRef = useRef(visible);
  const verdictsRef = useRef(verdicts);
  useEffect(() => {
    visibleRef.current = visible;
    verdictsRef.current = verdicts;
  });

  /* ── Scrolling the caret into view ───────────────────────────────────────
     `LedgerRow` publishes the caret as `aria-selected="true"`, so the scroll
     reads the DOM's own truth instead of a parallel array of row refs. */
  const mounted = useRef(false);
  const deepLinked = opening.deepLinked;
  useEffect(() => {
    const el = containerRef.current?.querySelector('[aria-selected="true"]');
    if (!mounted.current) {
      mounted.current = true;
      // No deep link ⇒ leave the page where the user opened it. Without one the
      // caret opens on the FIRST PAINTED ROW, so there is nothing to scroll to.
      if (!deepLinked) return;
      el?.scrollIntoView({ block: "center" });
      return;
    }
    el?.scrollIntoView({ block: "nearest" });
  }, [caret, deepLinked]);

  /**
   * One decision, then the caret moves on. The record used to vanish the moment
   * it was decided, which put the caret on the next one; verdict memory keeps
   * it on screen, so the advance is explicit now — same keystroke, same feel.
   *
   * "On" means the next UNDECIDED row the reader can see, in painted order.
   */
  const decideAndAdvance = useCallback(
    async (listingId: string, action: DecisionAction, extra?: DecisionExtras) => {
      const ok = await decide(listingId, action, extra);
      if (!ok) return false;
      setDiscardFor(null);
      setDiscardReasonKey("");
      setNoteFor(null);
      const from = visibleRef.current;
      const decided = verdictsRef.current;
      const next = advancePastDecided(
        from,
        from.findIndex((r) => r.listingId === listingId),
        (id) => decided.has(id)
      );
      if (next) setCaret(next);
      return true;
    },
    [decide]
  );

  /* ── Keyboard shortcuts (D1 — preserved exactly) ─────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      // Both `row` and the j/k steps read the PAINTED order, so a keystroke can
      // only ever land the caret on a row that is on screen.
      const at = resolveCaret(visible, caret);
      const row = at >= 0 ? visible[at] : undefined;
      switch (e.key) {
        case "j": {
          e.preventDefault();
          setCaret(caretAtIndex(visible, at + 1));
          break;
        }
        case "k": {
          e.preventDefault();
          setCaret(caretAtIndex(visible, at - 1));
          break;
        }
        case "a":
          if (row) void decideAndAdvance(row.listingId, "accept");
          break;
        case "s":
          if (row) void decideAndAdvance(row.listingId, "save");
          break;
        case "d":
          if (row) {
            e.preventDefault();
            setDiscardFor(row.listingId);
          }
          break;
        case "o":
          if (row) {
            const url = row.postingUrl ?? row.applyUrl;
            if (url) window.open(url, "_blank", "noopener,noreferrer");
          }
          break;
        case "n":
          if (row) {
            e.preventDefault();
            setNoteFor(row.listingId);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, caret, decideAndAdvance]);

  /* ── Bulk selection ──────────────────────────────────────────────────── */
  const selectable = display.filter((r) => !verdicts.has(r.listingId));
  const allChecked = selectable.length > 0 && checked.size === selectable.length;
  const toggleAll = () =>
    setChecked(allChecked ? new Set() : new Set(selectable.map((r) => r.listingId)));
  const toggleOne = (listingId: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
  const bulk = async (action: DecisionAction, reasonKey?: string) => {
    await runBulk([...checked], action, reasonKey);
    setChecked(new Set());
    setDiscardFor(null);
    setDiscardReasonKey("");
  };

  /* ── The sitting's figures ─────────────────────────────────────────────
     Counted over the whole docket, not just the expanded part of it: a
     collapsed section still has records in it that still need deciding, and a
     meter that moved when you collapsed a section would be measuring the
     furniture rather than the work. */
  const meter = sessionMeter(display, verdicts);
  const bandsPresent = groups
    .map((g) => g.band)
    .filter((b): b is ScoreBand => b != null);

  const points = display
    .filter((r) => r.score != null && r.band != null)
    .map((r) => ({
      id: r.listingId,
      score: r.score as number,
      band: r.band as ScoreBand,
      emphasized: r.listingId === focusedRow?.listingId,
    }));

  const bandLegend: LegendItem[] =
    mode === "COMPACT"
      ? bandsPresent.map((b) => ({
          mark: BAND_CODES[b],
          meaning: BAND_LABELS[b].toLowerCase(),
        }))
      : [];
  const markLegend: LegendItem[] = [
    { mark: "▪▪▪", meaning: "sponsorship confidence" },
    { mark: "~", meaning: ESTIMATED_GLOSS },
  ];

  return (
    <div>
      <PageFrame
        eyebrow={`ACCESSIONING · ${intakeLabel} · ${dateLabel}`}
        title="Review Queue"
        figures={<SessionMeter meter={meter} />}
        verbs={<SortControl sort={sort} />}
      />

      {error ? (
        <div className="mb-3">
          <ErrorState message={error} />
        </div>
      ) : null}

      <ChipRow
        label="Records by band"
        right={
          <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="size-3 accent-[var(--ink)]"
            />
            Select all
          </label>
        }
      >
        {groups.map((g) => (
          <Chip
            key={g.key}
            label={g.band ? bandText(g.band, mode) : "Unscored"}
            count={g.rows.length}
            tick={bandColor(g.band)}
            title={g.band ? BAND_LABELS[g.band] : "Not yet scored"}
          />
        ))}
      </ChipRow>

      {checked.size > 0 ? (
        <div className="sticky top-2 z-20 my-2.5 flex flex-wrap items-center gap-1.5 rounded border border-rule bg-surface px-2.5 py-2 shadow-[var(--shadow-pulled)]">
          <span className="mr-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-2">
            {checked.size} selected
          </span>
          <Stamp disabled={bulkRunning} onClick={() => void bulk("accept")}>
            Accept all
          </Stamp>
          <OutlineVerb disabled={bulkRunning} onClick={() => void bulk("save")}>
            Shortlist all
          </OutlineVerb>
          {discardFor === "__bulk__" ? (
            <DiscardPicker
              reasons={reasons}
              value={discardReasonKey}
              onChange={setDiscardReasonKey}
              onConfirm={() => void bulk("discard", discardReasonKey)}
              onCancel={() => setDiscardFor(null)}
              disabled={bulkRunning}
              confirmLabel={`Strike ${checked.size}`}
            />
          ) : (
            <DangerVerb disabled={bulkRunning} onClick={() => setDiscardFor("__bulk__")}>
              Discard…
            </DangerVerb>
          )}
          {bulkRunning ? (
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
              Applying…
            </span>
          ) : null}
        </div>
      ) : null}

      {points.length > 1 ? (
        <div className="mb-2.5 mt-2.5">
          <Spectrum points={points} median={medianOf(points.map((p) => p.score))} />
        </div>
      ) : (
        <div className="h-2.5" />
      )}

      <div ref={containerRef}>
        <Ledger cols={QUEUE_COLS} minWidth={QUEUE_MIN_WIDTH} label="Review docket">
          <LedgerHead cols={QUEUE_COLS} />
          {groups.map((group) => {
            // Ineligible roles were already decided by the eligibility gates —
            // they stay reachable for a second opinion, but they shouldn't cost
            // you scrolling on the way to the ones that need a real decision.
            const open = sectionIsOpen(group, openBands);
            const collapsible = isCollapsible(group.band);
            const n = group.rows.length;
            return (
              <LedgerSection key={group.key}>
                <FullWidthRow>
                  <SectionRule
                    label={group.band ? bandText(group.band, mode) : "Unscored"}
                    tick={bandColor(group.band)}
                    right={`${n} record${n === 1 ? "" : "s"}`}
                    collapsed={collapsible ? !open : undefined}
                    onToggle={
                      collapsible
                        ? () =>
                            setOpenBands((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.key)) next.delete(group.key);
                              else next.add(group.key);
                              return next;
                            })
                        : undefined
                    }
                  />
                </FullWidthRow>

                {open
                  ? group.rows.map((row) => (
                      <Fragment key={row.decisionId}>
                        <QueueRow
                          row={row}
                          queueNo={queueNos.get(row.listingId) ?? ""}
                          timezone={timezone}
                          focused={row.listingId === focusedRow?.listingId}
                          checked={checked.has(row.listingId)}
                          verdict={verdicts.get(row.listingId)}
                          onSelect={() =>
                            setCaret(caretAtIndex(visible, visibleIdx.get(row.listingId) ?? 0))
                          }
                          onToggleCheck={() => toggleOne(row.listingId)}
                        />
                        {row.listingId === focusedRow?.listingId ? (
                          <FullWidthRow>
                            <ReviewWorksheet
                              row={row}
                              timezone={timezone}
                              busy={busy.has(row.listingId)}
                              reasons={reasons}
                              discardOpen={discardFor === row.listingId}
                              discardReasonKey={discardReasonKey}
                              noteOpen={noteFor === row.listingId}
                              remaining={meter.remaining}
                              paceSeconds={meter.medianSeconds}
                              onAction={(action) =>
                                void decideAndAdvance(row.listingId, action)
                              }
                              onOpenDiscard={() => {
                                setDiscardFor(row.listingId);
                                setDiscardReasonKey("");
                              }}
                              onCloseDiscard={() => setDiscardFor(null)}
                              onDiscardReasonChange={setDiscardReasonKey}
                              onConfirmDiscard={() =>
                                void decideAndAdvance(row.listingId, "discard", {
                                  discardReasonKey,
                                })
                              }
                              onOpenNote={() => setNoteFor(row.listingId)}
                              onCloseNote={() => setNoteFor(null)}
                              onSaveNote={(body) => {
                                void saveNote(row.listingId, body).then((ok) => {
                                  if (ok) setNoteFor(null);
                                });
                              }}
                              onReanalyze={() => void reanalyze(row.listingId)}
                            />
                          </FullWidthRow>
                        ) : null}
                      </Fragment>
                    ))
                  : null}
              </LedgerSection>
            );
          })}
        </Ledger>
      </div>

      <Footnote
        legend={
          <>
            {bandLegend.length > 0 ? (
              <>
                <Legend title="Bands" items={bandLegend} />
                {" · "}
              </>
            ) : null}
            <Legend items={markLegend} />
          </>
        }
        keys={<Keys items={REVIEW_KEYS} />}
      />

      {toast ? (
        <Toast message={toast.message} actions={toast.actions} onDismiss={() => setToast(null)} />
      ) : null}
    </div>
  );
}

/**
 * A full-width block inside the ledger — the section rule and the pulled
 * worksheet. `role="row"` wrapping a single `role="cell"` keeps the ARIA table
 * tree legal: a rowgroup may only own rows, and a row may own one cell.
 */
function FullWidthRow({ children }: { children: ReactNode }) {
  return (
    <div role="row">
      <div role="cell">{children}</div>
    </div>
  );
}

interface Meter {
  total: number;
  reviewed: number;
  filed: number;
  aside: number;
  struck: number;
  remaining: number;
  /** Median seconds between consecutive decisions; null until there are two. */
  medianSeconds: number | null;
}

/**
 * The session meter (SYNTHESIS §3.2). Everything here is derived from the
 * verdicts this sitting stamped — no clock is read during render, so there is
 * nothing for the server and the client to disagree about on hydration.
 */
function sessionMeter(rows: ReviewRow[], verdicts: Map<string, Verdict>): Meter {
  let filed = 0;
  let aside = 0;
  let struck = 0;
  let reviewed = 0;
  const stamps: number[] = [];
  for (const r of rows) {
    const v = verdicts.get(r.listingId);
    if (!v) continue;
    reviewed++;
    stamps.push(v.at);
    if (v.action === "accept") filed++;
    else if (v.action === "save") aside++;
    else if (v.action !== "already_applied") struck++;
  }
  stamps.sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < stamps.length; i++) gaps.push((stamps[i] - stamps[i - 1]) / 1000);
  return {
    total: rows.length,
    reviewed,
    filed,
    aside,
    struck,
    remaining: rows.length - reviewed,
    medianSeconds: gaps.length > 0 ? Math.round(medianOf(gaps)) : null,
  };
}

function SessionMeter({ meter }: { meter: Meter }) {
  const pct = meter.total > 0 ? Math.round((meter.reviewed / meter.total) * 100) : 0;
  const parts = [
    meter.filed > 0 ? `${meter.filed} filed to tracker` : null,
    meter.aside > 0 ? `${meter.aside} set aside` : null,
    meter.struck > 0 ? `${meter.struck} struck` : null,
    meter.medianSeconds != null ? `median ${meter.medianSeconds}s` : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      <div>
        <b className="font-semibold text-ink">
          {meter.reviewed} of {meter.total}
        </b>{" "}
        reviewed
        {parts.map((p) => (
          <span key={p}> · {p}</span>
        ))}
      </div>
      <div
        role="progressbar"
        aria-label="Records reviewed this sitting"
        aria-valuenow={meter.reviewed}
        aria-valuemin={0}
        aria-valuemax={meter.total}
        className="ml-auto mt-1 h-[3px] w-[168px] bg-inset"
      >
        <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
