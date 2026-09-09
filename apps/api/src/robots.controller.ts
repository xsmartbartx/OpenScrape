import { BadRequestException, Body, Controller, Delete, Get, Header, HttpException, HttpStatus, Inject, NotFoundException, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import type { CreateRobotInput, CreateRunInput, Robot, RunStatus } from '@openscrape/contracts';
import { PrismaService } from './prisma.service';
import { validateTargetUrl } from './url-validation';
import type { SessionUser } from './session.guard';

type RequestWithUser = Request & { user?: SessionUser };

export type QueueClient = {
  addJob: (url: string, robotId: string, jobId?: string) => Promise<{ id: string }>;
  removeJob: (jobId: string) => Promise<boolean>;
};

@Controller('robots')
export class RobotsController {
  constructor(
    @Inject('QUEUE_CLIENT') private readonly queueClient: QueueClient,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getRobots(@Req() request: RequestWithUser): Promise<Robot[]> {
    const robots = await this.prisma.robot.findMany({
      where: request.user?.workspaceId ? { workspaceId: request.user.workspaceId } : undefined,
    });

    return robots.map((robot) => ({
      id: robot.id,
      name: robot.name,
      type: robot.type as Robot['type'],
      startUrl: robot.startUrl,
      status: robot.status as Robot['status'],
      aiPrompt: robot.aiPrompt ?? undefined,
      aiSchema: robot.aiSchema as Record<string, unknown> | undefined,
    }));
  }

  @Post()
  async createRobot(@Body() body: CreateRobotInput, @Req() request?: RequestWithUser): Promise<Robot> {
    this.assertSafeUrl(body.startUrl);
    const robot = await this.prisma.robot.create({
      data: {
        id: `robot-${Date.now()}`,
        name: body.name,
        type: body.type,
        startUrl: body.startUrl,
        status: 'ready',
        workspaceId: request?.user?.workspaceId,
        ...(body.aiPrompt ? { aiPrompt: body.aiPrompt } : {}),
        ...(body.aiSchema ? { aiSchema: body.aiSchema } : {}),
      },
    });

    return {
      id: robot.id,
      name: robot.name,
      type: robot.type as Robot['type'],
      startUrl: robot.startUrl,
      status: robot.status as Robot['status'],
      aiPrompt: robot.aiPrompt ?? undefined,
      aiSchema: robot.aiSchema as Record<string, unknown> | undefined,
    };
  }

  @Get(':id/preview')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getPreview(@Param('id') robotId: string, @Req() request: RequestWithUser): Promise<string> {
    const run = await this.prisma.run.findFirst({
      where: { robotId, ...(request.user?.workspaceId ? { robot: { workspaceId: request.user.workspaceId } } : {}) },
      orderBy: { startedAt: 'desc' },
      select: { html: true },
    });
    if (!run?.html) throw new NotFoundException('No captured HTML is available for this robot.');
    return run.html;
  }

  @Post(':id/runs')
  async createRun(@Param('id') robotId: string, @Body() body: Pick<CreateRunInput, 'url'>, @Req() request?: RequestWithUser): Promise<RunStatus> {
    this.assertSafeUrl(body.url);
    const existingRobot = await this.prisma.robot.findFirst({
      where: { id: robotId, ...(request?.user?.workspaceId ? { workspaceId: request.user.workspaceId } : {}) },
    });

    if (!existingRobot) {
      await this.prisma.robot.create({
        data: {
          id: robotId,
          name: `Robot ${robotId}`,
          type: 'scrape',
          startUrl: body.url,
          status: 'ready',
          workspaceId: request?.user?.workspaceId,
        },
      });
    }

    const robot = await this.prisma.robot.findFirst({
      where: { id: robotId, ...(request?.user?.workspaceId ? { workspaceId: request.user.workspaceId } : {}) },
    });
    if (!robot) throw new NotFoundException('Robot not found.');
    const runCount = await this.prisma.run.count({
      where: { robotId, startedAt: { gte: robot.periodStart } },
    });
    if (runCount >= robot.runLimit) {
      throw new HttpException('Robot run limit reached for the current plan.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const run = await this.prisma.run.create({
      data: {
        id: runId,
        robotId,
        url: body.url,
        status: 'queued',
        startedAt: new Date(),
        result: 'Job accepted and queued for processing.',
      },
    });
    await this.prisma.runLog?.create({
      data: { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, runId: run.id, message: 'Run queued.' },
    }).catch(() => undefined);

    try {
      await this.queueClient.addJob(body.url, robotId, run.id);
    } catch (error) {
      await this.prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          result: error instanceof Error ? error.message : 'Queue rejected the job.',
        },
      });
      throw error;
    }

    return {
      id: run.id,
      robotId: run.robotId,
      url: run.url,
      status: run.status as RunStatus['status'],
      startedAt: this.toIsoString(run.startedAt),
      result: run.result ?? undefined,
    };
  }

  @Get(':id/runs')
  async getRuns(@Param('id') robotId: string, @Req() request?: RequestWithUser): Promise<RunStatus[]> {
    const runs = await this.prisma.run.findMany({
      where: { robotId, ...(request?.user?.workspaceId ? { robot: { workspaceId: request.user.workspaceId } } : {}) },
      orderBy: { startedAt: 'desc' },
    });

    return runs.map((run) => ({
      id: run.id,
      robotId: run.robotId,
      url: run.url,
      status: run.status as RunStatus['status'],
      startedAt: this.toIsoString(run.startedAt),
      finishedAt: run.finishedAt ? this.toIsoString(run.finishedAt) : undefined,
      result: run.result ?? undefined,
    }));
  }

  @Delete(':id/runs/:runId')
  async cancelRun(@Param('id') robotId: string, @Param('runId') runId: string, @Req() request?: RequestWithUser): Promise<{ cancelled: boolean }> {
    const run = await this.prisma.run.findFirst({
      where: {
        id: runId,
        robotId,
        status: { in: ['queued', 'running'] },
        ...(request?.user?.workspaceId ? { robot: { workspaceId: request.user.workspaceId } } : {}),
      },
    });
    if (!run) throw new NotFoundException('Active run not found.');

    await this.queueClient.removeJob(runId).catch(() => false);
    await this.prisma.run.update({
      where: { id: runId },
      data: { status: 'cancelled', finishedAt: new Date(), result: 'Run cancelled by user.' },
    });
    await this.prisma.runLog?.create({
      data: { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, runId, level: 'warn', message: 'Run cancelled by user.' },
    }).catch(() => undefined);
    return { cancelled: true };
  }

  @Get(':id/runs/export.json')
  @Header('Content-Disposition', 'attachment; filename="openscrape-runs.json"')
  async exportJson(@Param('id') robotId: string, @Req() request: RequestWithUser): Promise<RunStatus[]> {
    return this.getRuns(robotId, request);
  }

  @Get(':id/runs/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="openscrape-runs.csv"')
  async exportCsv(@Param('id') robotId: string, @Req() request: RequestWithUser): Promise<string> {
    const runs = await this.getRuns(robotId, request);
    const headers = ['id', 'robotId', 'url', 'status', 'startedAt', 'finishedAt', 'result'];
    const rows = runs.map((run) => headers.map((header) => this.escapeCsv(String(run[header as keyof RunStatus] ?? ''))).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  @Get(':id/runs/:runId/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getRunHtml(@Param('id') robotId: string, @Param('runId') runId: string, @Req() request: RequestWithUser): Promise<string> {
    const run = await this.prisma.run.findFirst({
      where: { id: runId, robotId, ...(request.user?.workspaceId ? { robot: { workspaceId: request.user.workspaceId } } : {}) },
      select: { html: true },
    });

    if (!run?.html) {
      throw new NotFoundException('HTML artifact is not available for this run.');
    }

    return run.html;
  }

  @Get(':id/runs/:runId/screenshot')
  async getRunScreenshot(
    @Param('id') robotId: string,
    @Param('runId') runId: string,
    @Req() request: RequestWithUser,
    @Res() response: Response,
  ): Promise<void> {
    const run = await this.prisma.run.findFirst({
      where: { id: runId, robotId, ...(request.user?.workspaceId ? { robot: { workspaceId: request.user.workspaceId } } : {}) },
      select: { screenshot: true },
    });

    if (!run?.screenshot) {
      throw new NotFoundException('Screenshot artifact is not available for this run.');
    }

    response.type('png').send(run.screenshot);
  }

  private escapeCsv(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private assertSafeUrl(value: string): void {
    const error = validateTargetUrl(value);
    if (error) {
      throw new BadRequestException(error);
    }
  }

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }
}
