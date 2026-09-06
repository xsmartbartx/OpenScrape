import { PrismaClient } from '@prisma/client';
import { lookup } from 'node:dns/promises';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { chromium } from 'playwright';
import { validateTargetUrl } from './url-validation';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? 'postgresql://openscrape:openscrape-dev@localhost:5432/openscrape',
    },
  },
});

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const requestTimeoutMs = 30000;
const maxRedirects = 5;
const maxResponseBytes = 5 * 1024 * 1024;
const userAgent = process.env.SCRAPER_USER_AGENT ?? 'OpenScrapeBot/0.1 (+https://openscrape.local/bot)';
const respectRobots = process.env.RESPECT_ROBOTS !== 'false';
const robotsFailClosed = process.env.ROBOTS_FAIL_CLOSED === 'true';

const worker = new Worker(
  'scrape',
  async (job) => {
    const { url, robotId } = job.data as { url: string; robotId?: string };
    const jobId = String(job.id ?? 'unknown');
    console.log(`Received scrape job ${jobId} for ${url}`);

    const urlError = await validateResolvedUrl(url);
    if (urlError) {
      throw new Error(urlError);
    }

    if (jobId !== 'unknown') {
      await prisma.run.update({
        where: { id: jobId },
        data: { status: 'running' },
      }).catch(() => undefined);
    }

    if (respectRobots) {
      await assertRobotsAllowed(url);
    }

    const { html, finalUrl } = await fetchPage(url);
    let screenshot: Uint8Array<ArrayBuffer> | undefined;

    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        userAgent,
      });
      await page.route('**/*', async (route) => {
        const requestUrl = route.request().url();
        if (await validateResolvedUrl(requestUrl)) {
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });
      await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: requestTimeoutMs });
      const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });
      screenshot = Uint8Array.from(screenshotBuffer);
      await browser.close();
    } catch (error) {
      console.warn(`Could not capture screenshot for ${jobId}:`, error);
    }
    const result = {
      status: 'completed',
      url: finalUrl,
      robotId,
      title: html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.trim() ?? 'No title',
      snippet: html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220),
    };

    if (jobId !== 'unknown') {
      await prisma.run.update({
        where: { id: jobId },
        data: {
          status: 'success',
          finishedAt: new Date(),
          result: JSON.stringify({
            status: result.status,
            title: result.title,
            snippet: result.snippet,
          }),
          html,
          screenshot,
        },
      }).catch(() => undefined);
    }

    return result;
  },
  { connection, concurrency: 2, lockDuration: 120000 },
);

worker.on('completed', (job, result) => console.log(`Completed job ${job.id ?? 'unknown'} with result:`, result));
worker.on('failed', async (job, error) => {
  const jobId = String(job?.id ?? 'unknown');
  console.error(`Failed job ${jobId}`, error);

  if (jobId !== 'unknown') {
    await prisma.run.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        result: error instanceof Error ? error.message : 'Unknown worker error',
      },
    }).catch(() => undefined);
  }
});

console.log('OpenScrape worker listening on scrape queue');

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
};

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

async function validateResolvedUrl(value: string): Promise<string | undefined> {
  const syntaxError = validateTargetUrl(value);
  if (syntaxError) return syntaxError;

  const hostname = new URL(value).hostname;
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  for (const address of addresses) {
    const resolvedUrl = address.address.includes(':') ? `http://[${address.address}]` : `http://${address.address}`;
    if (validateTargetUrl(resolvedUrl)) {
      return 'Target resolves to a private or local network address.';
    }
  }
}

async function fetchPage(initialUrl: string): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = initialUrl;

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response: Response;

    try {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': userAgent },
      });
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        clearTimeout(timeout);
        throw new Error('Redirect response did not include a location.');
      }
      const nextUrl = new URL(location, currentUrl).toString();
      const urlError = await validateResolvedUrl(nextUrl);
      if (urlError) {
        clearTimeout(timeout);
        throw new Error(`Redirect blocked: ${urlError}`);
      }
      clearTimeout(timeout);
      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) {
      clearTimeout(timeout);
      throw new Error(`Target returned HTTP ${response.status}.`);
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxResponseBytes) {
      clearTimeout(timeout);
      throw new Error('Target response exceeds the 5 MB limit.');
    }

    let body: ArrayBuffer;
    try {
      body = await response.arrayBuffer();
    } finally {
      clearTimeout(timeout);
    }
    if (body.byteLength > maxResponseBytes) throw new Error('Target response exceeds the 5 MB limit.');
    return { html: new TextDecoder().decode(body), finalUrl: currentUrl };
  }

  throw new Error(`Target exceeded the ${maxRedirects} redirect limit.`);
}

async function assertRobotsAllowed(targetUrl: string): Promise<void> {
  const target = new URL(targetUrl);
  const robotsUrl = `${target.origin}/robots.txt`;

  try {
    const { html: robots } = await fetchPage(robotsUrl);
    if (!isAllowedByRobots(robots, target.pathname)) {
      throw new Error(`Scrape blocked by robots.txt for ${target.pathname}.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Scrape blocked')) throw error;
    if (robotsFailClosed) throw new Error('robots.txt could not be fetched.');
    console.warn(`Could not fetch robots.txt for ${target.origin}; continuing because ROBOTS_FAIL_CLOSED is false.`);
  }
}

function isAllowedByRobots(contents: string, pathname: string): boolean {
  let applies = false;
  let disallow: string[] = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.split('#', 1)[0].trim();
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      applies = value === '*' || value.toLowerCase() === 'openscrapebot';
      if (applies) disallow = [];
      continue;
    }

    if (applies && field === 'disallow' && value) disallow.push(value);
  }

  return !disallow.some((rule) => pathname.startsWith(rule));
}
