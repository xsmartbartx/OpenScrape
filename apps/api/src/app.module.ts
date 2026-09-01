import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { HealthController } from './health.controller';
import { RobotsController } from './robots.controller';

@Module({
  controllers: [AppController, HealthController, RobotsController],
})
export class AppModule {}
