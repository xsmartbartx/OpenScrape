import { RobotsController } from './robots.controller';

describe('RobotsController', () => {
  it('should queue a scrape job and persist a run record', async () => {
    const addJob = jest.fn().mockResolvedValue({ id: 'job-123' });
    const runCreate = jest.fn().mockResolvedValue({
      id: 'job-123',
      robotId: 'robot-1',
      url: 'https://example.com',
      status: 'queued',
      startedAt: '2026-09-02T00:00:00.000Z',
      result: 'Job accepted and queued for processing.',
    });
    const repo = {
      run: { create: runCreate },
      robot: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'robot-1', name: 'Robot robot-1' }),
      },
    };

    const controller = new RobotsController({ addJob } as any, repo as any);

    const result = await controller.createRun('robot-1', { url: 'https://example.com' });

    expect(addJob).toHaveBeenCalledWith('https://example.com', 'robot-1');
    expect(runCreate).toHaveBeenCalledWith({
      data: {
        id: 'job-123',
        robotId: 'robot-1',
        url: 'https://example.com',
        status: 'queued',
        startedAt: expect.any(Date),
        result: 'Job accepted and queued for processing.',
      },
    });
    expect(result).toMatchObject({
      robotId: 'robot-1',
      url: 'https://example.com',
      status: 'queued',
      id: 'job-123',
    });
  });
});
