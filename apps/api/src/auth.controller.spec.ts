import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('registers a user and returns a session token without exposing the password hash', async () => {
    const userCreate = jest.fn().mockResolvedValue({ id: 'user-1', email: 'owner@example.com', displayName: 'Owner' });
    const workspaceCreate = jest.fn().mockResolvedValue({ id: 'workspace-1' });
    const sessionCreate = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null), create: userCreate },
      workspace: { create: workspaceCreate },
      session: { create: sessionCreate },
    };

    const result = await new AuthController(prisma as any).register({
      email: 'Owner@Example.com',
      displayName: 'Owner',
      password: 'correct horse battery staple',
    });

    expect(result).toMatchObject({ user: { id: 'user-1', workspaceId: 'workspace-1' } });
    expect(result.token).toEqual(expect.any(String));
    expect(userCreate.mock.calls[0][0].data.passwordHash).toMatch(/^scrypt\$/);
    expect(sessionCreate.mock.calls[0][0].data.tokenHash).not.toBe(result.token);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects an invalid password during login', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: 'owner@example.com', passwordHash: 'scrypt$bad$00' }) },
      membership: { findFirst: jest.fn() },
      session: { create: jest.fn() },
    };

    await expect(new AuthController(prisma as any).login({ email: 'owner@example.com', password: 'incorrect password' })).rejects.toThrow(
      'Invalid email or password.',
    );
  });
});
