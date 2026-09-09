import { Body, Controller, Get, Param, Post, Req, UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';

type RequestWithUser = Request & { user?: SessionUser };
type RobotStepInput = {
  action?: string;
  selector?: unknown;
  value?: string;
  options?: unknown;
};

@Controller('robots')
export class RobotStepsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get(':robotId/steps')
  async list(@Param('robotId') robotId: string, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const robot = await this.prisma.robot.findFirst({ where: { id: robotId, workspaceId: user.workspaceId } });
    if (!robot) throw new NotFoundException('Robot not found.');
    return this.prisma.robotStep.findMany({ where: { robotId }, orderBy: { orderIndex: 'asc' } });
  }

  @Post(':robotId/steps')
  async create(@Param('robotId') robotId: string, @Body() body: RobotStepInput, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const robot = await this.prisma.robot.findFirst({ where: { id: robotId, workspaceId: user.workspaceId } });
    if (!robot) throw new NotFoundException('Robot not found.');
    if (!body.action?.trim()) throw new NotFoundException('Step action is required.');

    const last = await this.prisma.robotStep.findFirst({ where: { robotId }, orderBy: { orderIndex: 'desc' } });
    const step = await this.prisma.robotStep.create({
      data: {
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        robotId,
        orderIndex: (last?.orderIndex ?? -1) + 1,
        action: body.action.trim(),
        selector: body.selector as object | undefined,
        value: body.value,
        options: body.options as object | undefined,
      },
    });
    await this.audit.record({ action: 'robot_step.create', userId: user.id, workspaceId: user.workspaceId, resourceType: 'RobotStep', resourceId: step.id });
    return step;
  }

  private requireUser(request: RequestWithUser): SessionUser {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    return request.user;
  }
}
