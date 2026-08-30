# OpenScrape

OpenScrape is a self-hostable, no-code web-data platform. The goal is to let a person describe a page and the fields they need, run it, and consume structured results without writing a scraper.

## Current implementation — MVP slice

This repository now includes the first end-to-end vertical slice:

- Dashboard to create, edit, delete, and run robots
- One public HTTP(S) page per run
- Field mapping using the simple selectors `tag`, `.class`, and `#id`
- Repeated-record extraction from list/card elements, with a configurable 1–100 record limit
- Persistent local JSON store at `data/openscrape.json`
- `robots.txt` preflight enforcement by default, including `Allow`, `Disallow`, wildcard, and end-anchor rules
- Run status, results, and execution-event viewer
- CSV export from a completed run
- No runtime dependencies; Node 20+ is enough

It is intentionally not yet a production scraper. It does **not** support JavaScript-rendered pages, recordings, robust CSS/XPath selector replay, auth sessions, crawling, scheduling, AI extraction, Redis, Postgres, or multi-user auth. `robots.txt` is checked as a preflight, but production-grade rate limiting and Playwright-level enforcement remain future work. The dashboard labels this honestly.

## Run locally

```bash
npm start
# Open http://localhost:3000
```

For development with automatic restart:

```bash
npm run dev
```

Run the test suite:

```bash
npm test
```

## Create a robot

1. Select **New robot**.
2. Supply a public HTTPS/HTTP page URL.
3. Add one field per line as `field name = selector`.
4. Select **Run now**.

Example fields:

```text
headline = h1
summary = .summary
page_title = #title
```

Leave **Record selector** empty to return one record from the whole page. To extract a product or article list, use a selector such as `.product-card`; OpenScrape will apply every field to each matching card (up to the configured limit). The MVP returns the first matching element for each field inside a record. It fetches only public pages; use it only where you have permission to collect the data and where the target site’s rules allow it.

## API

The dashboard uses the same small JSON API:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check |
| `GET`, `POST` | `/api/robots` | List or create robots |
| `PUT`, `DELETE` | `/api/robots/:id` | Update or delete a robot |
| `POST` | `/api/robots/:id/runs` | Queue a run |
| `GET` | `/api/runs` | List runs |
| `GET` | `/api/runs/:id` | Read a run and its event trail |
| `GET` | `/api/runs/:id/results` | Read structured results |
| `GET` | `/api/runs/:id/export.csv` | Download results as CSV |

Robot creation body:

```json
{
  "name": "Example headline",
  "startUrl": "https://example.com",
  "description": "Gets the page headline",
  "fields": [{ "name": "headline", "selector": "h1" }],
  "rowSelector": ".product-card",
  "maxRows": 50,
  "respectRobotsTxt": true
}
```

## Next build stages

1. Replace the local store with Postgres and add authenticated organizations.
2. Add Redis/BullMQ workers and robust execution/audit logs.
3. Add Playwright, rate limits, screenshots, and selector generation/replay.
4. Build the click-to-select recorder and repeat/pagination support.
5. Add crawling, schedules, API keys, webhooks/exports, and AI schema extraction.
6. Package the services in Docker Compose with MinIO object storage.

## Architecture target

The intended production shape is a Next.js dashboard, API service, Redis-backed worker pool, Postgres, Playwright browser contexts, and S3/MinIO artifacts. This initial implementation deliberately keeps the same main concepts—robots, runs, fields, results—while providing a small executable foundation instead of a non-runnable specification.
