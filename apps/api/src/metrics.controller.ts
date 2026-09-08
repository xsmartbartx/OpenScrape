import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';

type RequestWithUser = Request & { user?: SessionUser };

@Controller('metrics')
export class MetricsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('workspace')
  async workspace(@Req() request: RequestWithUser) {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    const workspaceId = request.user.workspaceId;
    const [robots, schedules, runs] = await Promise.all([
      this.prisma.robot.count({ where: { workspaceId } }),
      this.prisma.schedule.count({ where: { workspaceId, active: true } }),
      this.prisma.run.groupBy({
        by: ['status'],
        where: { robot: { workspaceId } },
        _count: { _all: true },
      }),
    ]);

    const counts = Object.fromEntries(runs.map((row) => [row.status, row._count._all]));
    return {
      workspaceId,
      robots,
      activeSchedules: schedules,
      runs: {
        queued: counts.queued ?? 0,
        running: counts.running ?? 0,
        success: counts.success ?? 0,
        failed: counts.failed ?? 0,
        cancelled: counts.cancelled ?? 0,
      },
    };
  }
}
