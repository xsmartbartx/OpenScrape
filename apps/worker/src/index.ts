import { PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { chromium } from 'playwright';

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

const worker = new Worker(
  'scrape',
  async (job) => {
    const { url, robotId } = job.data as { url: string; robotId?: string };
    const jobId = String(job.id ?? 'unknown');
    console.log(`Received scrape job ${jobId} for ${url}`);

    if (jobId !== 'unknown') {
      await prisma.run.update({
        where: { id: jobId },
        data: { status: 'running' },
      }).catch(() => undefined);
    }

    const response = await fetch(url, { redirect: 'follow' });
    const html = await response.text();
    let screenshot: Uint8Array<ArrayBuffer> | undefined;

    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });
      screenshot = Uint8Array.from(screenshotBuffer);
      await browser.close();
    } catch (error) {
      console.warn(`Could not capture screenshot for ${jobId}:`, error);
    }
    const result = {
      status: 'completed',
      url,
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
  { connection },
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
