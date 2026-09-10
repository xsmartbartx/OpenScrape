# Observability

API and worker processes emit structured JSON events to stdout so a container
runtime can ship them to its centralized log sink without scraping application
HTML or database tables.

HTTP events include `requestId`, method, path, status, and duration. The API
returns the same correlation value in `X-Request-Id`; trusted values are
validated before propagation. Worker events include `worker.started`,
`worker.job.received`, `worker.job.completed`, `worker.queue.completed`, and
`worker.job.failed`, with job IDs, robot IDs, duration, and sanitized error
messages. Target URLs and credentials are excluded from worker logs.

For a hosted deployment, collect stdout from both `api` and `worker`, retain
the request ID as a searchable field, and alert on readiness failures, failed
jobs, elevated duration, and repeated recorder shutdowns. Workspace metrics are
available from `GET /api/v1/metrics/workspace`; run lifecycle details are
available from the run logs endpoint. The deployment must provide the final
log retention, access control, and alerting backend.