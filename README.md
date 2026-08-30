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
8. [Scraping Modes: Markdown / HTML / Crawl / Search](#8-scraping-modes)
9. [Authenticated / Login-Protected Scraping](#9-authenticated-scraping)
10. [Scheduling & Job Queue](#10-scheduling--job-queue)
11. [Public API](#11-public-api)
12. [SDK & CLI](#12-sdk--cli)
13. [Integrations (Sheets, Airtable, Webhooks)](#13-integrations)
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