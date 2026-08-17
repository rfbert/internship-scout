import { formatDistanceToNowStrict } from "date-fns";
import type {
  ApplicationStage,
  DeadlineKind,
  Priority,
  ReferralStage,
  RoleCategory,
  RunStatus,
  ScoreBand,
  SponsorshipCategory,
  SponsorshipConfidence,
} from "@prisma/client";
import type { ScoreComponent } from "./constants";

/*
 * There is deliberately no fmtDate/fmtDateShort here any more. Formatting a
 * date in the server's own zone is the bug this app kept re-introducing —
 * use fmtDateTz / fmtDateShortTz from src/lib/dates.ts and pass the user's
 * timezone. fmtAgo survives because a relative distance has no zone.
 */
export const fmtAgo = (d: Date | string | null | undefined) =>
  d ? formatDistanceToNowStrict(new Date(d), { addSuffix: true }) : "—";

/*
 * Eyebrows, stamps and ledger date cells are set in mono caps, so six pages had
 * each declared their own copy of this line. It lives here rather than in
 * notation.ts because notation.ts resolves a value into a mode-dependent
 * GRAMMAR and imports its vocabulary from this file; upper-casing is neither —
 * it is the same plain string shaping as fmtAgo, and it is what wraps the
 * output of fmtDateTz / fmtDateShortTz at almost every call site.
 */
export const upper = (s: string) => s.toUpperCase();

/* ── The Register's color vocabulary ───────────────────────────────────────
   Every semantic mark in the app resolves to one of these seven tokens. They
   are names, not classes: Tailwind cannot build a class from a runtime string,
   so the two maps below are the only sanctioned way to turn a token into CSS.
   Inside an instrument well, use the WELL_* twins — a well is theme-invariant
   and its marks may only ever use the well palette (SYNTHESIS §2.6). */
export type ColorToken = "ink" | "ink-2" | "ink-3" | "carmine" | "blue" | "green" | "ochre" | "rule";

/** Alias used by props that only ever carry a band's color. */
export type BandColor = ColorToken;

export const TOKEN_TEXT: Record<ColorToken, string> = {
  ink: "text-ink",
  "ink-2": "text-ink-2",
  "ink-3": "text-ink-3",
  carmine: "text-carmine",
  blue: "text-blue",
  green: "text-green",
  ochre: "text-ochre",
  rule: "text-rule",
};

export const TOKEN_BG: Record<ColorToken, string> = {
  ink: "bg-ink",
  "ink-2": "bg-ink-2",
  "ink-3": "bg-ink-3",
  carmine: "bg-carmine",
  blue: "bg-blue",
  green: "bg-green",
  ochre: "bg-ochre",
  rule: "bg-rule",
};

export const TOKEN_BORDER: Record<ColorToken, string> = {
  ink: "border-ink",
  "ink-2": "border-ink-2",
  "ink-3": "border-ink-3",
  carmine: "border-carmine",
  blue: "border-blue",
  green: "border-green",
  ochre: "border-ochre",
  rule: "border-rule",
};

/** Well twins. `ink`/`ink-2` collapse to the well's own foreground. */
export const WELL_TEXT: Record<ColorToken, string> = {
  ink: "text-well-fg",
  "ink-2": "text-well-fg",
  "ink-3": "text-well-muted",
  carmine: "text-well-carmine",
  blue: "text-well-blue",
  green: "text-well-green",
  ochre: "text-well-ochre",
  rule: "text-well-rule",
};

export const WELL_BG: Record<ColorToken, string> = {
  ink: "bg-well-fg",
  "ink-2": "bg-well-fg",
  "ink-3": "bg-well-muted",
  carmine: "bg-well-carmine",
  blue: "bg-well-blue",
  green: "bg-well-green",
  ochre: "bg-well-ochre",
  rule: "bg-well-rule",
};

/** Raw CSS var name for a token — for inline styles (bar fills, tape flags). */
export const TOKEN_VAR: Record<ColorToken, string> = {
  ink: "var(--ink)",
  "ink-2": "var(--ink-2)",
  "ink-3": "var(--ink-3)",
  carmine: "var(--carmine)",
  blue: "var(--blue)",
  green: "var(--green)",
  ochre: "var(--ochre)",
  rule: "var(--rule)",
};

