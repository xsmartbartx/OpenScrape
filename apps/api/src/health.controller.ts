import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReadiness() {
    const dependencies = await this.health.checkDependencies();
    if (!dependencies.ready) {
      throw new HttpException({ status: 'not_ready', ...dependencies }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return { status: 'ready', service: 'api', ...dependencies, timestamp: new Date().toISOString() };
  }
}
