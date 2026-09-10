import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from './session.guard';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';
import { RecorderRuntimeService } from './recorder-runtime.service';
import { validateTargetUrl } from './url-validation';

type RequestWithUser = Request & { user?: SessionUser };
type SessionInput = { startUrl?: string };

@Controller('robots')
export class RecorderSessionsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly runtime?: RecorderRuntimeService) {}

  @Get(':robotId/recorder-sessions')
  async list(@Param('robotId') robotId: string, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    await this.requireRobot(robotId, user.workspaceId);
    return this.prisma.recorderSession.findMany({ where: { robotId, workspaceId: user.workspaceId }, orderBy: { createdAt: 'desc' } });
  }

  @Post(':robotId/recorder-sessions')
  async start(@Param('robotId') robotId: string, @Body() body: SessionInput, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const startUrl = body.startUrl ?? (await this.requireRobot(robotId, user.workspaceId)).startUrl;
    const urlError = validateTargetUrl(startUrl);
    if (urlError) throw new NotFoundException(urlError);

    const session = await this.prisma.recorderSession.create({
      data: {
        id: `recorder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        workspaceId: user.workspaceId,
        robotId,
        startUrl,
        status: 'created',
      },
    });
    await this.audit.record({ action: 'recorder_session.create', userId: user.id, workspaceId: user.workspaceId, resourceType: 'RecorderSession', resourceId: session.id });
    if (this.runtime) await this.runtime.start(session.id, user.workspaceId, robotId, startUrl);
    return session;
  }

  @Delete(':robotId/recorder-sessions/:sessionId')
  async stop(@Param('robotId') robotId: string, @Param('sessionId') sessionId: string, @Req() request: RequestWithUser) {
    const user = this.requireUser(request);
    const session = await this.prisma.recorderSession.findFirst({ where: { id: sessionId, robotId, workspaceId: user.workspaceId, status: { not: 'stopped' } } });
    if (!session) throw new NotFoundException('Recorder session not found.');

    await this.runtime?.stop(session.id);
    await this.prisma.recorderSession.update({ where: { id: session.id }, data: { status: 'stopped', stoppedAt: new Date() } });
    await this.audit.record({ action: 'recorder_session.stop', userId: user.id, workspaceId: user.workspaceId, resourceType: 'RecorderSession', resourceId: session.id });
    return { stopped: true };
  }

  private requireUser(request: RequestWithUser): SessionUser {
    if (!request.user) throw new UnauthorizedException('Authenticated session required.');
    return request.user;
  }

  private async requireRobot(robotId: string, workspaceId: string) {
    const robot = await this.prisma.robot.findFirst({ where: { id: robotId, workspaceId }, select: { id: true, startUrl: true } });
    if (!robot) throw new NotFoundException('Robot not found.');
    return robot;
  }
}
