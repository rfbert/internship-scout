import type {
  PayType,
  RoleCategory,
  SourceKind,
  SponsorshipCategory,
  SponsorshipConfidence,
  UgEligibility,
  WorkArrangement,
} from "@prisma/client";

/**
 * The canonical shape every source connector must emit.
 * Connectors do NO analysis — they only extract what the source states.
 */
export interface RawPosting {
  /** Stable per-source identifier when the source provides one (ATS job id). */
  externalId?: string;
  title: string;
  companyName: string;
  companyWebsite?: string;
  /** Raw location strings exactly as the source shows them. */
  locations: string[];
  remoteHint?: boolean;
  description?: string;
  postingUrl: string;
  applyUrl?: string;
  postedAt?: Date;
  /** Compensation text verbatim (e.g. "$45–55/hr"). */
  compensationText?: string;
  /** Source-specific markers, e.g. GitHub legend emojis found on the row. */
  markers?: {
    citizenshipRequired?: boolean; // 🇺🇸
    noSponsorship?: boolean; // 🛂
    closed?: boolean; // 🔒
  };
  /** Age in days when the source lists one (GitHub tables). */
  ageDays?: number;
  raw?: unknown;
}

export interface SourceFetchResult {
  postings: RawPosting[];
  /** Non-fatal issues encountered while parsing. */
  warnings: string[];
}

export interface SourceConnector {
  key: string;
  kind: SourceKind;
  /** Fetch current postings. Must respect the passed rate limiter. */
  fetch(config: unknown, ctx: ConnectorContext): Promise<SourceFetchResult>;
}

export interface ConnectorContext {
  /** Awaitable politeness delay keyed by host. */
  throttle(host: string): Promise<void>;
  fetchImpl?: typeof fetch;
  log(message: string): void;
}

/** Normalized posting after Stage 3, ready for dedup + persistence. */
export interface NormalizedPosting {
  externalId?: string;
  title: string;
  normalizedTitle: string;
  companyName: string;
  normalizedCompany: string;
  companyWebsite?: string;
  locations: Array<{
    rawText: string;
    city?: string;
    state?: string;
    country: string;
    isRemote: boolean;
  }>;
  workArrangement: WorkArrangement;
  description?: string;
  descriptionHash?: string;
  postingUrl: string;
  normalizedPostingUrl: string;
  applyUrl?: string;
  postedAt?: Date;
  compensation: {
    payType: PayType;
    minAmount?: number;
    maxAmount?: number;
    period?: "hour" | "month" | "total";
    rawText?: string;
  };
  markers: NonNullable<RawPosting["markers"]>;
  ageDays?: number;
  raw?: unknown;
}

/** Deterministic eligibility gate result (Stage 5). */
export interface EligibilityResult {
  eligible: boolean;
  /** Populated when eligible=false. */
  rejectReason?:
    | "WRONG_SEASON"
    | "NOT_UNDERGRAD"
    | "NOT_US"
    | "CLOSED"
    | "UNPAID"
    | "NOT_AN_INTERNSHIP";
  seasonMatch: "EXPLICIT" | "INFERRED" | "NEGATIVE" | "UNKNOWN";
  seasonEvidence?: string;
  ugEligibility: UgEligibility;
  isUS: boolean;
  isPaid: boolean | "UNKNOWN";
  notes: string[];
}

/** Sponsorship rule-engine result (Stage 6). */
export interface SponsorshipRuleResult {
  category: SponsorshipCategory;
  confidence: SponsorshipConfidence;
  hardReject: boolean;
  matchedText: string[];
  conflictingInfo?: string;
  cptCompatible?: boolean;
  optCompatible?: boolean;
  stemOptRelevant?: boolean;
  futureSponsorshipPotential: "LIKELY" | "POSSIBLE" | "UNLIKELY" | "UNKNOWN";
  explanation: string;
  /** Non-blocking caveats to surface to the user (e.g. "CPT not explicitly mentioned"). */
  warnings?: string[];
}

/** Explainable score (Stage 7). */
export interface ScoreResult {
  overall: number;
  band: import("@prisma/client").ScoreBand;
  components: Record<import("./constants").ScoreComponent, number>;
  positives: string[];
  concerns: string[];
  missing: string[];
  recommendedAction: string;
  engine: "rules" | "rules+ai";
  model?: string;
  promptVersion?: string;
}

/** Facts the scorer consumes (assembled by the orchestrator). */
export interface ScoringInput {
  roleCategory: RoleCategory;
  sponsorship: SponsorshipRuleResult;
  eligibility: EligibilityResult;
  companyHasSponsorshipHistory: boolean;
  companyPriorityScore?: number | null;
  companyStage?: string | null;
  compensation: NormalizedPosting["compensation"];
  workArrangement: WorkArrangement;
  preferredArrangement: WorkArrangement;
  postedAt?: Date | null;
  applicationDeadline?: Date | null;
  descriptionLength: number;
  aiCareerAssessment?: {
    careerValue: number; // 0-100
    companyQuality: number; // 0-100
    positives: string[];
    concerns: string[];
    model: string;
    promptVersion: string;
  };
  now?: Date;
}

/** AI provider abstraction — see src/server/ai. */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Returns null when the provider is unavailable/unconfigured. */
  classifyRole(input: {
    title: string;
    company: string;
    description?: string;
  }): Promise<{ category: RoleCategory; confidence: number; rationale: string } | null>;
  analyzeSponsorshipLanguage(input: {
    description: string;
  }): Promise<{
    category: SponsorshipCategory;
    confidence: SponsorshipConfidence;
    quotes: string[];
    rationale: string;
  } | null>;
  assessCareerValue(input: {
    title: string;
    company: string;
    description?: string;
    companyContext?: string;
  }): Promise<{
    careerValue: number;
    companyQuality: number;
    positives: string[];
    concerns: string[];
  } | null>;
}
