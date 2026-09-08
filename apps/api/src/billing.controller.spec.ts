import { createHmac } from 'node:crypto';
import { BillingController } from './billing.controller';

describe('BillingController', () => {
  const body = JSON.stringify({ id: 'evt-1', workspaceId: 'workspace-1', plan: 'pro', status: 'active' });

  it('accepts a signed event and is idempotent', async () => {
    process.env.BILLING_WEBHOOK_SECRET = 'test-secret';
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', 'test-secret').update(`${timestamp}.${body}`).digest('hex');
    const prisma = {
      billingEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      subscription: { upsert: jest.fn() },
    };
    const controller = new BillingController(prisma as any);
    const request = { params: { provider: 'stripe' }, rawBody: Buffer.from(body) };

    await expect(controller.webhook(request as any, signature, 'evt-1', 'subscription.updated', timestamp)).resolves.toEqual({ accepted: true, duplicate: false });
    expect(prisma.billingEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ provider: 'stripe', eventId: 'evt-1' }) }));
    expect(prisma.subscription.upsert).toHaveBeenCalled();
  });

  it('rejects an invalid signature', async () => {
    process.env.BILLING_WEBHOOK_SECRET = 'test-secret';
    const controller = new BillingController({} as any);
    const request = { params: { provider: 'stripe' }, rawBody: Buffer.from(body) };

    await expect(controller.webhook(request as any, 'bad', 'evt-1', 'subscription.updated', String(Date.now()))).rejects.toThrow('Invalid billing signature.');
  });
});
