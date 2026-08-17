# Testing

Three layers, all runnable locally and in CI.

## Unit (`npm test`)

Pure-function tests for every engine: eligibility gates, sponsorship phrase rules,
scoring math and bands, the role classifier, normalization helpers, and the view
models behind the denser pages. No network, no database.

## Integration (`npm run test:integration`)

Runs the intake pipeline and the API route handlers against `TEST_DATABASE_URL`.
Covers the workflows where a regression is expensive:

- ingest a listing end-to-end (gates → assessment → score → queue)
- duplicate detection: re-importing the same posting duplicates nothing
- decision actions, including the accept/restore round trip
- stage history appends dated rows and sets `appliedAt` exactly once
- manual entries are never auto-rejected, only flagged

Setup: `internship_scout_test` database must exist; migrations are applied
automatically by the test setup. **Never point TEST_DATABASE_URL at real data** —
tables are truncated.

API-route tests (decision actions, stage history append, deadline CRUD) live in
`tests/integration/api.test.ts` and call the route handlers directly.

## End-to-end (`npm run test:e2e`)

Playwright smoke: every section renders, and a seeded listing flows Review →
Accept → Tracker. Requires the dev server (auto-started by the config) and a
seeded database.

`node scripts/smoke-pages.mjs http://localhost:3000` is the cheaper version:
it fetches all 15 pages and asserts each one's expected heading text.

## CI

`.github/workflows/ci.yml` runs unit + integration on every push with a
Postgres 16 service container.
