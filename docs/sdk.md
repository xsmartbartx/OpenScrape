# TypeScript SDK

The workspace includes `@openscrape/sdk` for API automation:

```ts
import { OpenScrapeClient } from '@openscrape/sdk';

const client = new OpenScrapeClient({
  baseUrl: 'https://api.example.com/api/v1',
  token: process.env.OPENSCRAPE_SESSION,
});

const robots = await client.listRobots();
const run = await client.runRobot(robots[0].id, robots[0].startUrl);
console.log(run.id, run.status);
```

The SDK supports robots, runs, cancellation, schedules, usage, metrics, audit
logs, API-key administration, Bearer sessions, and API-key authentication.
