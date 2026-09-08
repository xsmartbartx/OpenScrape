#!/usr/bin/env node
import { OpenScrapeApiError, OpenScrapeClient } from '@openscrape/sdk';

const [command, ...args] = process.argv.slice(2);
const baseUrl = process.env.OPENSCRAPE_API_URL ?? 'http://localhost:3001/api/v1';
const client = new OpenScrapeClient({
  baseUrl,
  token: process.env.OPENSCRAPE_SESSION,
  apiKey: process.env.OPENSCRAPE_API_KEY,
});

async function main() {
  switch (command) {
    case 'robots':
      return print(await client.listRobots());
    case 'run': {
      const [robotId, url] = args;
      if (!robotId || !url) return usage('openscrape run <robot-id> <url>');
      return print(await client.runRobot(robotId, url));
    }
    case 'usage':
      return print(await client.getUsage());
    case 'metrics':
      return print(await client.getMetrics());
    default:
      return usage('openscrape <robots|run|usage|metrics>');
  }
}

function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(message: string): void {
  process.stderr.write(`Usage: ${message}\n`);
  process.exitCode = 2;
}

main().catch((error: unknown) => {
  if (error instanceof OpenScrapeApiError) {
    process.stderr.write(`OpenScrape API error (${error.status}): ${error.message}\n`);
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unexpected error'}\n`);
  }
  process.exitCode = 1;
});
