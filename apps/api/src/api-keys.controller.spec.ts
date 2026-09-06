import { ApiKeysController } from './api-keys.controller';

describe('ApiKeysController', () => {
  const request = { user: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner', workspaceId: 'workspace-1' } };

  it('returns the secret only when creating a key', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'key-1', name: 'CLI', createdAt: new Date() });
    const prisma = { apiKey: { create } };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const result = await new ApiKeysController(prisma as any, audit as any).create({ name: 'CLI' }, request as any);

    expect(result.secret).toMatch(/^os_/);
    expect(create.mock.calls[0][0].data.hash).not.toBe(result.secret);
    expect(result).toMatchObject({ id: 'key-1', name: 'CLI' });
  });

  it('revokes only a key owned by the current workspace user', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = { apiKey: { updateMany } };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const result = await new ApiKeysController(prisma as any, audit as any).revoke('key-1', request as any);

    expect(result).toEqual({ revoked: true });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'key-1', userId: 'user-1', workspaceId: 'workspace-1', revokedAt: null },
    }));
  });
});
