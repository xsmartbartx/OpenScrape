import { ExecutionContext } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const originalRequired = process.env.API_KEYS_REQUIRED;
  const originalHash = process.env.API_KEY_HASH;

  afterEach(() => {
    process.env.API_KEYS_REQUIRED = originalRequired;
    process.env.API_KEY_HASH = originalHash;
  });

  const contextFor = (path: string, key?: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({ path, header: () => key }),
    }),
  }) as unknown as ExecutionContext;

  it('allows health checks without a key', () => {
    process.env.API_KEYS_REQUIRED = 'true';
    expect(new ApiKeyGuard({} as any).canActivate(contextFor('/api/v1/health'))).resolves.toBe(true);
  });

  it('rejects missing keys and accepts the configured key', async () => {
    process.env.API_KEYS_REQUIRED = 'true';
    process.env.API_KEY_HASH = createHash('sha256').update('secret').digest('hex');
    const prisma = { apiKey: { findFirst: jest.fn().mockResolvedValue(null) } };
    const guard = new ApiKeyGuard(prisma as any);

    await expect(guard.canActivate(contextFor('/api/v1/robots'))).rejects.toThrow('API key required.');
    await expect(guard.canActivate(contextFor('/api/v1/robots', 'secret'))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor('/api/v1/robots', 'wrong'))).rejects.toThrow('Invalid API key.');
  });
});
