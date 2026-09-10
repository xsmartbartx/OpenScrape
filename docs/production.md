# Production Runbook

The production compose file is `docker-compose.production.yml`. It runs the
API, worker, web dashboard, PostgreSQL, Redis with authentication, and MinIO.
Place a production `.env` beside the compose file, set non-default credentials,
configure `APP_URL` and `NEXT_PUBLIC_API_URL`, and start it with:

```bash
docker compose -f docker-compose.production.yml up -d --build
```

The API applies committed Prisma migrations before starting. The compose file
binds web and API ports to loopback; put an HTTPS reverse proxy with a valid
certificate in front of them before exposing the host publicly. Hosted mode
forces `AUTH_REQUIRED=true` and `API_KEYS_REQUIRED=true`. A valid bearer session
is accepted by the API-key guard for dashboard traffic; automation clients use
workspace API keys.

Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and
`STRIPE_AUTOMATIC_TAX` when enabling paid plans. Configure Stripe to send
subscription and checkout events to `/api/v1/billing/stripe/webhook`.

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
database and Stripe secrets.