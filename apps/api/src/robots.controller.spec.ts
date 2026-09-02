import { RobotsController } from './robots.controller';

describe('RobotsController', () => {
  it('should queue a scrape job and return queued status', async () => {
    const addJob = jest.fn().mockResolvedValue({ id: 'job-123' });
    const controller = new RobotsController({ addJob } as any);

    const result = await controller.createRun('robot-1', { url: 'https://example.com' });

    expect(addJob).toHaveBeenCalledWith('https://example.com', 'robot-1');
    expect(result).toMatchObject({
      robotId: 'robot-1',
      url: 'https://example.com',
      status: 'queued',
      id: 'job-123',
    });
  });
});
