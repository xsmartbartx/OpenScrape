import { RecorderSessionsController } from './recorder-sessions.controller';

describe('RecorderSessionsController', () => {
  const request = { user: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner', workspaceId: 'workspace-1' } };

  it('creates a workspace-scoped recorder session', async () => {
    const session = { id: 'recorder-1', robotId: 'robot-1', workspaceId: 'workspace-1', status: 'created', startUrl: 'https://example.com' };
    const prisma = {
      robot: { findFirst: jest.fn().mockResolvedValue({ id: 'robot-1', startUrl: 'https://example.com' }) },
      recorderSession: { create: jest.fn().mockResolvedValue(session) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const result = await new RecorderSessionsController(prisma as any, audit as any).start('robot-1', {}, request as any);

    expect(result).toEqual(session);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'recorder_session.create' }));
  });
});
