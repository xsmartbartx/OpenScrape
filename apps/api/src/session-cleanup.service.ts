import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class SessionCleanupService implements OnModuleInit {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.removeExpiredSessions();
    } catch (error) {
      this.logger.warn(`Could not clean expired sessions: ${error instanceof Error ? error.message : 'database unavailable'}`);
    }
  }

  async removeExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    if (result.count > 0) this.logger.log(`Removed ${result.count} expired session(s).`);
    return result.count;
  }
}
