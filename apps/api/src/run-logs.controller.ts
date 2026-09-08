import { Controller, Get, NotFoundException, Param, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';

type RequestWithUser = Request & { user?: SessionUser };

@Controller('robots')
export class RunLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':robotId/runs/:runId/logs')
  async list(@Param('robotId') robotId: string, @Param('runId') runId: string, @Req() request: RequestWithUser) {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    const run = await this.prisma.run.findFirst({
      where: { id: runId, robotId, robot: { workspaceId: request.user.workspaceId } },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('Run not found.');

    return this.prisma.runLog.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
