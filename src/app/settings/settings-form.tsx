"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { RoleCategory, ScoreBand } from "@prisma/client";
import { btnPrimary, inputCls, selectCls } from "@/components/ui";
import { Chip } from "@/components/register/chip";
import { DoubleRule, SectionRule } from "@/components/register/rule";
import { OutlineVerb } from "@/components/register/stamp";
import {
  BAND_THRESHOLDS,
  DEFAULT_WEIGHTS,
  ROLE_ALIGNMENT_SCORES,
  SCORE_COMPONENTS,
  SEASON,
} from "@/lib/constants";
import type { ScoreComponent } from "@/lib/constants";
import { patchJson } from "@/lib/client-api";
import {
  BAND_CODES,
  BAND_LABELS,
  BAND_PLAIN,
  ROLE_LABELS,
  SCORE_COMPONENT_LABELS,
  SPONSORSHIP_CODES,
  SPONSORSHIP_PLAIN,
  TOKEN_BG,
  TOKEN_TEXT,
  bandColor,
} from "@/lib/format";
import { NOTATION_MODES, type NotationMode } from "@/lib/notation";

/* ══════════════════════════════════════════════════════════════════════════
   STANDING ORDERS — the settings worksheet.

   No cards. The page is one continuous sheet cut into sections by 28px
   `SectionRule`s, exactly like the docket and the review worksheet: a rule
   says "a new section of the same ledger starts here".

   VISUAL CONVERSION ONLY. Every payload field, every validation rule and the
   null-means-use-the-app-default semantics are carried over unchanged from the
   card version; the client checks below still mirror
   `src/app/api/settings/validation.ts` exactly (sum-to-100, ints 0–100,
   strictly-descending band floors, LOW_PRIORITY pinned at 0).
   ══════════════════════════════════════════════════════════════════════════ */

const THRESHOLD_BANDS = [
  "EXCEPTIONAL",
  "HIGH_PRIORITY",
  "STRONG",
  "WORTH_REVIEWING",
  "REACH",
  "LOW_PRIORITY",
] as const;

const ARRANGEMENTS = [
  ["ONSITE", "Onsite"],
  ["HYBRID", "Hybrid"],
  ["REMOTE", "Remote"],
  ["UNKNOWN", "No preference"],
] as const;

/** Ranked display order — the same order the defaults are declared in. */
const ROLE_CATEGORIES = Object.keys(ROLE_ALIGNMENT_SCORES) as RoleCategory[];

/** Bands with a tunable floor; LOW_PRIORITY is the fixed floor at 0. */
const EDITABLE_BANDS = BAND_THRESHOLDS.filter((t) => t.band !== "LOW_PRIORITY").map(
  (t) => t.band
);
const DEFAULT_BAND_MINS = Object.fromEntries(
  BAND_THRESHOLDS.map((t) => [t.band, t.min])
) as Record<ScoreBand, number>;

/**
 * The ladder is printed from `BAND_THRESHOLDS`, not from an assumed order:
 * REACH is the SECOND-LOWEST band (floor 45), below WORTH_REVIEWING, and the
 * rendering has to say so. `INELIGIBLE` is the seventh band in the B4 map but
 * carries no floor — the eligibility gates assign it — so it prints as a
 * gate row with no input rather than being silently dropped.
 */
const LADDER_BANDS = BAND_THRESHOLDS.map((t) => t.band);

/** "SUMMER_2027" → "Summer 2027". */
const seasonLabel = (key: string): string => {
  const [term, year] = key.split("_");
  return `${term[0]}${term.slice(1).toLowerCase()} ${year}`;
};

// Plausible upcoming cycles, anchored on the app default's year so the list
// is deterministic (no clock reads → no hydration drift).
const SEASON_CHOICES: string[] = (() => {
  const defaultYear = Number(SEASON.split("_")[1]);
  const out: string[] = [];
  for (let year = defaultYear - 1; year <= defaultYear + 2; year++) {
    for (const term of ["SPRING", "SUMMER", "FALL", "WINTER"]) {
      out.push(`${term}_${year}`);
    }
  }
  return out;
})();

