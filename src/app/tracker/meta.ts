import type { ApplicationStage, Priority, ReferralStage } from "@prisma/client";
import { REFERRAL_STAGE_LABELS, type ColorToken } from "@/lib/format";

/*
 * Tracker vocabulary.
 *
 * The transit-map generation of this file is gone with the map: `RAIL_BG`,
 * `RAIL_BORDER`, `GROUP_TEXT`, `PRIORITY_DOT_CLS`, `stageTone`, `priorityTone`
 * and the local `Tone` union all resolved to tokens that no longer exist
 * (`bg-rail-*`, `text-accent`, …). Their replacements are canonical and shared:
 * `PRIORITY_SPEC` / `<Priority>` for the dot, `stageGroupColor` for the tick,
 * `<Band>` / `<Sponsorship>` for the classifications. Verified unimported
 * outside this directory before deletion (Part E).
 *
 * Part E's shared-import contract pins six exports here — `PRIORITY_LABELS`,
 * `PRIORITY_ORDER`, `REFERRAL_STAGE_LABELS`, `REMOVAL_REASONS`, `stageGroup`,
 * `isOverdue`. All six survive.
 */

// Stage progression lives in @/lib/stages (shared with the stage API route);
// re-exported here so tracker components keep importing from meta.
export { PIPELINE_STAGES, STAGE_ORDER, TERMINAL_STAGES, stageRank } from "@/lib/stages";

/**
 * Why a role is leaving the tracker. The reason is not bookkeeping — it decides
 * what the daily agent does next, so the labels say the consequence out loud.
 */
export const REMOVAL_REASONS = [
  {
    id: "INELIGIBLE",
    label: "Not eligible",
    hint: "PhD-only, citizenship, wrong season — won't be suggested again",
  },
  { id: "NOT_INTERESTED", label: "Not interested", hint: "Moves to Archive" },
  { id: "DUPLICATE", label: "Duplicate", hint: "Same role tracked twice" },
  { id: "MISTAKE", label: "Added by mistake", hint: "Returns to the review queue" },
] as const;

export type RemovalReason = (typeof REMOVAL_REASONS)[number]["id"];

export const PRIORITY_ORDER: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const REFERRAL_STAGE_ORDER: ReferralStage[] = [
  "POTENTIAL_CONTACT",
  "CONTACTED",
  "RESPONDED",
  "INFORMATIONAL_CONVERSATION",
  "REFERRAL_REQUESTED",
  "REFERRAL_RECEIVED",
  "DECLINED",
  "NO_RESPONSE",
];

/**
 * Part E pins this export to this module; the values are now the canonical ones
 * in `@/lib/format`, so this is a re-export rather than a second copy that can
 * drift.
 */
export { REFERRAL_STAGE_LABELS };

/** A referral's own colour token — the same seven-token vocabulary as bands. */
export const referralColor = (s: ReferralStage): ColorToken => {
  switch (s) {
    case "REFERRAL_RECEIVED":
      return "green";
    case "REFERRAL_REQUESTED":
    case "INFORMATIONAL_CONVERSATION":
    case "RESPONDED":
      return "blue";
    case "DECLINED":
    case "NO_RESPONSE":
      return "carmine";
    default:
      return "ink-3";
  }
};

/* ── Stage groups ──────────────────────────────────────────────────────────
   The register runs scouting → submitted → interviewing → offer → closed.
   `stageGroupOf` in @/lib/format is the canonical copy the register primitives
   read; this one is pinned by Part E's shared-import contract and agrees with
   it value for value. */
export type StageGroup = "scout" | "submitted" | "interview" | "offer" | "closed";

export const stageGroup = (s: ApplicationStage): StageGroup => {
  switch (s) {
    case "INTERESTED":
    case "PREPARING":
    case "READY_TO_APPLY":
      return "scout";
    case "APPLIED":
    case "ONLINE_ASSESSMENT":
      return "submitted";
    case "OFFER":
      return "offer";
    case "REJECTED":
    case "WITHDRAWN":
    case "CLOSED":
      return "closed";
    default:
      return "interview";
  }
};

/* ── Relative time, ledger-width ───────────────────────────────────────────
   `fmtAgo` from @/lib/format prints "12 days ago" — 11 characters too many for
   a 66px ACTIVITY column, and it reads the browser's clock, which drifts from
   the server's between render and hydration. This takes the page's own `now`
   and prints the mock's form: `3h ago`, `12d ago`, `2mo ago`. */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function fmtAgoShort(iso: string | null | undefined, now: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const ms = new Date(now).getTime() - then;
  if (Number.isNaN(ms)) return "—";
  // A clock skew of a few seconds is not the future; anything genuinely ahead
  // of `now` reads as "just now" rather than a negative age.
  if (ms < MIN) return "now";
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  const days = Math.floor(ms / DAY);
  if (days < 60) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * The overdue mark this table prints. Part E pins the name to this module; the
 * definition is `isFollowUpOverdue` in @/lib/stages — the same function object
 * `page.tsx` filters its rows with and `/` counts its Overdue figure with, not
 * a second copy that agrees today.
 *
 * That identity is the point. When this was a local copy that hard-rejected
 * TERMINAL_STAGES while the server's `?overdue=1` query dropped its stage
 * exclusion for an explicit `?stage=`, `/tracker?overdue=1&stage=REJECTED`
 * rendered rows selected *because* they were overdue above a summary reading
 * "0 overdue". One function cannot disagree with itself.
 */
export { isFollowUpOverdue as isOverdue } from "@/lib/stages";
