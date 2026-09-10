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

gzip -dc "$file" | psql "$target"
tables="$(psql "$target" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
if [ "${tables:-0}" -lt 1 ]; then
  printf 'Restore drill failed: no public tables found.\n' >&2
  exit 1
fi

printf 'Restore drill passed against isolated database (%s public tables): %s\n' "$tables" "$target"