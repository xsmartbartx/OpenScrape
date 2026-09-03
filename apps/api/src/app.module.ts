import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppController } from './app.controller';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { RobotsController } from './robots.controller';

const queue = new Queue('scrape', {
  connection: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
});

@Module({
  controllers: [AppController, HealthController, RobotsController],
  providers: [
    PrismaService,
    {
      provide: 'QUEUE_CLIENT',
      useFactory: () => ({
        addJob: async (url: string, robotId: string, jobId?: string) => {
          const job = await queue.add(
            'scrape',
            { url, robotId },
            { jobId, removeOnComplete: true, removeOnFail: true },
          );

          return { id: job.id ?? `job-${Date.now()}` };
        },
      }),
    },
  ],
})
export class AppModule {}
