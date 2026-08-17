# Opportunity scoring

Explainable 0–100 score. Weights are configurable in Settings
(`user_preferences.scoring_weights`, validated to sum to 100).

## Default weights

| Component | Weight | What it measures |
|---|---|---|
| Role alignment | 30 | Match against the ranked category list below — AI PM/PM roles dominate; generic SWE and quant score near the floor |
| F-1 & sponsorship potential | 25 | Company's FULL-TIME sponsorship record first (CPT covers the internship itself), then listing language + confidence |
| Company quality & future potential | 20 | Tier/priority score, stage, reputation, stability |
| Career value | 15 | Mentorship signals, conversion-to-FTE potential, resume value, program maturity |
| Undergraduate eligibility | 3 | Explicit UG welcome vs. ambiguous vs. grad-preferred |
| Compensation & benefits | 3 | Paid, rate vs. category norms |
| Location & work arrangement | 2 | Onsite > hybrid > remote per user preference |
| Posting freshness & urgency | 2 | Recency + deadline proximity |

A curated company knowledge base (see `prisma/seed.ts`, `KNOWN_SPONSORS`) seeds
priority tiers and public H-1B filing evidence for ~45 companies; the
Companies UI lets you add or adjust any company's tier and evidence.

## Role-alignment ranking (highest first)

1. AI Product Management
2. Product Management for AI products
3. Technical Product Management
4. AI Engineering
5. Applied AI
6. Machine Learning Engineering
7. Associate Product Management / rotational product programs
8. Product rotational programs
9. Other exceptional technical/product roles

A famous name never auto-outranks a smaller company: company quality is capped
at 20%, while career value (15%) explicitly rewards better mentorship, conversion
history, and role scope wherever they occur.

## Classification bands

| Band | Score | Extra conditions |
|---|---|---|
| Exceptional | ≥ 85 | no `EXPLICITLY_UNAVAILABLE`/`CITIZENSHIP_REQUIRED` |
| High priority | 75–84 | — |
| Strong opportunity | 65–74 | — |
| Worth reviewing | 55–64 | — |
| Reach opportunity | 45–54 | or missing-data-heavy but high ceiling |
| Low priority | < 45 | — |
| Ineligible | any | hard-reject sponsorship category or fails eligibility gates |

Missing preferred qualifications never zero out a component; unknowns score the
component's neutral midpoint and are listed under "Missing or uncertain information".

## Output per listing (`listing_scores` + `listing_score_explanations`)

overall + each component subscore (0–100 normalized), band, top positive factors,
main concerns, missing info, recommended action, weights snapshot used,
`analysis_version`, and model/prompt version when AI-assisted.