/** The record the notation preview prints, in both grammars. */
const PREVIEW_BAND: ScoreBand = "EXCEPTIONAL";
const PREVIEW_SPONSORSHIP = "CPT_OPT_ACCEPTED" as const;
const NOTATION_SAMPLE: Record<NotationMode, string> = {
  PLAIN: `${BAND_PLAIN[PREVIEW_BAND]} · ${SPONSORSHIP_PLAIN[PREVIEW_SPONSORSHIP]}`,
  COMPACT: `${BAND_CODES[PREVIEW_BAND]} · ${SPONSORSHIP_CODES[PREVIEW_SPONSORSHIP]}`,
};
const NOTATION_WORDS: Record<NotationMode, string> = { PLAIN: "Plain", COMPACT: "Compact" };

const numCls = `${inputCls} w-full font-mono tabular-nums`;

export interface SettingsFormValues {
  weights: Record<ScoreComponent, number>;
  reviewThresholdBand: (typeof THRESHOLD_BANDS)[number];
  preferredArrangement: (typeof ARRANGEMENTS)[number][0];
  timezone: string;
  /** "YYYY-MM-DD", or "" = app default (June 2028). */
  graduationDate: string;
  /** "TERM_YYYY", or "" = app default. */
  targetSeason: string;
  sponsorshipRequired: boolean;
  /** Effective values — stored overrides already resolved over the defaults. */
  roleAlignmentScores: Record<RoleCategory, number>;
  /** Effective thresholds, highest floor first (includes LOW_PRIORITY at 0). */
  bandThresholds: Array<{ band: ScoreBand; min: number }>;
  /** Notation grammar (A5). Never null — the column is NOT NULL, default PLAIN. */
  notationMode: NotationMode;
}

