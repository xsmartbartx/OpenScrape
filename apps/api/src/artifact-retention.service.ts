import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class ArtifactRetentionService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(ArtifactRetentionService.name);
  private retentionTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const configuredDays = Number(process.env.ARTIFACT_RETENTION_DAYS ?? 0);
    if (!Number.isInteger(configuredDays) || configuredDays < 1) return;

    try {
      const deletedRuns = await this.removeOlderThan(configuredDays);
      this.logger.log(`Artifact retention removed artifacts from ${deletedRuns} run(s).`);
    } catch (error) {
      this.logger.warn(`Artifact retention skipped: ${error instanceof Error ? error.message : 'database unavailable'}`);
    }

    const intervalMs = Number(process.env.ARTIFACT_RETENTION_INTERVAL_MS ?? 0);
    if (Number.isInteger(intervalMs) && intervalMs > 0) {
      this.retentionTimer = setInterval(() => {
        void this.removeOlderThan(configuredDays)
          .then((count) => this.logger.log(`Scheduled artifact retention removed artifacts from ${count} run(s).`))
          .catch((error: unknown) => this.logger.warn(`Scheduled artifact retention skipped: ${error instanceof Error ? error.message : 'database unavailable'}`));
      }, intervalMs);
      this.retentionTimer.unref();
    }
  }

  onModuleDestroy() {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
  }

  async removeOlderThan(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.run.updateMany({
      where: {
        finishedAt: { lt: cutoff },
        OR: [{ html: { not: null } }, { screenshot: { not: null } }],
      },
      data: { html: null, screenshot: null },
    });
    return result.count;
  }
}
