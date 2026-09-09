# OpenScrape — Open Source No-Code Web Data Platform

> A self-hostable platform to turn websites into structured data — no scripts required. Record robots, extract fields, crawl sites, run AI extraction, schedule jobs, and serve results via API.

---

## Table of Contents

1. [Vision & Scope](#1-vision--scope)
2. [Core Features](#2-core-features)
3. [System Architecture](#3-system-architecture)
4. [Component Deep Dive](#4-component-deep-dive)
5. [Data Model](#5-data-model)
6. [The Robot Recorder (No-Code Engine)](#6-the-robot-recorder-no-code-engine)
7. [AI Extraction Mode](#7-ai-extraction-mode)
8. [Scraping Modes: Markdown / HTML / Crawl / Search](#8-scraping-modes-markdown--html--crawl--search)
9. [Authenticated / Login-Protected Scraping](#9-authenticated--login-protected-scraping)
10. [Scheduling & Job Queue](#10-scheduling--job-queue)
11. [Public API](#11-public-api)
12. [SDK & CLI](#12-sdk--cli)
13. [Integrations (Sheets, Airtable, Webhooks)](#13-integrations-sheets-airtable-webhooks)
14. [Tech Stack](#14-tech-stack)
15. [Self-Hosting & Deployment](#15-self-hosting--deployment)
16. [Security & Anti-Blocking](#16-security--anti-blocking)
17. [Development Plan / Roadmap](#17-development-plan--roadmap)
18. [Repository Layout](#18-repository-layout)
19. [License & Contribution](#19-license--contribution)

---

## 1. Vision & Scope

**Goal:** Give non-technical users a friendly web dashboard to extract structured data from any website by *pointing and clicking*, while giving developers an API, SDK, and CLI to automate everything.

**Design principles**

- **No-code first** — the primary user never writes a selector or script.
- **Developer-friendly underneath** — everything the UI does maps to a documented API.
- **Self-hostable** — one `docker compose up` should work.
- **Deterministic + AI** — precise recorded selectors *and* fuzzy AI-driven extraction.
- **Respectful scraping** — robots.txt awareness, rate limits, proxy support.

**Non-goals (v1)**

- Bypassing CAPTCHAs at scale / illegal scraping.
- Massive distributed clusters (single-node + horizontal workers is enough for v1).

---

## 2. Core Features

| Feature | Description | User Type |
|--------|-------------|-----------|
| **Robots** | Record browser actions, replay later | No-code |
| **Field Extraction** | Point-and-click to capture text, links, images, tables | No-code |
| **Pagination & Scroll** | Auto-detect "next" buttons, infinite scroll | No-code |
| **AI Extraction** | Describe data in plain English → structured JSON | No-code |
| **Scrape** | One URL → Markdown or HTML | Both |
| **Crawl** | Follow links across a domain with rules | Both |
| **Search** | Query a search engine, return structured SERP | Both |
| **Scheduling** | Cron-based reruns | Both |
| **API** | REST endpoints for all operations | Developer |
| **SDK / CLI** | TypeScript + Python SDK, CLI tool | Developer |
| **Exports** | Google Sheets, Airtable, CSV, JSON, Webhooks | Both |
| **Auth Scraping** | Login-protected sites via saved sessions | Both |

---

## 3. System Architecture

```
                         ┌────────────────────────────────────────┐
                         │              Web Dashboard               │
                         │   (Next.js / React)  — No-code UI        │
                         │   Recorder overlay, Table view, AI chat  │
                         └───────────────┬──────────────────────────┘
                                         │ HTTPS / REST + WS
                                         ▼
┌──────────────┐    ┌─────────────────────────────────────────────┐
│   CLI / SDK  │───▶│              Backend API Server               │
│  (TS / Py)   │    │        (Node.js / NestJS or Fastify)          │
└──────────────┘    │  Auth · Robots CRUD · Run orchestration ·     │
                    │  API keys · Integrations · Results store      │
                    └──────┬───────────────────────┬────────────────┘
                           │                        │
                    enqueue│jobs             read/write
                           ▼                        ▼
                 ┌──────────────────┐     ┌───────────────────────┐
                 │   Job Queue      │     │   PostgreSQL           │
                 │   (BullMQ/Redis) │     │   robots, runs, users, │
                 └────────┬─────────┘     │   results, schedules   │
                          │               └───────────────────────┘
                          ▼                        ▲
              ┌──────────────────────────┐         │ store artifacts
              │     Worker Pool          │         │
              │   (Node workers)         │─────────┘
              │  ┌────────────────────┐  │
              │  │ Browser Automation │  │  ┌────────────────┐
              │  │  Playwright        │──┼─▶│ Object Storage │
              │  │  (chromium pool)   │  │  │ (S3 / MinIO)   │
              │  └────────────────────┘  │  │ screenshots,   │
              │  ┌────────────────────┐  │  │ HTML snapshots │
              │  │ AI Extractor       │  │  └────────────────┘
              │  │  (LLM adapter)     │  │
              │  └────────────────────┘  │  ┌────────────────┐
              │  ┌────────────────────┐  │  │  LLM Provider  │
              │  │ Markdown Converter │  │  │  OpenAI/Ollama │
              │  └────────────────────┘  │  └────────────────┘
              └──────────────────────────┘
```

**Flow summary**

1. User builds/edits a **Robot** in the dashboard (or via API/CLI).
2. Running a robot enqueues a **Job** into Redis (BullMQ).
3. A **Worker** picks it up, spins a Playwright browser, replays actions, extracts data.
4. Results are stored in Postgres + artifacts (screenshots/HTML) in S3/MinIO.
5. Results are served through the **API**, viewable in the dashboard, and pushed to integrations.
6. **Scheduler** re-enqueues jobs on cron.

---

## 4. Component Deep Dive

### 4.1 Web Dashboard
- **Stack:** Next.js (App Router) + React + Tailwind + shadcn/ui + Zustand/TanStack Query.
- **Key screens:**
  - Robot list & templates
  - **Recorder** — embedded browser stream (via CDP screencast or an iframe proxy) with a click-to-select overlay
  - Field mapping table
  - AI Extraction chat panel
  - Run history + live logs (WebSocket)
  - Results data grid (sortable, exportable)
  - Schedules, Integrations, API keys, Settings

### 4.2 Backend API Server
- **Stack:** NestJS (structured, DI, guards) *or* Fastify (lighter). Recommend **NestJS**.
- Responsibilities: auth, RBAC, robot CRUD, run orchestration, API-key issuance, integration OAuth, results pagination, WebSocket gateway for live logs.

### 4.3 Worker Pool
- Separate process(es), scale horizontally.
- Consumes BullMQ queues: `scrape`, `crawl`, `robot-run`, `ai-extract`, `search`.
- Maintains a **browser context pool** (reuse contexts, isolate cookies per job).

### 4.4 Browser Automation
- **Playwright** (Chromium primary; Firefox/WebKit optional).
- Uses **CDP screencast** to stream frames to the recorder UI.
- Injects a **selector-generation script** into the page for point-and-click capture.

### 4.5 AI Extractor
- Pluggable LLM adapter (OpenAI, Anthropic, or local **Ollama**).
- Converts cleaned DOM/Markdown → structured JSON matching a user schema.

---

## 5. Data Model

```sql
-- Users & orgs
users(id, email, password_hash, name, created_at)
organizations(id, name, owner_id)
memberships(user_id, org_id, role)   -- owner|admin|member|viewer

-- API access
api_keys(id, org_id, name, key_hash, scopes[], last_used_at, revoked)

-- Robots (the core no-code object)
robots(
  id, org_id, name, description,
  type,             -- 'recorded' | 'ai' | 'scrape' | 'crawl' | 'search'
  start_url,
  config JSONB,     -- see below
  schema JSONB,     -- output field definitions
  created_by, created_at, updated_at
)

-- Recorded workflow steps
robot_steps(
  id, robot_id, order_index,
  action,           -- goto|click|type|scroll|paginate|extract|wait|login
  selector JSONB,   -- {css, xpath, text, role, attributes}
  value TEXT,
  options JSONB
)

-- Runs (executions)
runs(
  id, robot_id, org_id,
  status,           -- queued|running|success|failed|cancelled
  trigger,          -- manual|schedule|api
  started_at, finished_at,
  stats JSONB,      -- pages, items, errors, duration
  error TEXT
)

-- Extracted rows
results(
  id, run_id, robot_id,
  data JSONB,       -- one extracted record
  source_url, page_index, created_at
)

-- Artifacts
artifacts(id, run_id, type, storage_key, url)  -- screenshot|html|har

-- Scheduling
schedules(id, robot_id, cron, timezone, enabled, next_run_at)

-- Auth sessions for login-protected sites
credentials(
  id, org_id, name, domain,
  storage_state_encrypted BYTEA,  -- Playwright storageState (cookies+localStorage)
  created_at, expires_at
)

-- Integrations
integrations(id, org_id, provider, config_encrypted, created_at)
  -- provider: google_sheets | airtable | webhook | s3
```

### Robot `config` JSONB example
```json
{
  "pagination": { "type": "click", "selector": ".next", "maxPages": 20 },
  "scroll": { "type": "infinite", "maxScrolls": 15, "waitMs": 1200 },
  "proxy": { "enabled": true, "poolId": "residential-1" },
  "rateLimit": { "requestsPerMinute": 30 },
  "respectRobotsTxt": true,
  "credentialId": "cred_abc",
  "aiPrompt": "Extract product name, price, rating, and URL"
}
```

---

## 6. The Robot Recorder (No-Code Engine)

This is the heart of the product. It must feel like *recording a macro on a real browser*.

### 6.1 How recording works

```
User clicks "Record"  ──▶  Worker launches Playwright + CDP screencast
        │
        ▼
Dashboard shows live video frames of the page (WebSocket)
        │
User clicks an element on the streamed frame
        │
        ▼
Coordinates sent → Worker maps to DOM element via elementFromPoint
        │
        ▼
Selector Generator produces a robust selector set:
   { css, xpath, textFallback, role, nthOfType }
        │
        ▼
Step saved to robot_steps (highlighted in UI action list)
```

### 6.2 Robust selector strategy
Generate **multiple** selectors ranked by stability so replay survives minor DOM changes:

1. Stable attributes: `data-testid`, `id`, accessible role and name.
2. Semantic attributes: `name`, `aria-label`, `href`, `alt`.
3. Short CSS path constrained to a meaningful parent.
4. Text fallback and XPath as lower-priority fallbacks.
5. `nth` is used only as a last resort and is marked as fragile.

The recorder stores all candidates with a confidence score. Replay tries them in
order, records which candidate succeeded, and reports a clear error when no
candidate matches. Selectors are never treated as permission to bypass access
controls, CAPTCHAs, robots rules, or a site's terms of service.

## 7. AI Extraction Mode

AI extraction is an optional adapter behind a stable internal contract. The first
release supports OpenAI-compatible HTTP APIs and Ollama. A provider receives a
sanitized page representation plus an explicit JSON schema and must return
schema-validated JSON. Raw credentials are kept server-side and are never sent
to the browser.

The deterministic extractor remains the default. AI extraction is opt-in per
robot, has configurable token and cost limits, and stores the provider/model
metadata with each run for reproducibility.

## 8. Scraping Modes: Markdown / HTML / Crawl / Search

The first vertical slice is a single URL scrape:

`URL -> robots.txt check -> Playwright fetch -> HTML/Markdown normalization -> JSON result`

Crawl and search build on the same worker contract later. Crawl jobs must enforce
same-domain rules, depth/page limits, deduplication, rate limits, and cancellation.
Search providers are adapters and are not implemented as an attempt to evade
provider terms or anti-abuse systems.

## 9. Authenticated / Login-Protected Scraping

Credentials are represented by encrypted Playwright storage states. Access is
organization-scoped, audited, and excluded from logs and artifacts. The recorder
may help a user create a session, but OpenScrape does not automate CAPTCHA
solving or bypass authentication controls.

## 10. Scheduling & Job Queue

BullMQ is the execution boundary between the API and workers. Jobs are
idempotent, have explicit timeouts, retry policies, and cancellation state. The
initial scheduler uses persisted cron schedules and a single scheduler process;
distributed scheduling can be introduced after the MVP proves the job contract.

## 11. Public API

The API is versioned from the beginning under `/api/v1`. MVP endpoints:

- `GET /health` — liveness/readiness information
- `POST /robots` and `GET /robots` — robot CRUD foundation
- `POST /robots/:id/runs` — enqueue a run
- `GET /runs/:id` — run state and statistics
- `GET /runs/:id/results` — paginated extracted data

OpenAPI is generated from the NestJS application and becomes the source for the
TypeScript SDK, Python SDK, and CLI in later milestones.

## 12. SDK & CLI

SDKs are planned only after the API contract is exercised by the dashboard. The
TypeScript SDK is first; the Python SDK and CLI follow once authentication,
pagination, errors, and idempotency headers are stable.

## 13. Integrations (Sheets, Airtable, Webhooks)

Exports are asynchronous run consumers. CSV and JSON download come first;
webhooks, Google Sheets, Airtable, and S3-compatible destinations follow with
retry, signing, and delivery history.

## 14. Tech Stack

| Layer | Decision for MVP |
|------|------------------|
| Workspace | TypeScript monorepo managed by pnpm |
| Dashboard | Next.js App Router, React, Tailwind |
| API | NestJS, REST, OpenAPI |
| Worker | Node.js, Playwright, BullMQ |
| Data | PostgreSQL with Prisma |
| Queue | Redis with BullMQ |
| Artifacts | S3-compatible storage, MinIO locally |
| Auth | Email/password first; OAuth later |
| AI | OpenAI-compatible adapter and Ollama adapter |
| Local runtime | Docker Compose |

NestJS is selected over Fastify directly because the product needs clear module
boundaries, guards, validation, WebSockets, and an API that can grow without
coupling the dashboard to worker internals.

## 15. Self-Hosting & Deployment

Local development will be a single `docker compose up` for PostgreSQL, Redis,
and MinIO, with API, worker, and web running in the workspace during development.
After installing dependencies, download the Chromium runtime used for screenshots:

```bash
npx pnpm install
npx pnpm --dir apps/worker exec playwright install chromium
```

The Compose stack is for local development. PostgreSQL, Redis, and MinIO ports
are published for local tools and the default credentials are development-only;
do not expose this file directly to the internet or reuse those credentials in
production.

Build before using the production entrypoints:

```bash
npx pnpm --dir apps/api build
npx pnpm --dir apps/worker build
npx pnpm --dir apps/api start
npx pnpm --dir apps/worker start
```

Production deployments must apply committed Prisma migrations with:

```bash
npx pnpm --dir apps/api db:migrate
```

Use `db:push` only for disposable local development databases; it is not a
production migration workflow.

Create and restore PostgreSQL backups with:

```bash
npm run db:backup
CONFIRM_RESTORE=yes npm run db:restore -- ./backups/openscrape-YYYYMMDDTHHMMSSZ.sql.gz
```

Backups must be stored outside the application host or on encrypted durable
storage. A restore drill should be performed regularly against an isolated
database and followed by the readiness and smoke checks.

The initial migration is a baseline for a new database. If a database was
previously created with `db:push`, take a backup, compare it with the migration,
and mark the baseline as applied with Prisma's `migrate resolve` procedure before
using `db:migrate` in production.

Use `npx pnpm` when pnpm is not installed globally. Do not run `npx tsc`,
because that can resolve an unrelated npm package named `tsc`.
Production packaging will add container images, health checks, secret injection,
database migrations, backups, structured logs, and resource limits before any
cloud deployment is called production-ready.

## 16. Security & Anti-Blocking

- Enforce SSRF protection: only `http` and `https`, block private/link-local IPs,
  re-check redirects, and apply DNS/IP safeguards.
- API responses include Helmet security headers and JSON/form bodies are limited
  to 1 MB.
- Enforce a 30-second request timeout, a five-redirect limit, and a 5 MB response
  limit in the worker.
- Enforce a configurable per-domain request interval with
  `DOMAIN_REQUEST_INTERVAL_MS` (default: 1000 ms).
- Respect `robots.txt`, per-domain rate limits, request timeouts, and page limits.
- Encrypt credentials and integration configuration at rest.
- Hash API keys; display the secret only once.
- Redact cookies, authorization headers, tokens, and sensitive form values.
- Isolate browser contexts per job and cap concurrent browsers.
- Restrict CORS to `APP_URL` and apply a configurable API rate limit with
  `API_RATE_LIMIT`.
- Enable API key protection in hosted deployments with `API_KEYS_REQUIRED=true`
  and store only the SHA-256 value in `API_KEY_HASH`. Send the raw key using the
  `x-api-key` header; the raw secret is never persisted by OpenScrape.
- The database model now includes users, workspaces, memberships, and revokable
  workspace-scoped API keys. API key creation and revocation should be exposed
  only after authenticated user sessions are enabled.
- Account endpoints are available at `POST /api/v1/auth/register` and
  `POST /api/v1/auth/login`. Authenticated session endpoints are available at
  `GET /api/v1/auth/me` and `POST /api/v1/auth/logout`. Passwords require at
  least 12 characters, are stored using salted `scrypt`, and session tokens
  expire after 30 days. Set `AUTH_REQUIRED=true` in hosted deployments to scope
  robot and artifact access to the session workspace.
- Expired sessions are removed automatically when the API starts, preventing
  unbounded session-table growth.
- Session-authenticated API key management is available at `GET/POST
  /api/v1/api-keys` and `DELETE /api/v1/api-keys/:id`. A newly created secret is
  returned once; listings never expose key material, and revocation is immediate.
- Workspace-scoped audit events are available at `GET /api/v1/audit` and record
  authentication plus API-key lifecycle actions without storing secrets.
- Workspace usage is available at `GET /api/v1/usage` and reports the active
  plan, run limit, used runs, and remaining runs for billing UI/webhooks.
- Provider-neutral billing webhooks are available at
  `POST /api/v1/billing/webhook/:provider`; they require HMAC verification,
  reject stale timestamps, deduplicate provider event IDs, and synchronize the
  workspace plan/subscription state. Set `BILLING_WEBHOOK_SECRET` before use.
- Operational workspace metrics are available at `GET /api/v1/metrics/workspace`
  with robot count, active schedules, and run status aggregates.
- The authenticated dashboard displays these metrics as an operational workspace
  summary and refreshes them after new runs.
- Active runs can be cancelled with `DELETE /api/v1/robots/:id/runs/:runId`;
  cancellation is workspace-scoped and prevents late worker completion from
  overwriting the cancelled status.
- Run lifecycle logs are available at
  `GET /api/v1/robots/:robotId/runs/:runId/logs`; the dashboard can display
  queued, running, completed, failed, and cancelled events.
- Workspace owners can create/list/delete repeatable schedules through
  `GET/POST /api/v1/schedules` and `DELETE /api/v1/schedules/:id`. Intervals are
  limited to 1 minute through 30 days and each scheduled execution creates a
  normal persisted run.
- Workspace owners can delete all workspace data with `DELETE /api/v1/workspace`
  after exact workspace-ID confirmation. The destructive action is audit logged.
- Workspace owners can remove old HTML/screenshots with
  `POST /api/v1/workspace/retention/artifacts` and `{ "olderThanDays": 30 }`.
  Run metadata remains available for audit/history, while stored artifacts are
  deleted and the operation is audit logged.
- For unattended cleanup, set `ARTIFACT_RETENTION_DAYS` to a positive number of
  days. The API performs the cleanup at startup; `0` disables it by default.
  Set `ARTIFACT_RETENTION_INTERVAL_MS` to a positive interval to repeat cleanup
  without restarting the API; `0` keeps the scheduler disabled.
- Provide audit events and deletion controls for user data and artifacts.
- Drain workers and close database/Redis connections during `SIGTERM` and `SIGINT`
  so rolling restarts do not interrupt active jobs abruptly.

## 17. Development Plan / Roadmap

### Phase 0 — Foundation (current)

- [x] Confirm MVP architecture and supported local services.
- [x] Create workspace packages and shared configuration.
- [x] Add Docker Compose for PostgreSQL, Redis, and MinIO.
- [x] Add environment contract and liveness/readiness health checks.

### Phase 1 — First usable vertical slice

- [x] NestJS health endpoint and Prisma schema.
- [x] Create/list robots through REST.
- [x] Queue a single-URL scrape.
- [x] Worker fetches a page with Playwright and persists a result.
- [x] Next.js dashboard creates a robot and displays run status/results.
- [x] Automated API unit tests, HTTP smoke test, live vertical-slice verification, and CI validation with PostgreSQL/Redis services.
- [x] Automated browser E2E tests with Playwright.

### Phase 2 — No-code extraction

- [x] Selector generator with ranked fallbacks.
- [x] Field mapping and deterministic extraction.
- [x] Pagination and infinite-scroll controls.
- [x] Persisted structured results with paginated JSON/CSV exports.
- [x] Provider-neutral structured AI extraction adapter with input/output limits and token usage reporting.
- [x] Persisted recorder step model and workspace-scoped step API foundation.
- [x] Sanitized captured-HTML recorder preview with click-to-ranked-selector steps.
- [x] Playwright replay for recorded `goto`, `click`, `type/fill`, and `wait` steps.
- [ ] Live browser recorder session with CDP preview and bidirectional action streaming.

### Phase 3 — Production product

- [x] Organizations/workspaces, roles, API keys, and billing limits foundation.
- [x] Workspace-scoped audit log for auth and API-key lifecycle actions.
- [x] Owner-confirmed workspace deletion with audit logging.
- [x] Owner-controlled artifact retention with audit logging.
- [x] Configurable startup artifact retention via `ARTIFACT_RETENTION_DAYS`.
- [x] Optional periodic retention via `ARTIFACT_RETENTION_INTERVAL_MS`.
- [x] Persist users, workspaces, memberships, and revokable API key records.
- [x] Add password-based registration and login sessions.
- [x] Enforce a configurable free-plan run quota per billing period.
- [x] Expose workspace usage summary for billing and plan enforcement.
- [x] AI extraction foundation with usage/cost controls.
- [x] Worker/provider integration for opt-in AI extraction runs.
- [x] Queue retries, exponential backoff, graceful worker shutdown, and exports.
- [x] Run cancellation for queued/running jobs.
- [x] Workspace-scoped repeatable schedules with persisted runs.
- [x] Workspace-scoped run lifecycle logs.
- [x] TypeScript SDK and compiled CLI foundation.
- [x] Liveness/readiness, rate limits, security headers, SSRF controls, and deployment documentation.
- [x] Workspace operational metrics foundation.
- [ ] Centralized observability, backups, restore drills, and production infrastructure.
- [ ] Stripe/Paddle checkout, subscription webhooks, plan synchronization, and invoices.
- [x] Provider-neutral signed billing webhook and subscription state foundation.
- [ ] Stripe/Paddle checkout, provider adapters, invoices, and tax handling.

### Definition of Done for MVP

A new user can start the local stack, create a robot for a public URL, run it,
see a successful result in the dashboard, retrieve the same result through the
versioned API, and repeat the run without manual database or queue operations.

The local MVP definition is currently satisfied. Commercial production release
remains gated on payment integration, audit controls, centralized monitoring,
backup/restore drills, infrastructure hardening, and automated browser E2E tests.

## 18. Repository Layout

```text
apps/
  api/       NestJS REST API
  web/       Next.js dashboard
  worker/    BullMQ + Playwright worker
packages/
  config/    Shared TypeScript and environment configuration
  contracts/ Shared API/domain types
  database/  Prisma schema and database client
  extractor/ Deterministic and AI extraction adapters
infra/
  docker/    Local service configuration
docs/        Architecture decisions and API documentation
```

## 19. License & Contribution

## 20. TypeScript SDK

See [docs/sdk.md](docs/sdk.md) for the authenticated `@openscrape/sdk` usage
example and supported automation operations.

## 21. CLI

See [docs/cli.md](docs/cli.md) for the `openscrape` commands built on top of the
SDK.

The repository retains its current license. Before publishing a hosted paid
offering, licensing for dependencies, trademarks, hosted-service terms, data
processing, and acceptable-use rules must be reviewed explicitly.

Contributions should include a focused test and update the relevant contract or
documentation. Security reports should not be opened publicly with credentials,
session data, or private target URLs.