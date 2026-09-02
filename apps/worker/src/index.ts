import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'scrape',
  async (job) => {
    const { url } = job.data as { url: string };
    console.log(`Received scrape job ${job.id ?? 'unknown'} for ${url}`);

    const response = await fetch(url, { redirect: 'follow' });
    const html = await response.text();

    return {
      status: 'completed',
      url,
      title: html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.trim() ?? 'No title',
      snippet: html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220),
    };
  },
  { connection },
);

worker.on('completed', (job, result) => console.log(`Completed job ${job.id ?? 'unknown'} with result:`, result));
worker.on('failed', (job, error) => console.error(`Failed job ${job?.id ?? 'unknown'}`, error));

console.log('OpenScrape worker listening on scrape queue');
