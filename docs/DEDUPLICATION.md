# Deduplication strategy

Goal: one canonical `internship_listings` row per real-world internship, with every
sighting preserved in `internship_source_records`.

## Matching cascade (first hit wins)

1. **Exact URL match** — application URL or original posting URL already known
   (normalized: lowercase host, strip tracking params `utm_*`, `gh_src`, `lever-*`, etc.).
2. **ATS job ID match** — Greenhouse/Lever/Ashby/Workday IDs extracted from URLs
   (`gh_jid=…`, lever posting UUID, workday `_R\d+` requisition codes).
3. **Deterministic key** — `dedupe_key = normalize(company) + "|" + normalize(title) +
   "|" + season + "|" + normalize(primary_location)`. Normalization: lowercase,
   strip punctuation/legal suffixes (Inc, LLC), collapse whitespace, map known
   company aliases, strip boilerplate title suffixes ("- Summer 2027", "(Intern)").
4. **Fuzzy match** — same company + same season + title token-set Jaccard ≥ 0.8,
   OR same company/season + description trigram similarity ≥ 0.85 (computed in app
   code; no DB extension dependency). Fuzzy matches with similarity in [0.6, 0.8)
   are queued as "possible duplicate" for one-click human confirm in the Review Queue
   rather than silently merged.

## Merge behavior

- Canonical row keeps the best source per the canonical-source order
  (official page → ATS → university page → job board → GitHub repo → aggregator).
- Field-level merge prefers the canonical source but fills gaps from any source
  (e.g., GitHub list has the age/date, ATS has the full description).
- All source rows persist with their own URLs, first/last seen, and raw payload
  snapshot. Merging never deletes source information.
- `duplicate_group_id` links canonical + merged records; un-merge is possible.

## Idempotent re-ingestion

Re-seeing a known (source, external ID/URL) updates `last_seen_at` /
`last_verified_at` and diffs the description snapshot (change detection) —
it never creates a second listing or a second review-queue entry.
