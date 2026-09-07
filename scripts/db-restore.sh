#!/bin/sh
set -eu

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  printf 'Usage: CONFIRM_RESTORE=yes npm run db:restore -- ./backups/file.sql.gz\n' >&2
  exit 2
fi

if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
  printf 'Restore is destructive. Set CONFIRM_RESTORE=yes to continue.\n' >&2
  exit 2
fi

if command -v docker >/dev/null 2>&1 && docker compose ps --status running postgres >/dev/null 2>&1; then
  gzip -dc "$file" | docker compose exec -T postgres psql -U "${POSTGRES_USER:-openscrape}" -d "${POSTGRES_DB:-openscrape}"
else
  : "${DATABASE_URL:?DATABASE_URL is required when the local postgres container is not running}"
  gzip -dc "$file" | psql "$DATABASE_URL"
fi

printf 'Database restore completed from: %s\n' "$file"
