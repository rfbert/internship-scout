"use client";

import { useRouter } from "next/navigation";
import { Chip, ChipRow } from "@/components/register/chip";
import type { ColorToken } from "@/lib/format";
import { DECISION_LABELS, decisionTone } from "@/app/review/meta";

import { ARCHIVED_STATES, type ArchivedState } from "./meta";

export { ARCHIVED_STATES, type ArchivedState };

/* ══════════════════════════════════════════════════════════════════════════
   The archive's toolbar — the SAME chips `/opportunities` and `/tracker` wear.
   This file used to carry its own `chipCls` pill; that was the second of three
   implementations and it is gone (spec C4). Behaviour is untouched: two params,
   `state` and `reason`, replaced without scroll.
   ══════════════════════════════════════════════════════════════════════════ */

export interface ArchiveFilters {
  state?: ArchivedState;
  reason?: string;
}

/** `decisionTone` speaks the old `Tone` vocabulary; the chips need a token. */
const DECISION_TICK: Record<ReturnType<typeof decisionTone>, ColorToken> = {
  accent: "blue",
  success: "green",
  warning: "ochre",
  danger: "carmine",
  neutral: "ink-3",
};

function GroupLabel({ children }: { children: string }) {
  return (
    <span className="w-[86px] shrink-0 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
      {children}
    </span>
  );
}

export function ArchiveFilterChips({
  filters,
  reasons,
  right,
}: {
  filters: ArchiveFilters;
  reasons: Array<{ key: string; label: string }>;
  /** A readout for the first line, e.g. the record count. */
  right?: React.ReactNode;
}) {
  const router = useRouter();

  const navigate = (next: ArchiveFilters) => {
    const params = new URLSearchParams();
    if (next.state) params.set("state", next.state);
    if (next.reason) params.set("reason", next.reason);
    const qs = params.toString();
    router.replace(qs ? `/archive?${qs}` : "/archive", { scroll: false });
  };

  const anyActive = Boolean(filters.state || filters.reason);

  return (
    <div className="mb-4 border-t border-feint">
      <ChipRow
        label="Filter by decision state"
        right={
          <>
            {right}
            {anyActive ? (
              <button
                type="button"
                onClick={() => navigate({})}
                className="whitespace-nowrap font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3 underline-offset-2 transition-colors duration-[120ms] ease-out hover:text-ink hover:underline"
              >
                Clear
              </button>
            ) : null}
          </>
        }
      >
        <GroupLabel>State</GroupLabel>
        {ARCHIVED_STATES.map((s) => {
          const isActive = filters.state === s;
          return (
            <Chip
              key={s}
              label={DECISION_LABELS[s]}
              title={DECISION_LABELS[s]}
              tick={DECISION_TICK[decisionTone(s)]}
              active={isActive}
              onClick={() => navigate({ ...filters, state: isActive ? undefined : s })}
            />
          );
        })}
      </ChipRow>

      {reasons.length > 0 ? (
        <ChipRow label="Filter by discard reason">
          <GroupLabel>Reason</GroupLabel>
          {reasons.map((r) => {
            const isActive = filters.reason === r.key;
            return (
              <Chip
                key={r.key}
                label={r.label}
                title={r.label}
                active={isActive}
                onClick={() =>
                  navigate({ ...filters, reason: isActive ? undefined : r.key })
                }
              />
            );
          })}
        </ChipRow>
      ) : null}
    </div>
  );
}
