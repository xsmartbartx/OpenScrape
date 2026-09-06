import { SessionCleanupService } from './session-cleanup.service';

describe('SessionCleanupService', () => {
  it('removes only expired sessions', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const service = new SessionCleanupService({ session: { deleteMany } } as any);

    await expect(service.removeExpiredSessions()).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: expect.any(Date) } },
    });
  });
});
