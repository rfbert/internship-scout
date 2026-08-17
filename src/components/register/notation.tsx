"use client";

import { createContext, useContext, type ReactNode } from "react";
import type {
  Priority as PriorityValue,
  ScoreBand,
  SponsorshipCategory,
  SponsorshipConfidence,
} from "@prisma/client";
import {
  PIP_SPEC,
  PRIORITY_SPEC,
  PRIORITY_WORDS,
  TOKEN_BORDER,
  TOKEN_BG,
  TOKEN_TEXT,
  WELL_TEXT,
  bandColor,
  sponsorshipColor,
} from "@/lib/format";
import {
  DEFAULT_NOTATION,
  ESTIMATED_GLOSS,
  bandAria,
  bandText,
  bandTitle,
  pipGlyphs,
  sponsorshipAria,
  sponsorshipText,
  sponsorshipTitle,
  type NotationMode,
} from "@/lib/notation";

/* ══════════════════════════════════════════════════════════════════════════
   THE NOTATION LAYER

   One switch — Plain ⇄ Compact — governs CLASSIFICATION VOCABULARY only:
   band words and sponsorship words. It never touches verdict stamps, the 14
   stage words, the I–V group names, page titles, `title=` tooltips,
   `aria-label`s, the footnote legend or email. Those are always plain English.

   Every mark below carries the full expansion in `title` IN BOTH MODES, and
   an accessible name that spells the classification out — so a Compact-mode
   screen never becomes an unreadable one.
   ══════════════════════════════════════════════════════════════════════════ */

const NotationContext = createContext<NotationMode>(DEFAULT_NOTATION);

/**
 * Set once in `RootLayout` from `UserPreference.notationMode`. Client context,
 * so any client component below it can read the mode without prop-drilling
 * through eleven pages.
 */
export function NotationProvider({
  value,
  children,
}: {
  value: NotationMode;
  children: ReactNode;
}) {
  return <NotationContext.Provider value={value}>{children}</NotationContext.Provider>;
}

export function useNotation(): NotationMode {
  return useContext(NotationContext);
}

/**
 * Score + band. `well` swaps to the theme-invariant well palette — marks inside
 * an instrument well may only ever use the well colors (SYNTHESIS §2.6).
 */
export function Band({
  band,
  score,
  well = false,
}: {
  band: ScoreBand | null;
  score?: number | null;
  /** Rendering inside a `<Well>`. Optional; defaults to the page palette. */
  well?: boolean;
}) {
  const mode = useNotation();
  const token = bandColor(band);
  const color = well ? WELL_TEXT[token] : TOKEN_TEXT[token];

  return (
    <span
      className="inline-flex items-baseline gap-[5px] whitespace-nowrap"
      title={bandTitle(band)}
      aria-label={bandAria(band, score)}
    >
      {score != null ? (
        <b className="font-mono text-[12.5px] font-semibold tabular-nums">{score}</b>
      ) : null}
      <span className={`font-mono text-[10px] font-semibold tracking-[0.05em] ${color}`}>
        {bandText(band, mode)}
      </span>
    </span>
  );
}

/** Sponsorship word (or code) plus its confidence pips, on one line. */
export function Sponsorship({
  category,
  confidence,
  well = false,
}: {
  category: SponsorshipCategory | null;
  confidence: SponsorshipConfidence | null;
  well?: boolean;
}) {
  const mode = useNotation();
  const token = sponsorshipColor(category);
  const color = well ? WELL_TEXT[token] : TOKEN_TEXT[token];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[10.5px] font-medium ${color}`}
      title={`${sponsorshipTitle(category)} · ${pipGlyphs(confidence).length} of 3 confidence`}
      aria-label={sponsorshipAria(category, confidence)}
    >
      {sponsorshipText(category, mode)}
      <Pips confidence={confidence} well={well} bare />
    </span>
  );
}

/**
 * Confidence pips. `aria-hidden` always — the count and its meaning ride the
 * parent's accessible name, so the glyphs are pure redundancy (D3).
 * `bare` skips the wrapper's own label (it is already inside a `Sponsorship`).
 */
export function Pips({
  confidence,
  well = false,
  bare = false,
}: {
  confidence: SponsorshipConfidence | null;
  well?: boolean;
  bare?: boolean;
}) {
  const spec = PIP_SPEC[confidence ?? "UNKNOWN"];
  const color = well ? WELL_TEXT[spec.color] : TOKEN_TEXT[spec.color];
  const glyphs = (
    <span aria-hidden className={`font-mono tracking-[0.06em] ${color}`}>
      {pipGlyphs(confidence)}
    </span>
  );
  if (bare) return glyphs;
  return (
    <span aria-label={`${spec.pips} of 3 confidence`} className="inline-flex">
      {glyphs}
    </span>
  );
}

/**
 * The certainty stroke: `~` prefix AND a 1px dashed underline AND an
 * announcement of "estimated". All three, everywhere, always — one convention
 * learned once.
 *
 * a11y note: the spec's literal `aria-label="estimated"` would REPLACE the
 * value ("~AUG 30" would announce as just "estimated"). So the marker is added,
 * never substituted: pass `label` to name the whole thing yourself, otherwise a
 * visually-hidden ", estimated" is appended after the value.
 */
export function Estimated({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span
      className="register-estimated"
      title={label ?? `~ ${ESTIMATED_GLOSS}`}
      {...(label ? { "aria-label": `${label} (estimated)` } : {})}
    >
      ~{children}
      {label ? null : <span className="sr-only">, estimated</span>}
    </span>
  );
}

/** Priority dot. LOW is hollow; the word always rides in `title`. */
export function Priority({ priority }: { priority: PriorityValue | null | undefined }) {
  if (!priority) return <span className="text-ink-3">—</span>;
  const spec = PRIORITY_SPEC[priority];
  return (
    <span
      title={`Priority: ${PRIORITY_WORDS[priority]}`}
      aria-label={`Priority: ${PRIORITY_WORDS[priority]}`}
      className={`inline-block size-[7px] rounded-full ${
        spec.filled ? TOKEN_BG[spec.color] : `border ${TOKEN_BORDER[spec.color]}`
      }`}
    />
  );
}
