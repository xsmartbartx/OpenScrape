import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class ArtifactRetentionService implements OnModuleInit {
  private readonly logger = new Logger(ArtifactRetentionService.name);

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
