import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';

type RequestWithUser = Request & { user?: SessionUser };

@Controller('usage')
export class UsageController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getUsage(@Req() request: RequestWithUser) {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: request.user.workspaceId },
      select: { plan: true },
    });
    const robots = await this.prisma.robot.findMany({
      where: { workspaceId: request.user.workspaceId },
      select: { runLimit: true, periodStart: true },
    });
    const periodStart = robots.reduce(
      (earliest, robot) => robot.periodStart < earliest ? robot.periodStart : earliest,
      new Date(),
    );
    const runCount = await this.prisma.run.count({
      where: {
        robot: { workspaceId: request.user.workspaceId },
        startedAt: { gte: periodStart },
      },
    });
    const runLimit = robots.reduce((total, robot) => total + robot.runLimit, 0);

    return {
      workspaceId: request.user.workspaceId,
      plan: workspace?.plan ?? 'free',
      periodStart: periodStart.toISOString(),
      runs: { used: runCount, limit: runLimit },
      remaining: Math.max(runLimit - runCount, 0),
    };
  }
}
