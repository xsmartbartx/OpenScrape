import { chromium } from 'playwright';
import { RecorderRuntimeService } from './recorder-runtime.service';

jest.mock('playwright', () => ({ chromium: { launch: jest.fn() } }));

describe('RecorderRuntimeService', () => {
  it('starts an owned session, streams a frame, and persists an action', async () => {
    const page = {
      route: jest.fn(),
      goto: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('frame')),
      url: jest.fn().mockReturnValue('https://example.com'),
      locator: jest.fn().mockReturnValue({ first: () => ({ click: jest.fn().mockResolvedValue(undefined) }) }),
    };
    const cdp = { send: jest.fn().mockResolvedValue(undefined), on: jest.fn() };
    const context = { newPage: jest.fn().mockResolvedValue(page), newCDPSession: jest.fn().mockResolvedValue(cdp), close: jest.fn().mockResolvedValue(undefined) };
    const browser = { newContext: jest.fn().mockResolvedValue(context), close: jest.fn().mockResolvedValue(undefined) };
    (chromium.launch as jest.Mock).mockResolvedValue(browser);
    const prisma = {
      recorderSession: { update: jest.fn().mockResolvedValue(undefined), updateMany: jest.fn().mockResolvedValue(undefined) },
      session: { findFirst: jest.fn().mockResolvedValue({ user: { memberships: [{ workspaceId: 'workspace-1' }] } }) },
      robotStep: {
        findFirst: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue({ id: 'step-1', action: 'click' }),
      },
    };
    const service = new RecorderRuntimeService(prisma as any);
    const client = { readyState: 1, send: jest.fn(), close: jest.fn() } as any;

    await service.start('recorder-1', 'workspace-1', 'robot-1', 'https://example.com');
    service.register(client);
    await service.handleMessage(client, JSON.stringify({ type: 'attach', sessionId: 'recorder-1', token: 'session-token' }));
    await service.handleMessage(client, JSON.stringify({ type: 'click', selector: '[data-testid="buy"]' }));

    expect(client.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ready"'));
    expect(client.send).toHaveBeenCalledWith(expect.stringContaining('"type":"frame"'));
    expect(prisma.robotStep.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'click', robotId: 'robot-1' }) }));
    await service.stop('recorder-1', 'test');
  });
});