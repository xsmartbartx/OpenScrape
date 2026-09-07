import { WorkspaceController } from './workspace.controller';

describe('WorkspaceController', () => {
  const request = { user: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner', workspaceId: 'workspace-1' } };

  it('requires exact workspace confirmation before deletion', async () => {
    const prisma = { membership: { findUnique: jest.fn() }, workspace: { delete: jest.fn() } };
    const audit = { record: jest.fn() };
    const controller = new WorkspaceController(prisma as any, audit as any);

    await expect(controller.deleteWorkspace({ confirmation: 'wrong' }, request as any)).rejects.toThrow(
      'Workspace confirmation does not match.',
    );
    expect(prisma.workspace.delete).not.toHaveBeenCalled();
  });

  it('allows only the owner to delete the workspace', async () => {
    const prisma = {
      membership: { findUnique: jest.fn().mockResolvedValue({ role: 'owner' }) },
      workspace: { delete: jest.fn().mockResolvedValue(undefined) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const controller = new WorkspaceController(prisma as any, audit as any);

    await expect(controller.deleteWorkspace({ confirmation: 'workspace-1' }, request as any)).resolves.toEqual({ deleted: true });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'workspace.delete', workspaceId: 'workspace-1' }));
  });
});