export const WELL_VAR: Record<ColorToken, string> = {
  ink: "var(--well-fg)",
  "ink-2": "var(--well-fg)",
  "ink-3": "var(--well-muted)",
  carmine: "var(--well-carmine)",
  blue: "var(--well-blue)",
  green: "var(--well-green)",
  ochre: "var(--well-ochre)",
  rule: "var(--well-rule)",
};

/* ── Bands — seven values (spec A1 correction to SYNTHESIS §4.6) ───────────
   REACH is the SECOND-LOWEST tier (floor 45), not a high one. Never derive a
   band in the UI: render ListingScore.band / InternshipListing.currentBand as
   stored. */
export const BAND_LABELS: Record<ScoreBand, string> = {
  EXCEPTIONAL: "Exceptional",
  HIGH_PRIORITY: "High priority",
  STRONG: "Strong",
  WORTH_REVIEWING: "Worth reviewing",
  REACH: "Reach",
  LOW_PRIORITY: "Low priority",
  INELIGIBLE: "Ineligible",
};

/** Plain-mode notation: the band spelled out, in mono caps. */
export const BAND_PLAIN: Record<ScoreBand, string> = {
  EXCEPTIONAL: "EXCEPTIONAL",
  HIGH_PRIORITY: "HIGH PRIORITY",
  STRONG: "STRONG",
  WORTH_REVIEWING: "WORTH REVIEWING",
  REACH: "REACH",
  LOW_PRIORITY: "LOW PRIORITY",
  INELIGIBLE: "INELIGIBLE",
};

/** Compact-mode notation. */
export const BAND_CODES: Record<ScoreBand, string> = {
  EXCEPTIONAL: "EXC",
  HIGH_PRIORITY: "HPR",
  STRONG: "STR",
  WORTH_REVIEWING: "WRV",
  REACH: "RCH",
  LOW_PRIORITY: "LOW",
  INELIGIBLE: "INEL",
};

export const bandColor = (band: ScoreBand | null | undefined): ColorToken => {
  switch (band) {
    case "EXCEPTIONAL":
    case "HIGH_PRIORITY":
      return "green";
    case "STRONG":
      return "blue";
    case "WORTH_REVIEWING":
      return "ink-2";
    case "REACH":
      return "ochre";
    case "INELIGIBLE":
      return "carmine";
    case "LOW_PRIORITY":
    default:
      return "ink-3";
  }
};

/** INELIGIBLE strikes the row title through — the record is pre-struck. */
export const bandIsStruck = (band: ScoreBand | null | undefined) => band === "INELIGIBLE";

/* ── Sponsorship — all 11 categories ───────────────────────────────────────
   SPONSORSHIP_LABELS is the full sentence and is what every `title` carries,
   in BOTH notation modes. PLAIN/CODES are the visible notation. */
export const SPONSORSHIP_LABELS: Record<SponsorshipCategory, string> = {
  SPONSORSHIP_OFFERED: "Sponsorship offered",
  CPT_OPT_ACCEPTED: "CPT/OPT accepted",
  FUTURE_POSSIBLE: "Future sponsorship possible",
  COMPANY_HISTORY: "Company has sponsorship history",
  UNCERTAIN: "Uncertain — verify",
  NO_INFO: "No sponsorship info found",
  EXPLICITLY_UNAVAILABLE: "No sponsorship (explicit)",
  UNRESTRICTED_AUTH_REQUIRED: "Unrestricted authorization required",
  CITIZENSHIP_REQUIRED: "US citizenship required",
  CLEARANCE_REQUIRED: "Security clearance required",
  USER_INELIGIBLE: "Ineligible",
};

