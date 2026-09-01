import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return a health payload', () => {
    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'api',
      timestamp: expect.any(String),
    });
  });
});
