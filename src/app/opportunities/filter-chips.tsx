"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DecisionState,
  RoleCategory,
  ScoreBand,
  SponsorshipConfidence,
} from "@prisma/client";
import { Chip, ChipRow } from "@/components/register/chip";
import { useNotation } from "@/components/register/notation";
import {
  BAND_LABELS,
  CONFIDENCE_LABELS,
  PIP_SPEC,
  ROLE_LABELS,
  bandColor,
  type ColorToken,
} from "@/lib/format";
import { bandText } from "@/lib/notation";
import { DECISION_LABELS, decisionTone } from "@/app/review/meta";

/* ══════════════════════════════════════════════════════════════════════════
   THE ACQUISITIONS TOOLBAR

   Two filter-chip implementations used to live in this tree — this one and
   `archive/archive-filters.tsx`, each with its own pill geometry. Both are now
   `Chip` / `ChipRow` from `@/components/register/chip`, so a filter looks the
   same on every surface that has one.

   The URL contract is UNCHANGED (spec C4): one search param per group, the
   same four names, `router.replace(…, { scroll: false })`. Deep links that
   worked before still work, and `aria-pressed` still rides every chip (D7) —
   `Chip` sets it whenever `onClick` is present.
   ══════════════════════════════════════════════════════════════════════════ */

export interface OpportunityFilters {
  band?: ScoreBand;
  role?: RoleCategory;
  confidence?: SponsorshipConfidence;
  state?: DecisionState;
}

const GROUPS: Array<{
  param: keyof OpportunityFilters;
  label: string;
  options: Array<[string, string]>;
}> = [
  { param: "band", label: "Band", options: Object.entries(BAND_LABELS) },
  { param: "role", label: "Role", options: Object.entries(ROLE_LABELS) },
  {
    param: "confidence",
    label: "Confidence",
    options: Object.entries(CONFIDENCE_LABELS),
  },
  { param: "state", label: "State", options: Object.entries(DECISION_LABELS) },
];

/** `decisionTone` speaks the old `Tone` vocabulary; the chips need a token. */
const DECISION_TICK: Record<ReturnType<typeof decisionTone>, ColorToken> = {
  accent: "blue",
  success: "green",
  warning: "ochre",
  danger: "carmine",
  neutral: "ink-3",
};

/** The leading tick for one option — the colour the same value carries in a row. */
function tickFor(param: keyof OpportunityFilters, value: string): ColorToken | undefined {
  switch (param) {
    case "band":
      return bandColor(value as ScoreBand);
    case "confidence":
      return PIP_SPEC[value as SponsorshipConfidence].color;
    case "state":
      return DECISION_TICK[decisionTone(value as DecisionState)];
    default:
      return undefined;
  }
}

/** Mono-caps group name, printed at the head of its own chip line. */
function GroupLabel({ children }: { children: string }) {
  return (
    <span className="w-[86px] shrink-0 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
      {children}
    </span>
  );
}

/** A quiet mono-caps text control — the disclosure and the reset. */
function TextVerb({
  children,
  onClick,
  expanded,
}: {
  children: React.ReactNode;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...(expanded === undefined ? {} : { "aria-expanded": expanded })}
      className="whitespace-nowrap font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3 underline-offset-2 transition-colors duration-[120ms] ease-out hover:text-ink hover:underline"
    >
      {children}
    </button>
  );
}

export function FilterChips({
  filters,
  right,
}: {
  filters: OpportunityFilters;
  /** A readout that belongs on the toolbar's first line, e.g. the record count. */
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const notation = useNotation();
  // Band is the primary lens; the other three rows are progressive disclosure.
  // Start expanded when one of them is already active (deep link / back nav).
  const [expanded, setExpanded] = useState(
    Boolean(filters.role || filters.confidence || filters.state)
  );

  const navigate = (param: keyof OpportunityFilters, value: string | undefined) => {
    const next = new URLSearchParams();
    for (const g of GROUPS) {
      const v = g.param === param ? value : filters[g.param];
      if (v) next.set(g.param, v);
    }
    const qs = next.toString();
    router.replace(qs ? `/opportunities?${qs}` : "/opportunities", { scroll: false });
  };

  const anyActive = GROUPS.some((g) => filters[g.param]);

  const secondaryActive = [filters.role, filters.confidence, filters.state].filter(
    Boolean
  ).length;

  return (
    <div className="mb-4 border-t border-feint">
      {(expanded ? GROUPS : GROUPS.slice(0, 1)).map((g, i) => {
        const active = filters[g.param];
        return (
          <ChipRow
            key={g.param}
            label={`Filter by ${g.label.toLowerCase()}`}
            right={
              i === 0 ? (
                <>
                  {right}
                  <TextVerb onClick={() => setExpanded((v) => !v)} expanded={expanded}>
                    <span aria-hidden className="mr-1">
                      {expanded ? "▴" : "▾"}
                    </span>
                    {expanded
                      ? "Fewer filters"
                      : `More filters${secondaryActive > 0 ? ` · ${secondaryActive} on` : ""}`}
                  </TextVerb>
                  {anyActive ? (
                    <TextVerb
                      onClick={() => router.replace("/opportunities", { scroll: false })}
                    >
                      Clear
                    </TextVerb>
                  ) : null}
                </>
              ) : null
            }
          >
            <GroupLabel>{g.label}</GroupLabel>
            {g.options.map(([value, label]) => {
              const isActive = active === value;
              return (
                <Chip
                  key={value}
                  // Bands answer to the notation switch; everything else is
                  // already a plain word and stays one in both modes (A5).
                  label={g.param === "band" ? bandText(value as ScoreBand, notation) : label}
                  title={label}
                  tick={tickFor(g.param, value)}
                  active={isActive}
                  onClick={() => navigate(g.param, isActive ? undefined : value)}
                />
              );
            })}
          </ChipRow>
        );
      })}
    </div>
  );
}