export function SettingsForm({
  initial,
  demo = false,
}: {
  initial: SettingsFormValues;
  /** Public demo: saving is refused server-side, so do not offer it. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [weights, setWeights] = useState<Record<ScoreComponent, string>>(() =>
    Object.fromEntries(
      SCORE_COMPONENTS.map((c) => [c, String(initial.weights[c] ?? 0)])
    ) as Record<ScoreComponent, string>
  );
  const [thresholdBand, setThresholdBand] = useState(initial.reviewThresholdBand);
  const [arrangement, setArrangement] = useState(initial.preferredArrangement);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [gradDate, setGradDate] = useState(initial.graduationDate);
  const [targetSeason, setTargetSeason] = useState(initial.targetSeason);
  const [sponsorshipRequired, setSponsorshipRequired] = useState(initial.sponsorshipRequired);
  const [notationMode, setNotationMode] = useState<NotationMode>(initial.notationMode);
  const [roleScores, setRoleScores] = useState<Record<RoleCategory, string>>(() =>
    Object.fromEntries(
      ROLE_CATEGORIES.map((c) => [c, String(initial.roleAlignmentScores[c] ?? 0)])
    ) as Record<RoleCategory, string>
  );
  const [bandMins, setBandMins] = useState<Record<string, string>>(() => {
    const stored = Object.fromEntries(initial.bandThresholds.map((t) => [t.band, t.min]));
    return Object.fromEntries(
      EDITABLE_BANDS.map((b) => [b, String(stored[b] ?? DEFAULT_BAND_MINS[b])])
    );
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  // Opens itself when overrides are already in force, then the reader owns it.
  const [rolesOpen, setRolesOpen] = useState(() =>
    ROLE_CATEGORIES.some((c) => initial.roleAlignmentScores[c] !== ROLE_ALIGNMENT_SCORES[c])
  );

  const numericWeights = useMemo(() => {
    const out = {} as Record<ScoreComponent, number>;
    for (const c of SCORE_COMPONENTS) {
      const n = Number(weights[c]);
      out[c] = Number.isInteger(n) && n >= 0 && n <= 100 ? n : NaN;
    }
    return out;
  }, [weights]);

  const sum = SCORE_COMPONENTS.reduce((acc, c) => acc + (numericWeights[c] || 0), 0);
  const weightsInvalid = SCORE_COMPONENTS.some((c) => Number.isNaN(numericWeights[c]));
  const sumOk = !weightsInvalid && sum === 100;
  const savedDiffersFromDefaults = SCORE_COMPONENTS.some(
    (c) => (initial.weights[c] ?? 0) !== DEFAULT_WEIGHTS[c]
  );

  const numericRoles = useMemo(() => {
    const out = {} as Record<RoleCategory, number>;
    for (const c of ROLE_CATEGORIES) {
      const n = Number(roleScores[c]);
      out[c] = Number.isInteger(n) && n >= 0 && n <= 100 ? n : NaN;
    }
    return out;
  }, [roleScores]);
  const rolesInvalid = ROLE_CATEGORIES.some((c) => Number.isNaN(numericRoles[c]));
  const roleOverrideCount = rolesInvalid
    ? 0
    : ROLE_CATEGORIES.filter((c) => numericRoles[c] !== ROLE_ALIGNMENT_SCORES[c]).length;

  const numericBands = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of EDITABLE_BANDS) {
      const n = Number(bandMins[b]);
      out[b] = Number.isInteger(n) && n >= 0 && n <= 100 ? n : NaN;
    }
    return out;
  }, [bandMins]);
  const bandsInvalid = EDITABLE_BANDS.some((b) => Number.isNaN(numericBands[b]));
  const bandOrderError = useMemo(() => {
    if (bandsInvalid) return null; // range error is reported first
    for (let i = 1; i < EDITABLE_BANDS.length; i++) {
      const prev = EDITABLE_BANDS[i - 1];
      const curr = EDITABLE_BANDS[i];
      if (numericBands[curr] >= numericBands[prev]) {
        return `${BAND_LABELS[curr]} (${numericBands[curr]}) must be below ${BAND_LABELS[prev]} (${numericBands[prev]}).`;
      }
    }
    const lowest = EDITABLE_BANDS[EDITABLE_BANDS.length - 1];
    if (numericBands[lowest] < 1) {
      return `${BAND_LABELS[lowest]} must be at least 1 — Low priority is the fixed floor at 0.`;
    }
    return null;
  }, [bandsInvalid, numericBands]);
  const bandsOk = !bandsInvalid && bandOrderError === null;
  const bandOverrideCount = bandsOk
    ? EDITABLE_BANDS.filter((b) => numericBands[b] !== DEFAULT_BAND_MINS[b]).length
    : 0;

  const formInvalid = !sumOk || rolesInvalid || !bandsOk;

  /** The live floor of a ladder band — LOW_PRIORITY is pinned, never typed. */
  const floorOf = (band: ScoreBand): number =>
    band === "LOW_PRIORITY" ? 0 : numericBands[band];

  /** `85–100` for the top band, `75–84` beneath it, and so on. */
  const spanOf = (index: number): string => {
    const min = floorOf(LADDER_BANDS[index]);
    if (Number.isNaN(min)) return "—";
    if (index === 0) return `${min}–100`;
    const above = floorOf(LADDER_BANDS[index - 1]);
    if (Number.isNaN(above)) return `${min}–…`;
    return `${min}–${Math.max(min, above - 1)}`;
  };

  const cutIndex = LADDER_BANDS.indexOf(thresholdBand);

  function resetWeights() {
    setWeights(
      Object.fromEntries(
        SCORE_COMPONENTS.map((c) => [c, String(DEFAULT_WEIGHTS[c])])
      ) as Record<ScoreComponent, string>
    );
  }

  function resetRoles() {
    setRoleScores(
      Object.fromEntries(
        ROLE_CATEGORIES.map((c) => [c, String(ROLE_ALIGNMENT_SCORES[c])])
      ) as Record<RoleCategory, string>
    );
  }

  function resetBands() {
    setBandMins(
      Object.fromEntries(EDITABLE_BANDS.map((b) => [b, String(DEFAULT_BAND_MINS[b])]))
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (formInvalid) return;
    setSaving(true);
    setMessage(null);
    const rolesAllDefault = ROLE_CATEGORIES.every(
      (c) => numericRoles[c] === ROLE_ALIGNMENT_SCORES[c]
    );
    const bandsAllDefault = EDITABLE_BANDS.every(
      (b) => numericBands[b] === DEFAULT_BAND_MINS[b]
    );
    const body: Record<string, unknown> = {
      scoringWeights: numericWeights,
      reviewThresholdBand: thresholdBand,
      // Never null: the column is NOT NULL and the schema rejects null (A5).
      notationMode,
      preferredArrangement: arrangement,
      timezone: timezone.trim() || "America/Los_Angeles",
      // null = clear the override so future default changes flow through.
      graduationDate: gradDate || null,
      targetSeason: targetSeason || null,
      sponsorshipRequired,
      roleAlignmentScores: rolesAllDefault ? null : numericRoles,
      bandThresholds: bandsAllDefault
        ? null
        : [
            ...EDITABLE_BANDS.map((b) => ({ band: b, min: numericBands[b] })),
            { band: "LOW_PRIORITY", min: 0 },
          ],
    };
    const res = await patchJson("/api/settings", body);
    setSaving(false);
    if (!res.ok) {
      setMessage({
        tone: "danger",
        text: res.error ?? "Not saved — your changes are still on screen. Try again.",
      });
      return;
    }
    setMessage({ tone: "success", text: "Settings saved." });
    router.refresh();
  }

  return (
    <form onSubmit={save}>
      {/* 1 · PROFILE ─────────────────────────────────────────────────────── */}
      <section>
        <SectionRule label="Profile" right="WHO THE SCOUT SCREENS FOR" />
        <div className="grid gap-x-8 gap-y-4 px-1 pb-1 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field
            label="Graduation date"
            htmlFor="grad-date"
            hint="A posting that asks for a graduation year yours is not in is rejected. Empty = app default (June 2028)."
          >
            <input
              id="grad-date"
              type="date"
              value={gradDate}
              onChange={(e) => setGradDate(e.target.value)}
              className={numCls}
            />
          </Field>

          <Field
            label="Target cycle"
            htmlFor="target-season"
            hint="A posting that names a different term or year — Fall 2026, Summer 2026 — is rejected."
          >
            <select
              id="target-season"
              value={targetSeason}
              onChange={(e) => setTargetSeason(e.target.value)}
              className={`${selectCls} w-full`}
            >
              <option value="">App default — {seasonLabel(SEASON)}</option>
              {(SEASON_CHOICES.includes(targetSeason) || !targetSeason
                ? SEASON_CHOICES
                : [targetSeason, ...SEASON_CHOICES]
              ).map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Preferred arrangement"
            htmlFor="arrangement"
            hint="Feeds the location-fit component of the score."
          >
            <select
              id="arrangement"
              value={arrangement}
              onChange={(e) => setArrangement(e.target.value as typeof arrangement)}
              className={`${selectCls} w-full`}
            >
              {ARRANGEMENTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="IANA timezone"
            htmlFor="timezone"
            hint="Every date in the register and in the daily report renders here."
          >
            <input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Los_Angeles"
              className={numCls}
            />
          </Field>

          <div className="sm:col-span-2 xl:col-span-1">
            <Switch
              checked={sponsorshipRequired}
              onChange={setSponsorshipRequired}
              label="Needs future work-authorization sponsorship"
              hint="Recorded on the profile. The deterministic sponsorship rules read the posting the same way either way, so nothing in this build scores differently."
            />
          </div>
        </div>
      </section>

      {/* 2 · SCORING WEIGHTS ─────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionRule label="Scoring weights" right="EIGHT COMPONENTS · Σ MUST BE 100" />
        <div className="px-1 pt-2.5">
          <div className="grid gap-x-10 sm:grid-cols-2">
            {SCORE_COMPONENTS.map((c, i) => {
              const n = numericWeights[c];
              const bad = Number.isNaN(n);
              const lastPair = i >= SCORE_COMPONENTS.length - 2;
              return (
                <div
                  key={c}
                  className={`flex items-center gap-2.5 border-b border-feint py-[5px] ${
                    lastPair ? "sm:border-b-0" : ""
                  } ${i === SCORE_COMPONENTS.length - 1 ? "border-b-0" : ""}`}
                >
                  <label
                    htmlFor={`w-${c}`}
                    className="w-[124px] shrink-0 truncate font-mono text-[10.5px] font-medium uppercase tracking-[0.04em] text-ink-2"
                  >
                    {SCORE_COMPONENT_LABELS[c]}
                  </label>
                  <span
                    aria-hidden
                    className="-translate-y-[3px] min-w-[10px] flex-1 border-b border-dotted border-rule"
                  />
                  {/* The share of 100 this component carries — the same bar the
                      assessment ledger draws when the score is spent. */}
                  <span aria-hidden className="h-1 w-[96px] shrink-0 rounded-[1px] bg-inset">
                    <span
                      className={`block h-1 rounded-[1px] ${bad ? "bg-carmine" : "bg-ink-3"}`}
                      style={{ width: `${Math.min(100, Math.max(0, bad ? 100 : n))}%` }}
                    />
                  </span>
                  <input
                    id={`w-${c}`}
                    type="number"
                    min={0}
                    max={100}
                    value={weights[c]}
                    onChange={(e) => setWeights((w) => ({ ...w, [c]: e.target.value }))}
                    className={`${inputCls} w-[62px] shrink-0 text-right font-mono tabular-nums ${
                      bad ? "border-carmine" : ""
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* The accountant's total: 1px over, 3px double under. */}
          <DoubleRule>
            <span className="uppercase tracking-[0.08em] text-ink-2">Σ Total</span>
            <span
              className={`ml-auto tabular-nums ${sumOk ? "text-ink" : "text-carmine"}`}
              role="status"
            >
              {weightsInvalid ? "—" : sum} / 100
            </span>
          </DoubleRule>

          <Foot
            note={
              !sumOk ? (
                <span className="text-carmine">
                  {weightsInvalid
                    ? "Each weight must be a whole number between 0 and 100."
                    : sum > 100
                      ? `Remove ${sum - 100} point${sum - 100 === 1 ? "" : "s"}.`
                      : `Add ${100 - sum} point${100 - sum === 1 ? "" : "s"}.`}
                </span>
              ) : savedDiffersFromDefaults ? (
                <>
                  Saved weights differ from the current recommended defaults — Reset to defaults to
                  adopt them.
                </>
              ) : null
            }
            onReset={resetWeights}
          />
        </div>
      </section>

      {/* 3 · ROLE PRIORITIES ─────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionRule
          label="Role priorities"
          collapsed={!rolesOpen}
          onToggle={() => setRolesOpen((v) => !v)}
          right={
            rolesInvalid
              ? "FIX THE HIGHLIGHTED CATEGORIES"
              : roleOverrideCount > 0
                ? `${roleOverrideCount} OF ${ROLE_CATEGORIES.length} DIFFER FROM DEFAULTS`
                : `ALL ${ROLE_CATEGORIES.length} AT DEFAULTS`
          }
        />
        {rolesOpen ? (
          <div className="px-1 pt-2.5">
            <p className="mb-2 text-[12px] text-ink-3">
              The role-alignment subscore (0–100) a listing earns for its classified role category.
            </p>
            <div className="grid gap-x-10 sm:grid-cols-2 xl:grid-cols-3">
              {ROLE_CATEGORIES.map((c) => {
                const bad = Number.isNaN(numericRoles[c]);
                const isDefault = numericRoles[c] === ROLE_ALIGNMENT_SCORES[c];
                return (
                  <div
                    key={c}
                    className="flex items-center gap-2 border-b border-feint py-[5px]"
                  >
                    <label
                      htmlFor={`r-${c}`}
                      className="min-w-0 shrink truncate font-mono text-[10.5px] font-medium uppercase tracking-[0.04em] text-ink-2"
                    >
                      {ROLE_LABELS[c]}
                    </label>
                    <span
                      aria-hidden
                      className="-translate-y-[3px] min-w-[10px] flex-1 border-b border-dotted border-rule"
                    />
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-3">
                      {isDefault ? "default" : `def ${ROLE_ALIGNMENT_SCORES[c]}`}
                    </span>
                    <input
                      id={`r-${c}`}
                      type="number"
                      min={0}
                      max={100}
                      value={roleScores[c]}
                      onChange={(e) => setRoleScores((r) => ({ ...r, [c]: e.target.value }))}
                      className={`${inputCls} w-[62px] shrink-0 text-right font-mono tabular-nums ${
                        bad ? "border-carmine" : ""
                      }`}
                    />
                  </div>
                );
              })}
            </div>
            <Foot
              note={
                rolesInvalid ? (
                  <span className="text-carmine" role="status">
                    Each priority must be a whole number between 0 and 100.
                  </span>
                ) : null
              }
              onReset={resetRoles}
            />
          </div>
        ) : null}
      </section>

      {/* 4 · BAND THRESHOLDS ─────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionRule
          label="Band thresholds"
          right={`REVIEW CUT AT ${BAND_PLAIN[thresholdBand]}`}
        />
        <div className="px-1 pt-2.5">
          <div className="mb-3 max-w-md">
            <Field
              label="Queue for review when the band is at least"
              htmlFor="review-cut"
              hint="Bands at or above the cut reach the review queue; the rest stay in opportunities."
            >
              <select
                id="review-cut"
                value={thresholdBand}
                onChange={(e) => setThresholdBand(e.target.value as typeof thresholdBand)}
                className={`${selectCls} w-full`}
              >
                {THRESHOLD_BANDS.map((b) => (
                  <option key={b} value={b}>
                    {BAND_LABELS[b]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* The ladder, printed from BAND_THRESHOLDS in its real order — REACH
              is the second-LOWEST band, not a high one. */}
          <ul className="border-t border-feint">
            {LADDER_BANDS.map((b, i) => {
              const token = bandColor(b);
              const editable = b !== "LOW_PRIORITY";
              const bad = editable && Number.isNaN(numericBands[b]);
              const isDefault = editable && numericBands[b] === DEFAULT_BAND_MINS[b];
              const inCut = cutIndex >= 0 && i <= cutIndex;
              return (
                <li
                  key={b}
                  className="flex items-center gap-2.5 border-b border-feint py-[5px]"
                  title={`${BAND_LABELS[b]} — scores ${spanOf(i)}`}
                >
                  <span aria-hidden className={`h-3 w-[3px] shrink-0 ${TOKEN_BG[token]}`} />
                  <label
                    htmlFor={editable ? `b-${b}` : undefined}
                    className={`w-[112px] shrink-0 truncate font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] ${TOKEN_TEXT[token]}`}
                  >
                    {BAND_PLAIN[b]}
                  </label>
                  <span className="w-[38px] shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                    {BAND_CODES[b]}
                  </span>
                  <span className="w-[66px] shrink-0 font-mono text-[11px] tabular-nums text-ink-2">
                    {spanOf(i)}
                  </span>
                  <span
                    className={`w-[62px] shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] ${
                      inCut ? "text-ink-2" : "text-ink-3"
                    }`}
                  >
                    {inCut ? "→ review" : "hold"}
                  </span>
                  <span
                    aria-hidden
                    className="-translate-y-[3px] min-w-[10px] flex-1 border-b border-dotted border-rule"
                  />
                  {editable ? (
                    <>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-3">
                        {isDefault ? "default" : `def ${DEFAULT_BAND_MINS[b]}`}
                      </span>
                      <input
                        id={`b-${b}`}
                        type="number"
                        min={0}
                        max={100}
                        value={bandMins[b]}
                        onChange={(e) => setBandMins((m) => ({ ...m, [b]: e.target.value }))}
                        aria-label={`${BAND_LABELS[b]} minimum score`}
                        className={`${inputCls} w-[62px] shrink-0 text-right font-mono tabular-nums ${
                          bad ? "border-carmine" : ""
                        }`}
                      />
                    </>
                  ) : (
                    <span className="w-[62px] shrink-0 text-right font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                      pinned 0
                    </span>
                  )}
                </li>
              );
            })}
            {/* The seventh band in the B4 map. No floor: the eligibility gates
                assign it, so it is shown for completeness and never edited. */}
            <li
              className="flex items-center gap-2.5 border-b border-feint py-[5px]"
              title="Ineligible — assigned by the eligibility gates, not by score"
            >
              <span aria-hidden className={`h-3 w-[3px] shrink-0 ${TOKEN_BG.carmine}`} />
              <span className="w-[112px] shrink-0 truncate font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-carmine">
                {BAND_PLAIN.INELIGIBLE}
              </span>
              <span className="w-[38px] shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
                {BAND_CODES.INELIGIBLE}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.05em] text-ink-3">
                set by the eligibility gates — no floor
              </span>
            </li>
          </ul>

          <Foot
            note={
              !bandsOk ? (
                <span className="text-carmine" role="status">
                  {bandsInvalid
                    ? "Each threshold must be a whole number between 0 and 100."
                    : bandOrderError}
                </span>
              ) : bandOverrideCount > 0 ? (
                <>
                  {bandOverrideCount} of {EDITABLE_BANDS.length} thresholds differ from defaults.
                </>
              ) : null
            }
            onReset={resetBands}
          />
        </div>
      </section>

      {/* 5 · NOTATION ────────────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionRule label="Notation" right={`${NOTATION_WORDS[notationMode].toUpperCase()} GRAMMAR`} />
        <div className="px-1 pt-3">
          <div
            role="group"
            aria-label="Notation grammar"
            className="flex flex-wrap items-center gap-1.5"
          >
            {NOTATION_MODES.map((m) => (
              <Chip
                key={m}
                label={m}
                active={notationMode === m}
                onClick={() => setNotationMode(m)}
                title={
                  m === "PLAIN"
                    ? "Plain — classifications spelled out in full"
                    : "Compact — classifications printed as codes"
                }
              />
            ))}
            <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
              default plain
            </span>
          </div>

          {/* The same record in both grammars, so the choice is legible before
              it is made. The selected line is the ink one. */}
          <dl className="mt-3 max-w-lg">
            {NOTATION_MODES.map((m) => (
              <div
                key={m}
                className="flex items-baseline gap-2.5 border-b border-feint py-[5px] last:border-b-0"
              >
                <dt className="w-[64px] shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  {m}
                </dt>
                <dd
                  className={`font-mono text-[11px] tracking-[0.04em] ${
                    notationMode === m ? "font-semibold text-ink" : "text-ink-3"
                  }`}
                >
                  {NOTATION_SAMPLE[m]}
                  {notationMode === m ? (
                    <span className="ml-2 text-[10px] font-normal text-ink-3">in use</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-2.5 max-w-2xl text-[12px] leading-relaxed text-ink-2">
            Governs classification vocabulary only — band words and sponsorship words, everywhere
            they appear: the tracker ledger, the review queue and worksheet, the dashboard,
            opportunities, archive, calendar, companies and analytics.
          </p>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-3">
            Never switches: verdict stamps, the stage words and their I–V groups, page titles,
            tooltips, screen-reader labels, the footnote legend and the daily email. Every code
            still carries its full-English expansion in its tooltip, so Compact never costs meaning.
          </p>
        </div>
      </section>

      {/* The filing line. */}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-3">
        {/* `Stamp` renders `type="button"`, which cannot submit a form — so the
            filing verb uses the same ink-stamp class string directly. */}
        <button type="submit" className={btnPrimary} disabled={saving || formInvalid || demo}>
          {saving ? "Saving…" : demo ? "Saving disabled on the demo" : "Save settings"}
        </button>
        {formInvalid ? (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-carmine">
            {!sumOk
              ? "Fix the scoring weights to save."
              : rolesInvalid
                ? "Fix the role priorities to save."
                : "Fix the band thresholds to save."}
          </span>
        ) : null}
        {message ? (
          <span
            className={`font-mono text-[10.5px] uppercase tracking-[0.06em] ${
              message.tone === "danger" ? "text-carmine" : "text-green"
            }`}
            role="status"
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/* ── Worksheet furniture ──────────────────────────────────────────────────── */

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[11.5px] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** A section's status line and its reset verb, on one rule-free row. */
function Foot({ note, onReset }: { note?: ReactNode; onReset: () => void }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-3">
      {note ? <p className="text-[11.5px] leading-snug text-ink-3">{note}</p> : null}
      <span className="ml-auto">
        <OutlineVerb onClick={onReset}>Reset to defaults</OutlineVerb>
      </span>
    </div>
  );
}

/**
 * The Register's boolean: an ink stamp printing the word it means.
 *
 * It used to be a 15px box that filled with ink and printed `×` when ON. The
 * character was the right one — B5 bans the dingbat `✕` (U+2715) and the
 * full-width CJK forms and prescribes a mono `×` (U+00D7), which is what this
 * was — but the mark was wrong whichever character wore it. In this codebase
 * `×` is the mark for TAKING SOMETHING AWAY: it dismisses the toast
 * (`ui.tsx`) and it strikes a deadline (`calendar/deadline-actions.tsx`). A
 * switch whose ON state is the delete glyph reads as its own opposite.
 *
 * So no glyph. This is `sources-table.tsx`'s `EnabledSwitch`, which solved the
 * identical problem for the identical control and whose note already says it:
 * the Register's "active" mark is the ink stamp, printing the word. One idiom
 * for a boolean in this app instead of three, and the state is legible without
 * knowing any convention.
 *
 * `role="switch"` + `aria-checked` are preserved verbatim (D7).
 */
function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`mt-[1px] inline-flex w-[40px] shrink-0 items-center justify-center rounded border px-1.5 py-[3px] font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.08em] transition-colors duration-[120ms] ease-out ${
          checked
            ? "border-ink bg-ink text-paper"
            : "border-rule bg-surface text-ink-3 hover:border-ink-3 hover:text-ink"
        }`}
      >
        {checked ? "On" : "Off"}
      </button>
      <div className="min-w-0">
        <div className="text-[12.5px] leading-snug">{label}</div>
        {hint ? <div className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{hint}</div> : null}
      </div>
    </div>
  );
}
