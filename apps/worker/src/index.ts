import { PrismaClient } from '@prisma/client';
import { extractStructured } from '@openscrape/extractor';
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
const domainRequestIntervalMs = Number(process.env.DOMAIN_REQUEST_INTERVAL_MS ?? 1000);
const nextDomainRequestAt = new Map<string, number>();

const worker = new Worker(
  'scrape',
  async (job) => {
    const data = job.data as { url?: string; robotId?: string; scheduleId?: string };
    let { url, robotId } = data;
    const jobId = String(job.id ?? 'unknown');
    let runId = jobId;

    if (!url && robotId) {
      const robot = await prisma.robot.findUnique({ where: { id: robotId }, select: { startUrl: true } });
      url = robot?.startUrl;
      if (url) {
        runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await prisma.run.create({
          data: { id: runId, robotId, url, status: 'queued', result: 'Scheduled job accepted for processing.' },
        });
      }
    }
    if (!url) throw new Error('Scheduled job robot has no start URL.');
    console.log(`Received scrape job ${jobId} for ${url}`);

    const urlError = await validateResolvedUrl(url);
    if (urlError) {
      throw new Error(urlError);
    }

    if (runId !== 'unknown') {
      await prisma.run.update({
        where: { id: runId },
        data: { status: 'running' },
      }).catch(() => undefined);
      await prisma.runLog.create({
        data: { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, runId, message: 'Worker started processing.' },
      }).catch(() => undefined);
    }

    if (respectRobots) {
      await assertRobotsAllowed(url);
    }

    const robot = robotId ? await prisma.robot.findUnique({ where: { id: robotId }, select: { type: true, aiPrompt: true, aiSchema: true } }) : undefined;
    const captured = robot?.type === 'recorded'
      ? await replayRecordedRobot(url, robotId!)
      : await capturePage(url);
    const { html, finalUrl, screenshot } = captured;
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
    let structuredData: unknown;
    if (robot?.type === 'ai') {
      const endpoint = process.env.AI_ENDPOINT;
      const apiKey = process.env.AI_API_KEY;
      const model = process.env.AI_MODEL;
      const schema = robot.aiSchema ?? parseJsonConfig(process.env.AI_SCHEMA, { type: 'object', additionalProperties: true });
      const instruction = robot.aiPrompt ?? process.env.AI_PROMPT;
      if (!endpoint || !apiKey || !model || !instruction) {
        throw new Error('AI robot requires AI_ENDPOINT, AI_API_KEY, AI_MODEL, and an aiPrompt.');
      }
      const aiResult = await extractStructured<Record<string, unknown>>(
        html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        instruction,
        { endpoint, apiKey, model, schema: schema as Record<string, unknown>, schemaName: `openscrape_${robotId}` },
      );
      structuredData = aiResult.data;
      result.status = 'completed';
    }

    if (jobId !== 'unknown') {
      await prisma.result.create({
        data: {
          id: `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          runId,
          sourceUrl: finalUrl,
          pageIndex: 0,
          data: structuredData ?? { title: result.title, snippet: result.snippet, url: finalUrl },
        },
      }).catch(() => undefined);
      await prisma.run.updateMany({
        where: { id: runId, status: { not: 'cancelled' } },
        data: {
          status: 'success',
          finishedAt: new Date(),
          result: JSON.stringify({
            status: result.status,
            title: result.title,
            snippet: result.snippet,
            structuredData,
          }),
          html,
          screenshot,
        },
      }).catch(() => undefined);
      await prisma.runLog.create({
        data: { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, runId, message: 'Run completed successfully.' },
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
    const jobData = job?.data as { robotId?: string } | undefined;
    const failedRun = jobData?.robotId
      ? await prisma.run.findFirst({ where: { robotId: jobData.robotId, status: { in: ['queued', 'running'] } }, orderBy: { startedAt: 'desc' } })
      : undefined;
    await prisma.run.updateMany({
      where: { id: failedRun?.id ?? jobId, status: { not: 'cancelled' } },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        result: error instanceof Error ? error.message : 'Unknown worker error',
      },
    }).catch(() => undefined);
    const failedRunId = failedRun?.id ?? jobId;
    await prisma.runLog.create({
      data: { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, runId: failedRunId, level: 'error', message: error instanceof Error ? error.message : 'Unknown worker error' },
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
    await waitForDomain(new URL(currentUrl).hostname);
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

async function capturePage(initialUrl: string): Promise<{ html: string; finalUrl: string; screenshot?: Uint8Array<ArrayBuffer> }> {
  const { html, finalUrl } = await fetchPage(initialUrl);
  let screenshot: Uint8Array<ArrayBuffer> | undefined;

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await prepareBrowserPage(browser);
    await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: requestTimeoutMs });
    const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });
    screenshot = Uint8Array.from(screenshotBuffer);
    await browser.close();
  } catch (error) {
    console.warn(`Could not capture screenshot for ${finalUrl}:`, error);
  }
  return { html, finalUrl, screenshot };
}

async function replayRecordedRobot(initialUrl: string, robotId: string): Promise<{ html: string; finalUrl: string; screenshot?: Uint8Array<ArrayBuffer> }> {
  const steps = await prisma.robotStep.findMany({ where: { robotId }, orderBy: { orderIndex: 'asc' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await prepareBrowserPage(browser);
    await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: requestTimeoutMs });

    for (const step of steps) {
      const options = (step.options ?? {}) as { timeoutMs?: number };
      const timeout = options.timeoutMs ?? requestTimeoutMs;
      const selector = selectRecordedSelector(step.selector);
      if (step.action === 'goto' && step.value) {
        const targetError = await validateResolvedUrl(step.value);
        if (targetError) throw new Error(`Recorded navigation blocked: ${targetError}`);
        await page.goto(step.value, { waitUntil: 'domcontentloaded', timeout });
      } else if (step.action === 'click' && selector) {
        await page.locator(toPlaywrightSelector(selector)).first().click({ timeout });
      } else if ((step.action === 'type' || step.action === 'fill') && selector) {
        await page.locator(toPlaywrightSelector(selector)).first().fill(step.value ?? '', { timeout });
      } else if (step.action === 'wait') {
        await page.waitForTimeout(Math.min(Number(step.value ?? 500), 30000));
      }
    }

    const html = await page.content();
    const screenshot = Uint8Array.from(await page.screenshot({ fullPage: true, type: 'png' }));
    return { html, finalUrl: page.url(), screenshot };
  } finally {
    await browser.close();
  }
}

async function prepareBrowserPage(browser: import('playwright').Browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, userAgent });
  await page.route('**/*', async (route) => {
    const requestUrl = route.request().url();
    if (await validateResolvedUrl(requestUrl)) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return page;
}

function selectRecordedSelector(selector: unknown): string | undefined {
  if (!selector || typeof selector !== 'object') return undefined;
  const candidates = (selector as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return undefined;
  const first = candidates.find((candidate) => candidate && typeof candidate === 'object' && typeof (candidate as { value?: unknown }).value === 'string');
  return first ? (first as { value: string }).value : undefined;
}

function toPlaywrightSelector(selector: string): string {
  return selector.startsWith('//') ? `xpath=${selector}` : selector;
}

function parseJsonConfig(value: string | undefined, fallback: Record<string, unknown>): Record<string, unknown> {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : fallback;
  } catch {
    return fallback;
  }
}

async function waitForDomain(hostname: string): Promise<void> {
  const interval = Number.isFinite(domainRequestIntervalMs) && domainRequestIntervalMs >= 0
    ? domainRequestIntervalMs
    : 1000;
  const now = Date.now();
  const nextAllowedAt = Math.max(now, nextDomainRequestAt.get(hostname) ?? now);
  nextDomainRequestAt.set(hostname, nextAllowedAt + interval);
  const waitMs = nextAllowedAt - now;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
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
