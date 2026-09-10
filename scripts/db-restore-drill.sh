#!/bin/sh
set -eu

file="${1:-}"
target="${RESTORE_DRILL_DATABASE_URL:-}"

if [ -z "$file" ] || [ ! -f "$file" ] || [ -z "$target" ]; then
  printf 'Usage: RESTORE_DRILL_DATABASE_URL=postgresql://... CONFIRM_RESTORE_DRILL=yes npm run db:restore:drill -- ./backups/file.sql.gz\n' >&2
  exit 2
fi

if [ "${CONFIRM_RESTORE_DRILL:-}" != "yes" ]; then
  printf 'Restore drill requires an isolated target database. Set CONFIRM_RESTORE_DRILL=yes to continue.\n' >&2
  exit 2
fi

run_psql() {
  if [ "${RESTORE_DRILL_DOCKER:-false}" = "true" ]; then
    docker compose exec -T postgres psql "$@"
  else
    psql "$@"
  fi
}

gzip -dc "$file" | run_psql "$target"
tables="$(run_psql "$target" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
if [ "${tables:-0}" -lt 1 ]; then
  printf 'Restore drill failed: no public tables found.\n' >&2
  exit 1
fi

printf 'Restore drill passed against isolated database (%s public tables): %s\n' "$tables" "$target"