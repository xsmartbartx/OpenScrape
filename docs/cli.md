# CLI

The workspace includes `@openscrape/cli` with the `openscrape` command.

Configure one authentication method:

```bash
export OPENSCRAPE_API_URL=http://localhost:3001/api/v1
export OPENSCRAPE_SESSION='session-token'
# or: export OPENSCRAPE_API_KEY='os_...'
```

Commands:

```bash
openscrape robots
openscrape run <robot-id> <url>
openscrape usage
openscrape metrics
```

The CLI prints JSON to stdout and exits non-zero for API or usage errors.