export const SPONSORSHIP_PLAIN: Record<SponsorshipCategory, string> = {
  SPONSORSHIP_OFFERED: "SPONSORED",
  CPT_OPT_ACCEPTED: "CPT OK",
  FUTURE_POSSIBLE: "LIKELY",
  COMPANY_HISTORY: "PRIOR SPONSOR",
  UNCERTAIN: "VERIFY",
  NO_INFO: "NO INFO",
  EXPLICITLY_UNAVAILABLE: "NONE",
  UNRESTRICTED_AUTH_REQUIRED: "US AUTH REQ",
  CITIZENSHIP_REQUIRED: "CITIZENSHIP",
  CLEARANCE_REQUIRED: "CLEARANCE",
  USER_INELIGIBLE: "INELIGIBLE",
};

export const SPONSORSHIP_CODES: Record<SponsorshipCategory, string> = {
  SPONSORSHIP_OFFERED: "OFFERED",
  CPT_OPT_ACCEPTED: "CPT-OK",
  FUTURE_POSSIBLE: "LIKELY",
  COMPANY_HISTORY: "HIST",
  UNCERTAIN: "UNCERT",
  NO_INFO: "UNKNOWN",
  EXPLICITLY_UNAVAILABLE: "NONE",
  UNRESTRICTED_AUTH_REQUIRED: "US-AUTH",
  CITIZENSHIP_REQUIRED: "CITIZEN",
  CLEARANCE_REQUIRED: "CLEAR",
  USER_INELIGIBLE: "INEL",
};

export const sponsorshipColor = (c: SponsorshipCategory | null | undefined): ColorToken => {
  switch (c) {
    case "SPONSORSHIP_OFFERED":
    case "CPT_OPT_ACCEPTED":
      return "green";
    case "FUTURE_POSSIBLE":
    case "COMPANY_HISTORY":
      return "blue";
    case "UNCERTAIN":
    case "NO_INFO":
      return "ochre";
    case "EXPLICITLY_UNAVAILABLE":
    case "UNRESTRICTED_AUTH_REQUIRED":
    case "CITIZENSHIP_REQUIRED":
    case "CLEARANCE_REQUIRED":
    case "USER_INELIGIBLE":
      return "carmine";
    default:
      return "ink-3";
  }
};

export const CONFIDENCE_LABELS: Record<SponsorshipConfidence, string> = {
  CONFIRMED: "Confirmed",
  HIGH: "High confidence",
  MODERATE: "Moderate confidence",
  LOW: "Low confidence",
  UNKNOWN: "Unknown",
  EXPLICITLY_UNAVAILABLE: "Explicitly unavailable",
};

/** Confidence pips — `▪` glyphs, aria-hidden; the count rides the parent label. */
export const PIP_SPEC: Record<SponsorshipConfidence, { pips: number; color: ColorToken }> = {
  CONFIRMED: { pips: 3, color: "green" },
  HIGH: { pips: 3, color: "green" },
  MODERATE: { pips: 2, color: "ochre" },
  LOW: { pips: 1, color: "ochre" },
  UNKNOWN: { pips: 1, color: "ink-3" },
  EXPLICITLY_UNAVAILABLE: { pips: 1, color: "carmine" },
};

/* ── Stages — 14 values, 5 groups, three label tiers (A3 / A9) ─────────────
   STAGE_LABELS is unchanged. SHORT and CODES are new and supersede the private
   SHORT map that lived in src/app/tracker/line-map.tsx. */
export const STAGE_LABELS: Record<ApplicationStage, string> = {
  INTERESTED: "Interested",
  PREPARING: "Preparing",
  READY_TO_APPLY: "Ready to apply",
  APPLIED: "Applied",
  ONLINE_ASSESSMENT: "Online assessment",
  RECRUITER_SCREEN: "Recruiter screen",
  FIRST_INTERVIEW: "First interview",
  TECHNICAL_INTERVIEW: "Technical interview",
  PRODUCT_CASE_INTERVIEW: "Product/case interview",
  FINAL_INTERVIEW: "Final interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  CLOSED: "Closed",
};

export const STAGE_SHORT_LABELS: Record<ApplicationStage, string> = {
  INTERESTED: "Interested",
  PREPARING: "Preparing",
  READY_TO_APPLY: "Ready",
  APPLIED: "Applied",
  ONLINE_ASSESSMENT: "Online asmt",
  RECRUITER_SCREEN: "Recruiter",
  FIRST_INTERVIEW: "First round",
  TECHNICAL_INTERVIEW: "Technical",
  PRODUCT_CASE_INTERVIEW: "Product case",
  FINAL_INTERVIEW: "Final",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  CLOSED: "Closed",
};

