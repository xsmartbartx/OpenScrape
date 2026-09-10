#!/bin/sh
set -eu

for name in DATABASE_URL REDIS_URL S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY BILLING_WEBHOOK_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET API_KEY_HASH; do
  file_name="${name}_FILE"
  file_path="$(printenv "$file_name" 2>/dev/null || true)"
  if [ -n "$file_path" ]; then
    if [ ! -r "$file_path" ]; then
      printf '%s is not readable: %s\n' "$file_name" "$file_path" >&2
      exit 1
    fi
    export "$name=$(cat "$file_path")"
    unset "$file_name"
  fi
done

exec "$@"