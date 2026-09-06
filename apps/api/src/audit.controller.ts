import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';

type RequestWithUser = Request & { user?: SessionUser };

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() request: RequestWithUser) {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    return this.prisma.auditEvent.findMany({
      where: { workspaceId: request.user.workspaceId },
      select: { id: true, action: true, resourceType: true, resourceId: true, metadata: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
