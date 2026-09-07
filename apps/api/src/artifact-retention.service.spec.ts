import { ArtifactRetentionService } from './artifact-retention.service';

describe('ArtifactRetentionService', () => {
  it('clears artifacts older than the configured age', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 5 });
    const service = new ArtifactRetentionService({ run: { updateMany } } as any);

    await expect(service.removeOlderThan(30)).resolves.toBe(5);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { html: null, screenshot: null },
      where: expect.objectContaining({ OR: [{ html: { not: null } }, { screenshot: { not: null } }] }),
    }));
  });
});
