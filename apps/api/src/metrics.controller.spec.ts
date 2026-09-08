import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  it('aggregates status metrics for the current workspace', async () => {
    const prisma = {
      robot: { count: jest.fn().mockResolvedValue(3) },
      schedule: { count: jest.fn().mockResolvedValue(2) },
      run: { groupBy: jest.fn().mockResolvedValue([
        { status: 'success', _count: { _all: 8 } },
        { status: 'failed', _count: { _all: 1 } },
      ]) },
    };
    const result = await new MetricsController(prisma as any).workspace({
      user: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner', workspaceId: 'workspace-1' },
    } as any);

    expect(result).toEqual({
      workspaceId: 'workspace-1',
      robots: 3,
      activeSchedules: 2,
      runs: { queued: 0, running: 0, success: 8, failed: 1, cancelled: 0 },
    });
  });
});
