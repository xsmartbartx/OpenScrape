import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  'scrape',
  async (job) => {
    console.log(`Received scrape job ${job.id ?? 'unknown'} for ${job.data.url}`);
    return { status: 'queued-for-implementation' };
  },
  { connection },
);

worker.on('completed', (job) => console.log(`Completed job ${job.id ?? 'unknown'}`));
worker.on('failed', (job, error) => console.error(`Failed job ${job?.id ?? 'unknown'}`, error));

console.log('OpenScrape worker listening on scrape queue');
