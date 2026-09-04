import { RobotsController } from './robots.controller';

describe('RobotsController', () => {
  it('rejects private network targets before queueing', async () => {
    const addJob = jest.fn();
    const controller = new RobotsController({ addJob } as any, {} as any);

    await expect(controller.createRun('robot-1', { url: 'http://127.0.0.1:8080/admin' })).rejects.toThrow(
      'Private and local network targets are not allowed.',
    );
    expect(addJob).not.toHaveBeenCalled();
  });

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

    expect(addJob).toHaveBeenCalledWith('https://example.com', 'robot-1', expect.any(String));
    expect(runCreate).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
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
      id: expect.any(String),
    });
  });
});
