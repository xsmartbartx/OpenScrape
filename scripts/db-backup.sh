#!/bin/sh
set -eu

backup_dir="${BACKUP_DIR:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/openscrape-$timestamp.sql.gz"
mkdir -p "$backup_dir"

if command -v docker >/dev/null 2>&1 && docker compose ps --status running postgres >/dev/null 2>&1; then
  docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-openscrape}" -d "${POSTGRES_DB:-openscrape}" | gzip > "$file"
else
  : "${DATABASE_URL:?DATABASE_URL is required when the local postgres container is not running}"
  pg_dump "$DATABASE_URL" | gzip > "$file"
fi

printf 'Database backup created: %s\n' "$file"
