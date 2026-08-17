# Entity-relationship overview

Authoritative schema: `prisma/schema.prisma` (33 models). Grouped views below.

```mermaid
erDiagram
  users ||--o| user_preferences : has
  users ||--o{ user_listing_decisions : makes
  users ||--o{ applications : owns
  users ||--o{ notes : writes
  users ||--o{ notifications : receives

  companies ||--o{ company_locations : has
  companies ||--o{ company_sponsorship_evidence : has
  companies ||--o{ internship_listings : posts
  companies ||--o{ contacts : employs

  internship_listings ||--o{ internship_sources : "seen at"
  internship_sources }o--|| data_sources : "via connector"
  internship_sources ||--o{ internship_source_records : "raw fetches"
  internship_listings ||--o{ listing_snapshots : "description history"
  internship_listings ||--o{ listing_requirements : has
  internship_listings ||--o{ listing_locations : has
  internship_listings ||--o{ listing_compensation : has
  internship_listings ||--o{ listing_sponsorship_assessments : "assessed by"
  internship_listings ||--o{ listing_scores : "scored by"
  listing_scores ||--o{ listing_score_explanations : explains
  internship_listings ||--o{ internship_listings : "duplicate group"

  user_listing_decisions }o--|| internship_listings : about
  user_listing_decisions }o--o| discard_reasons : cites

  applications }o--|| internship_listings : for
  applications ||--o{ application_status_history : "stage history"
  applications ||--o{ application_contacts : involves
  application_contacts }o--|| contacts : links
  contacts ||--o{ referrals : gives
  referrals }o--o| applications : supports

  internship_listings ||--o{ deadlines : has
  applications ||--o{ deadlines : has
  deadlines ||--o{ reminders : schedules

  tags ||--o{ listing_tags : on
  tags ||--o{ application_tags : on

  agent_runs ||--o{ agent_run_events : logs
  agent_runs ||--o{ collection_errors : records
  data_sources ||--o{ collection_errors : attributed
```

Key integrity rules

- `internship_listings.dedupe_key` unique for canonical rows; merged duplicates
  carry NULL key + `canonical_id`/`duplicate_group_id`.
- `internship_sources` unique `(data_source_id, url)` — one sighting row per URL
  per connector; re-fetches append `internship_source_records`.
- `user_listing_decisions` unique `(user_id, listing_id)`; state transitions keep
  `previous_state` + timestamps.
- `applications` unique `(user_id, listing_id)`; stage changes append
  `application_status_history` (history is never overwritten).
- `listing_sponsorship_assessments` / `listing_scores` unique
  `(listing_id, analysis_version)` — re-runs don't duplicate analyses.
- `email_reports` unique `(report_date, kind)` — hard idempotency for the daily email.
- Soft deletion: `deleted_at` on companies, listings, applications, contacts.
