# Production Runbook

The production compose file is `docker-compose.production.yml`. It runs the
API, worker, web dashboard, PostgreSQL, Redis with authentication, MinIO, and
Caddy. Place a production `.env` beside the compose file, set non-default
credentials, configure `PUBLIC_DOMAIN`, `ACME_EMAIL`, `APP_URL`, and
`NEXT_PUBLIC_API_URL`, then validate it before starting:

```bash
npm run validate:production -- .env
docker compose -f docker-compose.production.yml up -d --build
```

The API applies committed Prisma migrations before starting. The compose file
binds web and API ports to loopback. Caddy owns ports 80 and 443, obtains and
renews certificates through ACME, redirects HTTP to HTTPS, and proxies both
the dashboard and `/api/*`. Point DNS for `PUBLIC_DOMAIN` to the host before
starting Caddy. Hosted mode forces `AUTH_REQUIRED=true` and
`API_KEYS_REQUIRED=true`. A valid bearer session is accepted by the API-key
guard for dashboard traffic; automation clients use workspace API keys.

For a secret manager or Docker/Kubernetes secret mount, set variables such as
`DATABASE_URL_FILE`, `REDIS_URL_FILE`, `STRIPE_SECRET_KEY_FILE`,
`STRIPE_WEBHOOK_SECRET_FILE`, and `API_KEY_HASH_FILE` to mounted readable files.
The API and worker entrypoint loads these values without putting them in the
image or command line. Do not commit `.env` or mounted secret files.

Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and
`STRIPE_AUTOMATIC_TAX` when enabling paid plans. Configure Stripe to send
subscription and checkout events to `/api/v1/billing/stripe/webhook`.
Set `STRIPE_ENABLED=true` to make the production preflight require live Stripe
credentials, a live price, and a webhook secret. Configure Stripe Automatic
Tax and merchant tax registrations in the Stripe Dashboard before enabling it.

Create a compressed PostgreSQL backup outside the application host:

```bash
npm run db:backup
```

Run a restore drill against a disposable, isolated database. The command never
uses `DATABASE_URL` implicitly and requires an explicit confirmation:

```bash
RESTORE_DRILL_DATABASE_URL=postgresql://... \
CONFIRM_RESTORE_DRILL=yes \
npm run db:restore:drill -- ./backups/openscrape-YYYYMMDDTHHMMSSZ.sql.gz
```

After a real restore, verify `/api/v1/health/ready`, authenticate, list robots,
and enqueue a test run. Keep backup files encrypted and restrict access to the
database and Stripe secrets. GitHub Actions runs the same drill weekly from
the `PRODUCTION_DATABASE_URL` repository secret; configure that secret before
enabling the scheduled workflow in `.github/workflows/restore-drill.yml`.