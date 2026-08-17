#!/usr/bin/env sh
#
# Build for a hosted deploy: migrate and seed before building, so pointing this
# repository at an empty database is enough to bring up a populated demo.
#
# The DATABASE_URL dance is not incidental. Managed Postgres providers hand out
# two connection strings — a pooled one (PgBouncer in transaction mode, which is
# what you want at runtime, because serverless functions open far more
# connections than the database will tolerate) and a direct one. Prisma Migrate
# takes a Postgres advisory lock, and an advisory lock cannot survive a
# transaction-mode pooler that hands your next statement to a different backend.
# Run migrations over the pooled URL and they fail, intermittently and
# confusingly.
#
# So: migrate and seed over the direct URL when the host provides one, fall back
# to DATABASE_URL when it does not (a plain Postgres, or local Docker, where the
# single URL is already direct). Runtime keeps using DATABASE_URL either way.
set -e

DIRECT_URL="${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}"

npx prisma generate
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
DATABASE_URL="$DIRECT_URL" npx prisma db seed
npx next build
