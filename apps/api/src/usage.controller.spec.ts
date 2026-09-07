import { UsageController } from './usage.controller';

describe('UsageController', () => {
  it('reports usage only for the current workspace', async () => {
    const periodStart = new Date('2026-09-01T00:00:00.000Z');
    const prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ plan: 'free' }) },
      robot: { findMany: jest.fn().mockResolvedValue([{ runLimit: 100, periodStart }]) },
      run: { count: jest.fn().mockResolvedValue(3) },
    };

    const result = await new UsageController(prisma as any).getUsage({
      user: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner', workspaceId: 'workspace-1' },
    } as any);

    expect(result).toMatchObject({ workspaceId: 'workspace-1', plan: 'free', runs: { used: 3, limit: 100 }, remaining: 97 });
    expect(prisma.run.count).toHaveBeenCalledWith({ where: { robot: { workspaceId: 'workspace-1' }, startedAt: { gte: periodStart } } });
  });
});
