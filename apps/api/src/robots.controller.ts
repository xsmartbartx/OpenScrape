import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { CreateRobotInput, CreateRunInput, Robot, RunStatus } from '@openscrape/contracts';

const robots: Robot[] = [
  {
    id: 'robot-1',
    name: 'Product feed',
    type: 'scrape',
    startUrl: 'https://example.com/products',
    status: 'ready',
  },
];

const runs: RunStatus[] = [];

@Controller('robots')
export class RobotsController {
  @Get()
  getRobots(): Robot[] {
    return robots;
  }

  @Post()
  createRobot(@Body() body: CreateRobotInput): Robot {
    const robot: Robot = {
      id: `robot-${Date.now()}`,
      name: body.name,
      type: body.type,
      startUrl: body.startUrl,
      status: 'ready',
    };

    robots.push(robot);
    return robot;
  }

  @Post(':id/runs')
  createRun(@Param('id') robotId: string, @Body() body: Pick<CreateRunInput, 'url'>): RunStatus {
    const run: RunStatus = {
      id: `run-${Date.now()}`,
      robotId,
      url: body.url,
      status: 'queued',
      startedAt: new Date().toISOString(),
      result: 'Job accepted and queued for processing.',
    };

    runs.push(run);
    return run;
  }

  @Get(':id/runs')
  getRuns(@Param('id') robotId: string): RunStatus[] {
    return runs.filter((run) => run.robotId === robotId);
  }
}
