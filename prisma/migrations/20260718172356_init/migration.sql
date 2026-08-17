-- CreateEnum
CREATE TYPE "RoleCategory" AS ENUM ('AI_PRODUCT_MANAGEMENT', 'PM_FOR_AI_PRODUCTS', 'TECHNICAL_PM', 'AI_ENGINEERING', 'APPLIED_AI', 'ML_ENGINEERING', 'APM_PROGRAM', 'PRODUCT_ROTATIONAL', 'OTHER_EXCEPTIONAL', 'DATA_SCIENCE', 'RESEARCH', 'SOFTWARE_ENGINEERING', 'OTHER');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'CLOSED', 'REMOVED', 'EXPIRED', 'DRAFT');

-- CreateEnum
CREATE TYPE "WorkArrangement" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('HOURLY', 'MONTHLY', 'STIPEND', 'UNPAID', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "UgEligibility" AS ENUM ('UNDERGRAD_EXPLICIT', 'UNDERGRAD_LIKELY', 'AMBIGUOUS', 'GRAD_PREFERRED', 'GRAD_ONLY', 'PHD_ONLY');

-- CreateEnum
CREATE TYPE "SponsorshipCategory" AS ENUM ('SPONSORSHIP_OFFERED', 'CPT_OPT_ACCEPTED', 'FUTURE_POSSIBLE', 'COMPANY_HISTORY', 'UNCERTAIN', 'NO_INFO', 'EXPLICITLY_UNAVAILABLE', 'UNRESTRICTED_AUTH_REQUIRED', 'CITIZENSHIP_REQUIRED', 'CLEARANCE_REQUIRED', 'USER_INELIGIBLE');

-- CreateEnum
CREATE TYPE "SponsorshipConfidence" AS ENUM ('CONFIRMED', 'HIGH', 'MODERATE', 'LOW', 'UNKNOWN', 'EXPLICITLY_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ScoreBand" AS ENUM ('EXCEPTIONAL', 'HIGH_PRIORITY', 'STRONG', 'WORTH_REVIEWING', 'REACH', 'LOW_PRIORITY', 'INELIGIBLE');

-- CreateEnum
CREATE TYPE "DecisionState" AS ENUM ('PENDING_REVIEW', 'ACCEPTED', 'SAVED_FOR_LATER', 'DISCARDED', 'MARKED_INELIGIBLE', 'MARKED_DUPLICATE', 'ALREADY_APPLIED');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('INTERESTED', 'PREPARING', 'READY_TO_APPLY', 'APPLIED', 'ONLINE_ASSESSMENT', 'RECRUITER_SCREEN', 'FIRST_INTERVIEW', 'TECHNICAL_INTERVIEW', 'PRODUCT_CASE_INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('URGENT', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('GITHUB_REPO', 'GREENHOUSE', 'LEVER', 'ASHBY', 'SMARTRECRUITERS', 'WORKDAY', 'COMPANY_PAGE', 'URL_IMPORT', 'CSV_IMPORT', 'MANUAL');

-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('REQUIRED_QUALIFICATION', 'PREFERRED_QUALIFICATION', 'DEGREE_REQUIREMENT', 'ELIGIBLE_MAJORS', 'GRADUATION_WINDOW', 'TECH_SKILL_REQUIRED', 'TECH_SKILL_PREFERRED', 'PRODUCT_SKILL');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('H1B_FILINGS', 'EMPLOYER_STATEMENT', 'UNIVERSITY_DOC', 'PRIOR_POSTING', 'COMPANY_POLICY', 'VERIFIED_REPORT');

-- CreateEnum
CREATE TYPE "EvidenceReliability" AS ENUM ('STRONG', 'MODERATE', 'WEAK');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "EventLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "DeadlineKind" AS ENUM ('APPLICATION_DEADLINE', 'SUGGESTED_APPLY_BY', 'FOLLOW_UP', 'ASSESSMENT_DEADLINE', 'INTERVIEW', 'REFERRAL_REMINDER', 'OFFER_DEADLINE');

-- CreateEnum
CREATE TYPE "ReferralStage" AS ENUM ('POTENTIAL_CONTACT', 'CONTACTED', 'RESPONDED', 'INFORMATIONAL_CONVERSATION', 'REFERRAL_REQUESTED', 'REFERRAL_RECEIVED', 'DECLINED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "EmailSendMode" AS ENUM ('RESEND', 'SMTP', 'DRY_RUN');

-- CreateEnum
CREATE TYPE "NoteEntity" AS ENUM ('LISTING', 'APPLICATION', 'COMPANY', 'CONTACT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scoring_weights" JSONB NOT NULL,
    "review_threshold_band" "ScoreBand" NOT NULL DEFAULT 'WORTH_REVIEWING',
    "email_on_empty_runs" BOOLEAN NOT NULL DEFAULT false,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_to" TEXT,
    "preferred_arrangement" "WorkArrangement" NOT NULL DEFAULT 'ONSITE',
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "graduation_date" TIMESTAMP(3),
    "analysis_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "size_range" TEXT,
    "stage" TEXT,
    "reputation_note" TEXT,
    "ai_relevance" TEXT,
    "hq_city" TEXT,
    "hq_state" TEXT,
    "hq_country" TEXT,
    "priority_score" INTEGER,
    "internship_program_note" TEXT,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_locations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "is_hq" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_sponsorship_evidence" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "reliability" "EvidenceReliability" NOT NULL DEFAULT 'MODERATE',
    "source_name" TEXT NOT NULL,
    "source_url" TEXT,
    "evidence_date" TIMESTAMP(3),
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_sponsorship_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internship_listings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalized_title" TEXT NOT NULL,
    "role_category" "RoleCategory" NOT NULL DEFAULT 'OTHER',
    "season" TEXT NOT NULL DEFAULT 'SUMMER_2027',
    "season_evidence" TEXT,
    "description" TEXT,
    "description_hash" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "work_arrangement" "WorkArrangement" NOT NULL DEFAULT 'UNKNOWN',
    "ug_eligibility" "UgEligibility" NOT NULL DEFAULT 'AMBIGUOUS',
    "posted_at" TIMESTAMP(3),
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "application_deadline" TIMESTAMP(3),
    "deadline_is_estimated" BOOLEAN NOT NULL DEFAULT false,
    "duration_text" TEXT,
    "posting_url" TEXT,
    "apply_url" TEXT,
    "work_auth_language" TEXT,
    "sponsorship_language" TEXT,
    "current_sponsorship_category" "SponsorshipCategory",
    "current_sponsorship_confidence" "SponsorshipConfidence",
    "current_score" INTEGER,
    "current_band" "ScoreBand",
    "ai_relevance" INTEGER,
    "pm_relevance" INTEGER,
    "dedupe_key" TEXT,
    "duplicate_group_id" TEXT,
    "canonical_id" TEXT,
    "is_sample" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internship_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internship_sources" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "data_source_id" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "external_id" TEXT,
    "url" TEXT NOT NULL,
    "is_canonical" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internship_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internship_source_records" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_hash" TEXT,
    "raw_payload" JSONB,

    CONSTRAINT "internship_source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_snapshots" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_hash" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "change_note" TEXT,

    CONSTRAINT "listing_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_requirements" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "kind" "RequirementKind" NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_locations" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_remote" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_compensation" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "pay_type" "PayType" NOT NULL DEFAULT 'UNKNOWN',
    "min_amount" DECIMAL(12,2),
    "max_amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "period" TEXT,
    "raw_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_compensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_sponsorship_assessments" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "category" "SponsorshipCategory" NOT NULL,
    "confidence" "SponsorshipConfidence" NOT NULL,
    "cpt_compatible" BOOLEAN,
    "opt_compatible" BOOLEAN,
    "stem_opt_relevant" BOOLEAN,
    "future_sponsorship_potential" TEXT,
    "matched_text" JSONB,
    "conflicting_info" TEXT,
    "evidence_source" TEXT,
    "evidence_date" TIMESTAMP(3),
    "explanation" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "model" TEXT,
    "prompt_version" TEXT,
    "analysis_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_sponsorship_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_scores" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "band" "ScoreBand" NOT NULL,
    "career_value" INTEGER NOT NULL,
    "sponsorship" INTEGER NOT NULL,
    "role_alignment" INTEGER NOT NULL,
    "company_quality" INTEGER NOT NULL,
    "ug_eligibility" INTEGER NOT NULL,
    "compensation" INTEGER NOT NULL,
    "location_fit" INTEGER NOT NULL,
    "freshness" INTEGER NOT NULL,
    "weights_snapshot" JSONB NOT NULL,
    "recommended_action" TEXT,
    "engine" TEXT NOT NULL,
    "model" TEXT,
    "prompt_version" TEXT,
    "analysis_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_score_explanations" (
    "id" TEXT NOT NULL,
    "score_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "listing_score_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discard_reasons" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "discard_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_listing_decisions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "state" "DecisionState" NOT NULL DEFAULT 'PENDING_REVIEW',
    "previous_state" "DecisionState",
    "discard_reason_id" TEXT,
    "note" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "restored_at" TIMESTAMP(3),
    "decision_content_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_listing_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'INTERESTED',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "next_action" TEXT,
    "follow_up_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recruiter_name" TEXT,
    "hiring_manager_name" TEXT,
    "contact_email" TEXT,
    "contact_linkedin" TEXT,
    "referral_status" TEXT,
    "final_outcome" TEXT,
    "rejection_reason" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "from_stage" "ApplicationStage",
    "to_stage" "ApplicationStage" NOT NULL,
    "note" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "company_id" TEXT,
    "relationship" TEXT,
    "email" TEXT,
    "linkedin_url" TEXT,
    "last_contacted_at" TIMESTAMP(3),
    "next_follow_up_at" TIMESTAMP(3),
    "notes_text" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "application_id" TEXT,
    "listing_id" TEXT,
    "stage" "ReferralStage" NOT NULL DEFAULT 'POTENTIAL_CONTACT',
    "requested_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "notes_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_contacts" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "entity" "NoteEntity" NOT NULL,
    "listing_id" TEXT,
    "application_id" TEXT,
    "company_id" TEXT,
    "contact_id" TEXT,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadlines" (
    "id" TEXT NOT NULL,
    "kind" "DeadlineKind" NOT NULL,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "is_estimated" BOOLEAN NOT NULL DEFAULT false,
    "listing_id" TEXT,
    "application_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "deadline_id" TEXT NOT NULL,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "channel" TEXT NOT NULL DEFAULT 'email',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'gray',

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_tags" (
    "listing_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "listing_tags_pkey" PRIMARY KEY ("listing_id","tag_id")
);

-- CreateTable
CREATE TABLE "application_tags" (
    "application_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "application_tags_pkey" PRIMARY KEY ("application_id","tag_id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "automated" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "rate_limit_ms" INTEGER NOT NULL DEFAULT 1500,
    "config" JSONB,
    "last_success_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "run_date" DATE NOT NULL,
    "trigger" "RunTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "stats" JSONB,
    "version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_events" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "level" "EventLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_errors" (
    "id" TEXT NOT NULL,
    "run_id" TEXT,
    "data_source_id" TEXT,
    "url" TEXT,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_reports" (
    "id" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'daily',
    "subject" TEXT NOT NULL,
    "html_body" TEXT NOT NULL,
    "text_body" TEXT NOT NULL,
    "send_mode" "EmailSendMode" NOT NULL,
    "sent_at" TIMESTAMP(3),
    "skipped_reason" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_normalized_name_key" ON "companies"("normalized_name");

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE INDEX "company_locations_company_id_idx" ON "company_locations"("company_id");

-- CreateIndex
CREATE INDEX "company_sponsorship_evidence_company_id_idx" ON "company_sponsorship_evidence"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "internship_listings_dedupe_key_key" ON "internship_listings"("dedupe_key");

-- CreateIndex
CREATE INDEX "internship_listings_company_id_idx" ON "internship_listings"("company_id");

-- CreateIndex
CREATE INDEX "internship_listings_status_idx" ON "internship_listings"("status");

-- CreateIndex
CREATE INDEX "internship_listings_role_category_idx" ON "internship_listings"("role_category");

-- CreateIndex
CREATE INDEX "internship_listings_current_band_idx" ON "internship_listings"("current_band");

-- CreateIndex
CREATE INDEX "internship_listings_current_sponsorship_category_idx" ON "internship_listings"("current_sponsorship_category");

-- CreateIndex
CREATE INDEX "internship_listings_discovered_at_idx" ON "internship_listings"("discovered_at");

-- CreateIndex
CREATE INDEX "internship_listings_application_deadline_idx" ON "internship_listings"("application_deadline");

-- CreateIndex
CREATE INDEX "internship_listings_duplicate_group_id_idx" ON "internship_listings"("duplicate_group_id");

-- CreateIndex
CREATE INDEX "internship_sources_listing_id_idx" ON "internship_sources"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "internship_sources_data_source_id_url_key" ON "internship_sources"("data_source_id", "url");

-- CreateIndex
CREATE INDEX "internship_source_records_source_id_idx" ON "internship_source_records"("source_id");

-- CreateIndex
CREATE INDEX "listing_snapshots_listing_id_idx" ON "listing_snapshots"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_snapshots_listing_id_content_hash_key" ON "listing_snapshots"("listing_id", "content_hash");

-- CreateIndex
CREATE INDEX "listing_requirements_listing_id_idx" ON "listing_requirements"("listing_id");

-- CreateIndex
CREATE INDEX "listing_locations_listing_id_idx" ON "listing_locations"("listing_id");

-- CreateIndex
CREATE INDEX "listing_compensation_listing_id_idx" ON "listing_compensation"("listing_id");

-- CreateIndex
CREATE INDEX "listing_sponsorship_assessments_listing_id_idx" ON "listing_sponsorship_assessments"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_sponsorship_assessments_listing_id_analysis_version_key" ON "listing_sponsorship_assessments"("listing_id", "analysis_version");

-- CreateIndex
CREATE INDEX "listing_scores_listing_id_idx" ON "listing_scores"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_scores_listing_id_analysis_version_key" ON "listing_scores"("listing_id", "analysis_version");

-- CreateIndex
CREATE INDEX "listing_score_explanations_score_id_idx" ON "listing_score_explanations"("score_id");

-- CreateIndex
CREATE UNIQUE INDEX "discard_reasons_key_key" ON "discard_reasons"("key");

-- CreateIndex
CREATE INDEX "user_listing_decisions_state_idx" ON "user_listing_decisions"("state");

-- CreateIndex
CREATE UNIQUE INDEX "user_listing_decisions_user_id_listing_id_key" ON "user_listing_decisions"("user_id", "listing_id");

-- CreateIndex
CREATE INDEX "applications_stage_idx" ON "applications"("stage");

-- CreateIndex
CREATE INDEX "applications_follow_up_at_idx" ON "applications"("follow_up_at");

-- CreateIndex
CREATE UNIQUE INDEX "applications_user_id_listing_id_key" ON "applications"("user_id", "listing_id");

-- CreateIndex
CREATE INDEX "application_status_history_application_id_idx" ON "application_status_history"("application_id");

-- CreateIndex
CREATE INDEX "contacts_company_id_idx" ON "contacts"("company_id");

-- CreateIndex
CREATE INDEX "referrals_contact_id_idx" ON "referrals"("contact_id");

-- CreateIndex
CREATE INDEX "referrals_application_id_idx" ON "referrals"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_contacts_application_id_contact_id_key" ON "application_contacts"("application_id", "contact_id");

-- CreateIndex
CREATE INDEX "notes_listing_id_idx" ON "notes"("listing_id");

-- CreateIndex
CREATE INDEX "notes_application_id_idx" ON "notes"("application_id");

-- CreateIndex
CREATE INDEX "notes_company_id_idx" ON "notes"("company_id");

-- CreateIndex
CREATE INDEX "deadlines_due_at_idx" ON "deadlines"("due_at");

-- CreateIndex
CREATE INDEX "deadlines_listing_id_idx" ON "deadlines"("listing_id");

-- CreateIndex
CREATE INDEX "deadlines_application_id_idx" ON "deadlines"("application_id");

-- CreateIndex
CREATE INDEX "reminders_remind_at_idx" ON "reminders"("remind_at");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_key_key" ON "data_sources"("key");

-- CreateIndex
CREATE INDEX "agent_runs_run_date_idx" ON "agent_runs"("run_date");

-- CreateIndex
CREATE INDEX "agent_run_events_run_id_idx" ON "agent_run_events"("run_id");

-- CreateIndex
CREATE INDEX "collection_errors_data_source_id_idx" ON "collection_errors"("data_source_id");

-- CreateIndex
CREATE INDEX "collection_errors_run_id_idx" ON "collection_errors"("run_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_reports_report_date_kind_key" ON "email_reports"("report_date", "kind");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_sponsorship_evidence" ADD CONSTRAINT "company_sponsorship_evidence_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internship_listings" ADD CONSTRAINT "internship_listings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internship_listings" ADD CONSTRAINT "internship_listings_canonical_id_fkey" FOREIGN KEY ("canonical_id") REFERENCES "internship_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internship_sources" ADD CONSTRAINT "internship_sources_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internship_sources" ADD CONSTRAINT "internship_sources_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internship_source_records" ADD CONSTRAINT "internship_source_records_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "internship_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_snapshots" ADD CONSTRAINT "listing_snapshots_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_requirements" ADD CONSTRAINT "listing_requirements_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_locations" ADD CONSTRAINT "listing_locations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_compensation" ADD CONSTRAINT "listing_compensation_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_sponsorship_assessments" ADD CONSTRAINT "listing_sponsorship_assessments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_scores" ADD CONSTRAINT "listing_scores_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_score_explanations" ADD CONSTRAINT "listing_score_explanations_score_id_fkey" FOREIGN KEY ("score_id") REFERENCES "listing_scores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_listing_decisions" ADD CONSTRAINT "user_listing_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_listing_decisions" ADD CONSTRAINT "user_listing_decisions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_listing_decisions" ADD CONSTRAINT "user_listing_decisions_discard_reason_id_fkey" FOREIGN KEY ("discard_reason_id") REFERENCES "discard_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_contacts" ADD CONSTRAINT "application_contacts_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_contacts" ADD CONSTRAINT "application_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_deadline_id_fkey" FOREIGN KEY ("deadline_id") REFERENCES "deadlines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_tags" ADD CONSTRAINT "listing_tags_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "internship_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_tags" ADD CONSTRAINT "listing_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_tags" ADD CONSTRAINT "application_tags_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_tags" ADD CONSTRAINT "application_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_errors" ADD CONSTRAINT "collection_errors_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_errors" ADD CONSTRAINT "collection_errors_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
