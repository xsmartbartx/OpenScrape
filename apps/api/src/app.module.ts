import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import { AppController } from './app.controller';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { RobotsController } from './robots.controller';

const queue = new Queue('scrape', {
  connection: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
});

const apiRateLimit = Number(process.env.API_RATE_LIMIT ?? 60);

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number.isFinite(apiRateLimit) && apiRateLimit > 0 ? apiRateLimit : 60 }]),
  ],
  controllers: [AppController, AuthController, HealthController, RobotsController],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: 'QUEUE_CLIENT',
      useFactory: () => ({
        addJob: async (url: string, robotId: string, jobId?: string) => {
          const job = await queue.add(
            'scrape',
            { url, robotId },
            {
              jobId,
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
              removeOnComplete: 100,
              removeOnFail: 100,
            },
          );

          return { id: job.id ?? `job-${Date.now()}` };
        },
      }),
    },
  ],
})
export class AppModule {}
