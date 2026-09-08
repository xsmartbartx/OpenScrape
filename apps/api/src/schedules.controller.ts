import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';

type RequestWithUser = Request & { user?: SessionUser };
type ScheduleInput = { robotId?: string; intervalMs?: number };

type ScheduleQueue = {
  upsertSchedule: (scheduleId: string, robotId: string, intervalMs: number, active: boolean) => Promise<void>;
};

@Controller('schedules')
export class SchedulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject('QUEUE_CLIENT') private readonly queue: ScheduleQueue,
  ) {}

  @Get()
  async list(@Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    return this.prisma.schedule.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() body: ScheduleInput, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const intervalMs = this.validateInterval(body.intervalMs);
    const robot = await this.prisma.robot.findFirst({ where: { id: body.robotId, workspaceId: user.workspaceId } });
    if (!robot) throw new NotFoundException('Robot not found.');

    const schedule = await this.prisma.schedule.create({
      data: {
        id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: user.workspaceId,
        robotId: robot.id,
        intervalMs,
      },
    });
    await this.queue.upsertSchedule(schedule.id, robot.id, intervalMs, true);
    await this.audit.record({ action: 'schedule.create', userId: user.id, workspaceId: user.workspaceId, resourceType: 'Schedule', resourceId: schedule.id });
    return schedule;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const schedule = await this.prisma.schedule.findFirst({ where: { id, workspaceId: user.workspaceId } });
    if (!schedule) throw new NotFoundException('Schedule not found.');
    await this.queue.upsertSchedule(schedule.id, schedule.robotId, schedule.intervalMs, false);
    await this.prisma.schedule.delete({ where: { id: schedule.id } });
    await this.audit.record({ action: 'schedule.delete', userId: user.id, workspaceId: user.workspaceId, resourceType: 'Schedule', resourceId: schedule.id });
    return { deleted: true };
  }

  private requireUser(request: RequestWithUser): SessionUser {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    return request.user;
  }

  private validateInterval(value?: number): number {
    const intervalMs = Number(value);
    if (!Number.isInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 30 * 24 * 60 * 60 * 1000) {
      throw new ForbiddenException('intervalMs must be between 60000 and 2592000000.');
    }
    return intervalMs;
  }
}
