import { WorkspaceController } from './workspace.controller';

describe('Workspace retention', () => {
  const request = { user: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner', workspaceId: 'workspace-1' } };

  it('removes old artifacts only inside the owner workspace', async () => {
    const runUpdate = jest.fn().mockResolvedValue({ count: 4 });
    const prisma = {
      membership: { findUnique: jest.fn().mockResolvedValue({ role: 'owner' }) },
      run: { updateMany: runUpdate },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const result = await new WorkspaceController(prisma as any, audit as any).deleteOldArtifacts({ olderThanDays: 30 }, request as any);

    expect(result).toEqual({ deletedRuns: 4, olderThanDays: 30 });
    expect(runUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ robot: { workspaceId: 'workspace-1' }, html: undefined }),
      data: { html: null, screenshot: null },
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'workspace.retention.artifacts',
      metadata: { olderThanDays: 30, deletedArtifacts: 4 },
    }));
  });
});
