import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { PrismaService } from './prisma.service';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: IORedis;

  constructor(private readonly prisma: PrismaService) {
    const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.redis = new IORedis(redisUrl.toString(), {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  async checkDependencies(): Promise<{ database: 'ok' | 'error'; redis: 'ok' | 'error'; ready: boolean }> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return { database, redis, ready: database === 'ok' && redis === 'ok' };
  }

  async onModuleDestroy() {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    try {
      await this.redis.ping();
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
