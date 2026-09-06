import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import { AppController } from './app.controller';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysController } from './api-keys.controller';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuthController } from './auth.controller';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaService } from './prisma.service';
import { RobotsController } from './robots.controller';
import { SessionGuard } from './session.guard';
import { SessionCleanupService } from './session-cleanup.service';

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const queue = new Queue('scrape', {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    password: redisUrl.password || undefined,
    username: redisUrl.username || undefined,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
  },
});

const apiRateLimit = Number(process.env.API_RATE_LIMIT ?? 60);

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number.isFinite(apiRateLimit) && apiRateLimit > 0 ? apiRateLimit : 60 }]),
  ],
  controllers: [AppController, ApiKeysController, AuditController, AuthController, HealthController, RobotsController],
  providers: [
    PrismaService,
    AuditService,
    HealthService,
    SessionCleanupService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SessionGuard,
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
