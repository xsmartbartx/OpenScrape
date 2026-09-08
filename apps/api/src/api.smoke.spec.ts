import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import type { Response } from 'supertest';
import { AppModule } from './app.module';
import { ArtifactRetentionService } from './artifact-retention.service';
import { HealthService } from './health.service';
import { PrismaService } from './prisma.service';
import { SessionCleanupService } from './session-cleanup.service';


describe('API smoke', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(HealthService).useValue({ checkDependencies: jest.fn().mockResolvedValue({ database: 'ok', redis: 'ok', ready: true }) })
      .overrideProvider(SessionCleanupService).useValue({})
      .overrideProvider(ArtifactRetentionService).useValue({})
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves liveness and readiness at the versioned API prefix', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response: Response) => expect(response.body).toMatchObject({ status: 'ok', service: 'api' }));

    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect((response: Response) => expect(response.body).toMatchObject({ status: 'ready', database: 'ok', redis: 'ok' }));
  });
});
