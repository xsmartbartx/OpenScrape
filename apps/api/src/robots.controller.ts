import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
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

    const queuedJob = await this.queueClient.addJob(body.url, robotId, run.id);

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

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }
}