export const STAGE_CODES: Record<ApplicationStage, string> = {
  INTERESTED: "INT",
  PREPARING: "PRE",
  READY_TO_APPLY: "RDY",
  APPLIED: "APP",
  ONLINE_ASSESSMENT: "OA",
  RECRUITER_SCREEN: "REC",
  FIRST_INTERVIEW: "R1",
  TECHNICAL_INTERVIEW: "TEC",
  PRODUCT_CASE_INTERVIEW: "CSE",
  FINAL_INTERVIEW: "FIN",
  OFFER: "OFR",
  REJECTED: "REJ",
  WITHDRAWN: "WDR",
  CLOSED: "CLS",
};

export type StageGroup = "scout" | "submitted" | "interview" | "offer" | "closed";

/**
 * Canonical grouping (A3). `src/app/tracker/meta.ts` keeps its own `stageGroup`
 * for its existing importers (Part E shared-import contract); the two agree
 * value-for-value and this one is the shared source for register primitives.
 */
export const stageGroupOf = (s: ApplicationStage): StageGroup => {
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

export const stageGroupColor = (g: StageGroup): ColorToken => {
  switch (g) {
    case "submitted":
      return "ochre";
    case "interview":
      return "blue";
    case "offer":
      return "green";
    case "closed":
      return "rule";
    case "scout":
    default:
      return "ink-3";
  }
};

/** Group frames in ledger order: roman folio, display word, tick, members. */
export const STAGE_GROUPS: ReadonlyArray<{
  group: StageGroup;
  roman: string;
  label: string;
  tick: ColorToken;
  stages: ApplicationStage[];
}> = [
  {
    group: "scout",
    roman: "I",
    label: "SCOUTING",
    tick: "ink-3",
    stages: ["INTERESTED", "PREPARING", "READY_TO_APPLY"],
  },
  {
    group: "submitted",
    roman: "II",
    label: "SUBMITTED",
    tick: "ochre",
    stages: ["APPLIED", "ONLINE_ASSESSMENT"],
  },
  {
    group: "interview",
    roman: "III",
    label: "INTERVIEWING",
    tick: "blue",
    stages: [
      "RECRUITER_SCREEN",
      "FIRST_INTERVIEW",
      "TECHNICAL_INTERVIEW",
      "PRODUCT_CASE_INTERVIEW",
      "FINAL_INTERVIEW",
    ],
  },
  { group: "offer", roman: "IV", label: "OFFER", tick: "green", stages: ["OFFER"] },
  {
    group: "closed",
    roman: "V",
    label: "CLOSED",
    tick: "rule",
    stages: ["REJECTED", "WITHDRAWN", "CLOSED"],
  },
];

/* ── Priority ──────────────────────────────────────────────────────────────
   Replaces PRIORITY_DOT_CLS in src/app/tracker/meta.ts. LOW is hollow. */
export const PRIORITY_SPEC: Record<Priority, { color: ColorToken; filled: boolean }> = {
  URGENT: { color: "carmine", filled: true },
  HIGH: { color: "ochre", filled: true },
  MEDIUM: { color: "blue", filled: true },
  LOW: { color: "ink-3", filled: false },
};

export const PRIORITY_WORDS: Record<Priority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

/* ── Score components (A1) ─────────────────────────────────────────────────
   Ledger row labels, in mono caps, matching the atelier mock. */
export const SCORE_COMPONENT_LABELS: Record<ScoreComponent, string> = {
  careerValue: "CAREER VALUE",
  sponsorship: "SPONSORSHIP",
  roleAlignment: "ROLE ALIGNMENT",
  companyQuality: "COMPANY QUALITY",
  ugEligibility: "UG ELIGIBILITY",
  compensation: "COMPENSATION",
  locationFit: "LOCATION FIT",
  freshness: "FRESHNESS",
};

export const ROLE_LABELS: Record<RoleCategory, string> = {
  AI_PRODUCT_MANAGEMENT: "AI Product Management",
  PM_FOR_AI_PRODUCTS: "PM — AI products",
  TECHNICAL_PM: "Technical PM",
  AI_ENGINEERING: "AI Engineering",
  APPLIED_AI: "Applied AI",
  ML_ENGINEERING: "ML Engineering",
  APM_PROGRAM: "APM program",
  PRODUCT_ROTATIONAL: "Product rotational",
  OTHER_EXCEPTIONAL: "Other — exceptional",
  DATA_SCIENCE: "Data Science",
  RESEARCH: "Research",
  SOFTWARE_ENGINEERING: "Software Engineering",
  OTHER: "Other",
};

/* ── Ops enums, pre-moved here so no page agent has to edit this file (C1) ── */
export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  RUNNING: "Running",
  SUCCESS: "Success",
  PARTIAL: "Partial",
  FAILED: "Failed",
};

