#!/bin/sh
set -eu

file="${1:-.env}"
if [ ! -r "$file" ]; then
  printf 'Production environment file is missing: %s\n' "$file" >&2
  exit 2
fi

set -a
. "$file"
set +a

required_names="POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB REDIS_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD PUBLIC_DOMAIN ACME_EMAIL APP_URL NEXT_PUBLIC_API_URL"
for name in $required_names; do
  value="$(printenv "$name" 2>/dev/null || true)"
  if [ -z "$value" ]; then
    printf 'Missing required production variable: %s\n' "$name" >&2
    exit 1
  fi
done

if [ "$POSTGRES_PASSWORD" = 'openscrape-dev' ] || [ "$MINIO_ROOT_PASSWORD" = 'openscrape-dev-secret' ]; then
  printf 'Development credentials are not allowed in production.\n' >&2
  exit 1
fi
if [ "${AUTH_REQUIRED:-false}" != 'true' ] || [ "${API_KEYS_REQUIRED:-false}" != 'true' ]; then
  printf 'AUTH_REQUIRED=true and API_KEYS_REQUIRED=true are required.\n' >&2
  exit 1
fi
case "$APP_URL" in https://*) ;; *) printf 'APP_URL must use https://.\n' >&2; exit 1 ;; esac
case "$NEXT_PUBLIC_API_URL" in https://*) ;; *) printf 'NEXT_PUBLIC_API_URL must use https://.\n' >&2; exit 1 ;; esac

if [ "${STRIPE_ENABLED:-false}" = 'true' ]; then
  for name in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID; do
    value="$(printenv "$name" 2>/dev/null || true)"
    if [ -z "$value" ]; then
      printf 'Stripe is enabled but %s is missing.\n' "$name" >&2
      exit 1
    fi
  done
  case "$STRIPE_SECRET_KEY" in sk_live_*) ;; *) printf 'Production Stripe must use an sk_live_ key.\n' >&2; exit 1 ;; esac
  case "$STRIPE_WEBHOOK_SECRET" in whsec_*) ;; *) printf 'Stripe webhook secret has an unexpected format.\n' >&2; exit 1 ;; esac
  case "$STRIPE_PRICE_ID" in price_*) ;; *) printf 'Stripe price ID has an unexpected format.\n' >&2; exit 1 ;; esac
fi

printf 'Production environment validation passed for %s.\n' "$file"