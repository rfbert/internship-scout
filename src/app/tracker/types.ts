import type {
  ApplicationStage,
  Priority,
  ReferralStage,
  ScoreBand,
  SponsorshipCategory,
  SponsorshipConfidence,
  WorkArrangement,
} from "@prisma/client";

/** JSON-safe rows passed from the server page to the client tracker. Dates are ISO strings. */

export interface TrackerContact {
  linkId: string;
  role: string | null;
  contactId: string;
  name: string;
  position: string | null;
  relationship: string | null;
  email: string | null;
  linkedinUrl: string | null;
}

export interface TrackerReferral {
  id: string;
  contactId: string;
  contactName: string;
  stage: ReferralStage;
  requestedAt: string | null;
  receivedAt: string | null;
  notesText: string | null;
}

export interface TrackerNote {
  id: string;
  body: string;
  createdAt: string;
}

export interface TrackerHistoryEntry {
  id: string;
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  note: string | null;
  changedAt: string;
}

export interface TrackerRow {
  id: string;
  /**
   * The record's permanent archive identity, `A-0192` (spec A2). Derived from
   * creation order by `accessionMap()`; never stored, never reused.
   */
  accession: string;
  listingId: string;
  companyId: string;
  companyName: string;
  title: string;
  isSample: boolean;
  /** MANUAL = the user's own entry — exempt from automated rescoring. */
  origin: "SCRAPED" | "MANUAL";
  stage: ApplicationStage;
  priority: Priority;
  score: number | null;
  band: ScoreBand | null;
  sponsorshipCategory: SponsorshipCategory | null;
  sponsorshipConfidence: SponsorshipConfidence | null;
  location: string | null;
  workArrangement: WorkArrangement;
  /** e.g. "12 weeks" — printed on the dossier's TERM line when present. */
  durationText: string | null;
  /**
   * The posting's own words about sponsorship / work authorization, captured
   * verbatim at analysis time. The dossier quotes it as evidence rather than
   * asking the reader to trust a classification.
   */
  sponsorshipLanguage: string | null;
  workAuthLanguage: string | null;
  deadline: string | null;
  deadlineIsEstimated: boolean;
  acceptedAt: string;
  appliedAt: string | null;
  lastActivityAt: string;
  nextAction: string | null;
  followUpAt: string | null;
  recruiterName: string | null;
  hiringManagerName: string | null;
  contactEmail: string | null;
  contactLinkedin: string | null;
  referralStatus: string | null;
  finalOutcome: string | null;
  rejectionReason: string | null;
  postingUrl: string | null;
  applyUrl: string | null;
  tags: Array<{ id: string; name: string }>;
  contacts: TrackerContact[];
  referrals: TrackerReferral[];
  notes: TrackerNote[];
  history: TrackerHistoryEntry[];
}

/**
 * How the register is laid out. `grouped` prints five `SectionRule`s I–V;
 * `flat` prints one sortable run with the group surviving as the row's tick.
 *
 * This replaces `TrackerView` (`"table" | "kanban"`). The kanban is gone —
 * fourteen 240px columns can never fit a viewport — so a stale `?view=kanban`
 * URL simply falls through to the register rather than 404ing.
 */
export type TrackerLayout = "grouped" | "flat";

export interface TrackerFilters {
  stage?: ApplicationStage;
  priority?: Priority;
  overdue: boolean;
}
