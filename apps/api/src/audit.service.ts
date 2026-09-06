import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    action: string;
    userId?: string;
    workspaceId?: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action: input.action,
        userId: input.userId,
        workspaceId: input.workspaceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata,
      },
    }).catch(() => undefined);
  }
}
