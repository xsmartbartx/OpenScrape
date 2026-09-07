import { ArtifactRetentionService } from './artifact-retention.service';

describe('ArtifactRetentionService', () => {
  const originalDays = process.env.ARTIFACT_RETENTION_DAYS;
  const originalInterval = process.env.ARTIFACT_RETENTION_INTERVAL_MS;

  afterEach(() => {
    process.env.ARTIFACT_RETENTION_DAYS = originalDays;
    process.env.ARTIFACT_RETENTION_INTERVAL_MS = originalInterval;
    jest.useRealTimers();
  });

  it('clears artifacts older than the configured age', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 5 });
    const service = new ArtifactRetentionService({ run: { updateMany } } as any);

    await expect(service.removeOlderThan(30)).resolves.toBe(5);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { html: null, screenshot: null },
      where: expect.objectContaining({ OR: [{ html: { not: null } }, { screenshot: { not: null } }] }),
    }));
  });

  it('schedules periodic cleanup when configured', async () => {
    jest.useFakeTimers();
    process.env.ARTIFACT_RETENTION_DAYS = '30';
    process.env.ARTIFACT_RETENTION_INTERVAL_MS = '1000';
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = new ArtifactRetentionService({ run: { updateMany } } as any);

    await service.onModuleInit();
    expect(updateMany).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(updateMany).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });
});
