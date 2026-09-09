import { ResultsController } from './results.controller';

describe('ResultsController', () => {
  it('paginates structured results inside the current workspace', async () => {
    const prisma = {
      run: { findFirst: jest.fn().mockResolvedValue({ id: 'run-1' }) },
      result: {
        findMany: jest.fn().mockResolvedValue([{ id: 'result-1', data: { title: 'Example' } }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const result = await new ResultsController(prisma as any).list('robot-1', 'run-1', '1', '25', {
      user: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner', workspaceId: 'workspace-1' },
    } as any);

    expect(result).toMatchObject({ page: 1, pageSize: 25, total: 1, totalPages: 1 });
    expect(prisma.run.findFirst).toHaveBeenCalledWith({ where: { id: 'run-1', robotId: 'robot-1', robot: { workspaceId: 'workspace-1' } }, select: { id: true } });
  });
});
