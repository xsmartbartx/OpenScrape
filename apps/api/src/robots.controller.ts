import { Body, Controller, Get, Header, Inject, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { CreateRobotInput, CreateRunInput, Robot, RunStatus } from '@openscrape/contracts';
import { PrismaService } from './prisma.service';

export type QueueClient = {
  addJob: (url: string, robotId: string, jobId?: string) => Promise<{ id: string }>;
};

@Controller('robots')
export class RobotsController {
  constructor(
    @Inject('QUEUE_CLIENT') private readonly queueClient: QueueClient,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getRobots(): Promise<Robot[]> {
    const robots = await this.prisma.robot.findMany();

    return robots.map((robot) => ({
      id: robot.id,
      name: robot.name,
      type: robot.type as Robot['type'],
      startUrl: robot.startUrl,
      status: robot.status as Robot['status'],
    }));
  }

  @Post()
  async createRobot(@Body() body: CreateRobotInput): Promise<Robot> {
    const robot = await this.prisma.robot.create({
      data: {
        id: `robot-${Date.now()}`,
        name: body.name,
        type: body.type,
        startUrl: body.startUrl,
        status: 'ready',
      },
    });

    return {
      id: robot.id,
      name: robot.name,
      type: robot.type as Robot['type'],
      startUrl: robot.startUrl,
      status: robot.status as Robot['status'],
    };
  }

  @Post(':id/runs')
  async createRun(@Param('id') robotId: string, @Body() body: Pick<CreateRunInput, 'url'>): Promise<RunStatus> {
    const existingRobot = await this.prisma.robot.findUnique({ where: { id: robotId } });

    if (!existingRobot) {
      await this.prisma.robot.create({
        data: {
          id: robotId,
          name: `Robot ${robotId}`,
          type: 'scrape',
          startUrl: body.url,
          status: 'ready',
        },
      });
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

    await this.queueClient.addJob(body.url, robotId, run.id);

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
  async getRuns(@Param('id') robotId: string): Promise<RunStatus[]> {
    const runs = await this.prisma.run.findMany({
      where: { robotId },
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

  @Get(':id/runs/export.json')
  @Header('Content-Disposition', 'attachment; filename="openscrape-runs.json"')
  async exportJson(@Param('id') robotId: string): Promise<RunStatus[]> {
    return this.getRuns(robotId);
  }

  @Get(':id/runs/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="openscrape-runs.csv"')
  async exportCsv(@Param('id') robotId: string): Promise<string> {
    const runs = await this.getRuns(robotId);
    const headers = ['id', 'robotId', 'url', 'status', 'startedAt', 'finishedAt', 'result'];
    const rows = runs.map((run) => headers.map((header) => this.escapeCsv(String(run[header as keyof RunStatus] ?? ''))).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  @Get(':id/runs/:runId/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getRunHtml(@Param('id') robotId: string, @Param('runId') runId: string): Promise<string> {
    const run = await this.prisma.run.findFirst({
      where: { id: runId, robotId },
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
    @Res() response: Response,
  ): Promise<void> {
    const run = await this.prisma.run.findFirst({
      where: { id: runId, robotId },
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

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }
}
