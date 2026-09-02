import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { HealthController } from './health.controller';
import { RobotsController } from './robots.controller';

const queueClient = {
  addJob: async (url: string, robotId: string) => {
    console.log(`Queueing scrape for robot ${robotId}, url ${url}`);
    return { id: `job-${Date.now()}` };
  },
};

@Module({
  controllers: [AppController, HealthController, RobotsController],
  providers: [
    {
      provide: 'QUEUE_CLIENT',
      useValue: queueClient,
    },
  ],
})
export class AppModule {}
