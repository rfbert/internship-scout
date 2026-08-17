# Architecture

## What this is

Internship Scout is a single-user web application that discovers, evaluates, organizes,
and tracks U.S.-based Summer 2027 internships for an undergraduate CS student on an
F-1 visa, with a strong preference for AI Product Management and AI Engineering roles.

Quality over quantity: every automated stage is designed to *narrow* the funnel
(eligibility gates, sponsorship analysis, scoring) rather than accumulate listings.

## Stack and why

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | One codebase for UI + API routes; first-class Vercel deploy; typed end to end. |
| UI | React 19 + Tailwind CSS 4, hand-rolled components | Linear/Notion-adjacent minimal aesthetic without a heavy kit; full control over density and badges. |
| Database | PostgreSQL 16 | Relational integrity for a 30+ table schema; required by spec. Supabase-hosted in production, local Postgres (or Docker) in development. |
| ORM | Prisma 6 | Type-safe queries, migration files in git, one schema file that doubles as documentation. |
| Validation | Zod | All API inputs and agent-ingested payloads validated at the boundary. |
| Classification | Deterministic rules (`src/server/classify`) | Title and description matching. One implementation, shared by every entry point, so a listing cannot be categorised one way on import and another on rescore. |
| Tests | Vitest (unit + DB integration) + Playwright (e2e) | Critical workflows are integration-tested against a real Postgres test database. |

## Process architecture

One entry point: the web app (`next dev` / `next start`) — UI plus API routes under
`src/app/api`.

Intake runs through `ingestManualPosting` (`src/app/api/import/ingest.ts`), which is
the pipeline: normalize → dedupe → eligibility → sponsorship → classify → score →
review queue. Everything that enters the system goes through it, whether it arrives
from the URL form, a CSV upload, or the demo seed. That is deliberate — a second
ingest path is how scoring logic drifts apart.

The deployment that runs against a live search adds a scheduled collector in front of
this pipeline. That collector is not part of this repository; the pipeline it feeds is.

## Folder structure

```
internship-scout/
├── .github/workflows/ci.yml            # typecheck, build, unit + integration, contrast
├── docs/                               # this documentation set
├── prisma/
│   ├── schema.prisma                   # full schema (33 models)
│   ├── migrations/                     # SQL migration history
│   ├── seed.ts                         # user, prefs, sources, discard reasons
│   └── demo.ts                         # demo postings, scored by the real engines
├── scripts/                            # dev scripts (contrast check, page smoke, …)
├── src/
│   ├── agent/                          # posting normalisation (text → NormalizedPosting)
│   ├── app/                            # Next.js App Router
│   │   ├── (sections)/                 # dashboard, review, tracker, companies, …
│   │   └── api/                        # route handlers
│   ├── components/                     # shared UI primitives (Badge, DataTable, …)
│   ├── lib/                            # shared types, constants, utilities
│   └── server/
│       ├── classify/                   # deterministic role classification
│       ├── dedup/                      # canonicalization + duplicate grouping
│       ├── eligibility/                # season/level/US/paid gates (deterministic)
│       ├── scoring/                    # weighted explainable score
│       └── sponsorship/                # phrase rule engine + evidence
├── tests/
│   ├── unit/
│   ├── integration/                    # runs against internship_scout_test DB
│   └── e2e/                            # Playwright
├── .env.example
└── docker-compose.yml                  # Postgres for local dev on your machine
```

## External services and credentials

| Service | Needed for | Required? | Env vars |
|---|---|---|---|
| PostgreSQL 16 (any host — Docker locally) | persistent data | Yes | `DATABASE_URL` |
| Vercel (or any Node host) | optional web deploy | No | — |

`DATABASE_URL` is the only variable the app needs to run. There are no API keys in
this build — nothing here calls an external service.

Never commit secrets. `.env.example` documents every variable; real values live in `.env`
(gitignored) locally and in GitHub/Vercel secrets in the cloud.

## Idempotency

Intake may run any number of times without side effects:

- Listings are keyed by a deterministic `dedupe_key` + unique source URLs; re-ingesting
  an already-known listing updates `last_verified_at` instead of inserting.
- Evaluations (sponsorship assessments, scores) are versioned per listing per
  `analysis_version`; unchanged listings are not re-analyzed.
- Reports are keyed by `(report_date, kind)` with a unique constraint.
- Runs write an `agent_runs` row with per-stage `agent_run_events`; failures land
  in `collection_errors` and never abort a run mid-transaction.

The seed is idempotent for the same reason: re-running it will not duplicate the
demo dataset.

## Honesty model (what is real vs. mock)

- Demo listings carry `is_sample: true` and are visibly labelled SAMPLE in the UI. Every
  listing in this repository's seed is invented; the scores attached to them are not,
  having been computed by the engines at seed time.
- Assessments record the engine that produced them, so a rules verdict is never
  displayed as something more authoritative than it is.
- `data_sources` lists only intake paths this repository can actually service. A source
  row no code can service would be a claim the UI repeats on every page load.
- Sponsorship conclusions always display their confidence category and evidence text;
  inferences are never presented as confirmed fact.
