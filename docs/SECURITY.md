# Security & privacy

## Secrets
- All credentials live in environment variables; `.env` is gitignored, `.env.example`
  documents every variable with no real values.
- GitHub Actions reads secrets from repository Secrets (never `vars` for sensitive
  values); a host like Vercel from its project env settings.
- Never commit: database passwords, API keys, résumés, personal application data.
- This build calls no external services and needs no API keys. `DATABASE_URL` is
  the only variable required to run it.

## Application
- Every API input is Zod-validated (`parseBody` in `src/server/api-helpers.ts`),
  and mutation bodies must be `Content-Type: application/json` (blocks
  form-based CSRF smuggling).
- All DB access goes through Prisma (parameterized queries — no string SQL).
- **This build ships no authentication gate, deliberately.** It is a public demo
  over invented data, so a password prompt would only stop people from looking at
  it. The private deployment that holds real application data sits behind a
  site-wide HTTP Basic gate that fails closed when its password variable is
  missing. Do not deploy this repository over real data as-is: the schema is
  user-scoped, so adding real auth is a middleware change rather than a
  migration, but it is a change you have to make.
- Security headers (CSP, HSTS, nosniff, frame-ancestors, referrer and
  permissions policies) are set for every route in `next.config.ts`.
- No secrets or personal data are written to logs; run events store listing
  metadata only. Failure text is redacted before display — absolute paths in an
  ORM error would otherwise publish the server's filesystem layout onto a page
  (see `src/app/runs/meta.ts`).
- The seeded identity comes from `SEED_USER_*` env vars and defaults to neutral
  placeholders, so no personal data lives in this repository.

## Database
- Row-level security is enabled deny-by-default on all public tables
  (see `prisma/migrations/20260730204500_harden_rls_public_tables`), closing
  any Data-API/PostgREST path. Convention: every future `CREATE TABLE`
  migration must include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — new
  tables do not inherit it automatically.

## Data
- Deletion: soft-delete on user-facing entities; hard delete via Prisma Studio or
  SQL when needed. `npm run db:clear-samples` removes the demo records.
- Audit history: application stage changes, decision previous-states, listing
  snapshots, and run events are append-only records.