export const runStatusColor = (s: RunStatus): ColorToken => {
  switch (s) {
    case "SUCCESS":
      return "green";
    case "PARTIAL":
      return "ochre";
    case "FAILED":
      return "carmine";
    case "RUNNING":
    default:
      return "blue";
  }
};

export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  APPLICATION_DEADLINE: "Application deadline",
  SUGGESTED_APPLY_BY: "Suggested apply-by",
  FOLLOW_UP: "Follow-up",
  ASSESSMENT_DEADLINE: "Assessment",
  INTERVIEW: "Interview",
  REFERRAL_REMINDER: "Referral reminder",
  OFFER_DEADLINE: "Offer deadline",
};

export const REFERRAL_STAGE_LABELS: Record<ReferralStage, string> = {
  POTENTIAL_CONTACT: "Potential contact",
  CONTACTED: "Contacted",
  RESPONDED: "Responded",
  INFORMATIONAL_CONVERSATION: "Informational conversation",
  REFERRAL_REQUESTED: "Referral requested",
  REFERRAL_RECEIVED: "Referral received",
  DECLINED: "Declined",
  NO_RESPONSE: "No response",
};

/* ── Urgency (B4) ──────────────────────────────────────────────────────────
   <7d carmine · <21d ochre · overdue carmine AND the literal word OVERDUE. */
export const urgencyColor = (daysUntil: number | null | undefined): ColorToken => {
  if (daysUntil == null) return "ink-2";
  if (daysUntil < 7) return "carmine";
  if (daysUntil < 21) return "ochre";
  return "ink-2";
};

/* ── Superseded, still imported in ~10 unconverted files ───────────────────
   bandTone/sponsorshipTone map onto the OLD five-tone Badge vocabulary. They
   stay exported so unconverted pages keep compiling; delete them in a sweep
   once `grep -rn "bandTone\|sponsorshipTone" src` is empty. */
export const bandTone = (
  band: ScoreBand | null | undefined,
): "accent" | "success" | "warning" | "danger" | "neutral" => {
  switch (band) {
    case "EXCEPTIONAL":
    case "HIGH_PRIORITY":
      return "success";
    case "STRONG":
    case "WORTH_REVIEWING":
      return "accent";
    case "REACH":
      return "warning";
    case "INELIGIBLE":
      return "danger";
    default:
      return "neutral";
  }
};

export const sponsorshipTone = (
  c: SponsorshipCategory | null | undefined,
): "accent" | "success" | "warning" | "danger" | "neutral" => {
  switch (c) {
    case "SPONSORSHIP_OFFERED":
    case "CPT_OPT_ACCEPTED":
      return "success";
    case "FUTURE_POSSIBLE":
    case "COMPANY_HISTORY":
      return "accent";
    case "UNCERTAIN":
    case "NO_INFO":
      return "warning";
    case "EXPLICITLY_UNAVAILABLE":
    case "UNRESTRICTED_AUTH_REQUIRED":
    case "CITIZENSHIP_REQUIRED":
    case "CLEARANCE_REQUIRED":
    case "USER_INELIGIBLE":
      return "danger";
    default:
      return "neutral";
  }
};
