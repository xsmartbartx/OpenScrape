import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { WebSocket } from 'ws';
import { PrismaService } from './prisma.service';
import { validateTargetUrl } from './url-validation';

type RecorderAction = {
  type?: string;
  selector?: string;
  value?: string;
  x?: number;
  y?: number;
};

type SessionRuntime = {
  sessionId: string;
  workspaceId: string;
  robotId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  clients: Set<WebSocket>;
  expiresAt: number;
  expiryTimer: NodeJS.Timeout;
};

type ClientState = { sessionId?: string; workspaceId?: string };

const maxSessionMs = 10 * 60 * 1000;
const maxActionValueLength = 2000;
const maxMessageBytes = 16 * 1024;

@Injectable()
export class RecorderRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RecorderRuntimeService.name);
  private readonly sessions = new Map<string, SessionRuntime>();
  private readonly clients = new Map<WebSocket, ClientState>();

  constructor(private readonly prisma: PrismaService) {}

  async start(sessionId: string, workspaceId: string, robotId: string, startUrl: string): Promise<void> {
    if (this.sessions.has(sessionId)) return;
    const urlError = validateTargetUrl(startUrl);
    if (urlError) throw new Error(urlError);

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      await page.route('**/*', async (route) => {
        const requestUrl = route.request().url();
        if (validateTargetUrl(requestUrl)) {
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      const expiresAt = Date.now() + maxSessionMs;
      const runtime: SessionRuntime = {
        sessionId,
        workspaceId,
        robotId,
        browser,
        context,
        page,
        clients: new Set(),
        expiresAt,
        expiryTimer: setTimeout(() => void this.stop(sessionId, 'expired'), maxSessionMs),
      };
      this.sessions.set(sessionId, runtime);
      await this.prisma.recorderSession.update({
        where: { id: sessionId },
        data: { status: 'running', startedAt: new Date() },
      });
      this.logger.log(JSON.stringify({ event: 'recorder.started', sessionId, workspaceId }));
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  register(client: WebSocket): void {
    this.clients.set(client, {});
  }

  unregister(client: WebSocket): void {
    const state = this.clients.get(client);
    if (state?.sessionId) this.sessions.get(state.sessionId)?.clients.delete(client);
    this.clients.delete(client);
  }

  async handleMessage(client: WebSocket, rawMessage: unknown): Promise<void> {
    const message = Buffer.isBuffer(rawMessage) ? rawMessage : Buffer.from(String(rawMessage ?? ''));
    if (message.byteLength > maxMessageBytes) {
      this.send(client, { type: 'error', message: 'Recorder message is too large.' });
      return;
    }

    let input: (RecorderAction & { token?: string; sessionId?: string }) | undefined;
    try {
      input = JSON.parse(message.toString('utf8')) as RecorderAction & { token?: string; sessionId?: string };
    } catch {
      this.send(client, { type: 'error', message: 'Recorder message must be valid JSON.' });
      return;
    }

    if (input.type === 'attach') {
      await this.attach(client, input.sessionId, input.token);
      return;
    }

    const state = this.clients.get(client);
    if (!state?.sessionId || !state.workspaceId) {
      this.send(client, { type: 'error', message: 'Attach the WebSocket to an authenticated recorder session first.' });
      return;
    }
    const runtime = this.sessions.get(state.sessionId);
    if (!runtime || runtime.workspaceId !== state.workspaceId) {
      this.send(client, { type: 'error', message: 'Recorder session is no longer available.' });
      return;
    }

    try {
      await this.executeAction(runtime, input);
    } catch (error) {
      this.send(client, { type: 'error', message: error instanceof Error ? error.message : 'Recorder action failed.' });
    }
  }

  async stop(sessionId: string, reason = 'stopped'): Promise<void> {
    const runtime = this.sessions.get(sessionId);
    if (!runtime) return;
    clearTimeout(runtime.expiryTimer);
    for (const client of runtime.clients) this.send(client, { type: 'stopped', reason });
    this.sessions.delete(sessionId);
    for (const client of runtime.clients) {
      this.clients.delete(client);
      try { client.close(); } catch { /* connection already closed */ }
    }
    await runtime.context.close().catch(() => undefined);
    await runtime.browser.close().catch(() => undefined);
    await this.prisma.recorderSession.updateMany({
      where: { id: sessionId, status: { not: 'stopped' } },
      data: { status: 'stopped', stoppedAt: new Date() },
    });
    this.logger.log(JSON.stringify({ event: 'recorder.stopped', sessionId, reason }));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.stop(sessionId, 'shutdown')));
  }

  private async attach(client: WebSocket, sessionId: string | undefined, token: string | undefined): Promise<void> {
    if (!sessionId || !token) {
      this.send(client, { type: 'error', message: 'sessionId and token are required.' });
      return;
    }
    const session = await this.prisma.session.findFirst({
      where: { tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: { gt: new Date() } },
      include: { user: { include: { memberships: true } } },
    });
    const workspaceId = session?.user.memberships[0]?.workspaceId;
    const runtime = this.sessions.get(sessionId);
    if (!session || !workspaceId || !runtime || runtime.workspaceId !== workspaceId) {
      this.send(client, { type: 'error', message: 'Invalid session or recorder ownership.' });
      return;
    }

    const previous = this.clients.get(client);
    if (previous?.sessionId) this.sessions.get(previous.sessionId)?.clients.delete(client);
    this.clients.set(client, { sessionId, workspaceId });
    runtime.clients.add(client);
    this.send(client, { type: 'ready', sessionId, expiresAt: runtime.expiresAt });
    await this.sendFrame(runtime, client);
  }

  private async executeAction(runtime: SessionRuntime, input: RecorderAction): Promise<void> {
    const action = input.type;
    if (!action || !['goto', 'click', 'fill', 'type', 'wait'].includes(action)) throw new Error('Unsupported recorder action.');
    const selector = input.selector?.trim();
    const value = input.value ?? '';
    if (value.length > maxActionValueLength) throw new Error('Recorder action value is too long.');

    if (action === 'goto') {
      const urlError = validateTargetUrl(value);
      if (urlError) throw new Error(`Navigation blocked: ${urlError}`);
      await runtime.page.goto(value, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } else if (action === 'click') {
      if (Number.isFinite(input.x) && Number.isFinite(input.y)) {
        await runtime.page.mouse.click(Number(input.x), Number(input.y));
      } else if (selector) {
        await runtime.page.locator(this.toPlaywrightSelector(selector)).first().click({ timeout: 30_000 });
      } else {
        throw new Error('click requires selector or coordinates.');
      }
    } else if (action === 'fill' || action === 'type') {
      if (!selector) throw new Error(`${action} requires a selector.`);
      await runtime.page.locator(this.toPlaywrightSelector(selector)).first().fill(value, { timeout: 30_000 });
    } else {
      const waitMs = Math.min(Math.max(Number(value || 500), 0), 30_000);
      await runtime.page.waitForTimeout(waitMs);
    }

    const step = await this.persistStep(runtime, action, selector, value, input.x, input.y);
    this.broadcast(runtime, { type: 'step', step });
    await this.sendFrame(runtime);
  }

  private async persistStep(runtime: SessionRuntime, action: string, selector: string | undefined, value: string, x?: number, y?: number) {
    const last = await this.prisma.robotStep.findFirst({ where: { robotId: runtime.robotId }, orderBy: { orderIndex: 'desc' } });
    return this.prisma.robotStep.create({
      data: {
        id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        robotId: runtime.robotId,
        orderIndex: (last?.orderIndex ?? -1) + 1,
        action,
        selector: selector ? { candidates: [{ kind: 'css', value: selector, score: 1, reason: 'live recorder action' }] } : undefined,
        value: value || undefined,
        options: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined,
      },
    });
  }

  private async sendFrame(runtime: SessionRuntime, target?: WebSocket): Promise<void> {
    const image = await runtime.page.screenshot({ type: 'jpeg', quality: 70 });
    const payload = { type: 'frame', url: runtime.page.url(), mimeType: 'image/jpeg', data: image.toString('base64') };
    if (target) this.send(target, payload);
    else this.broadcast(runtime, payload);
  }

  private broadcast(runtime: SessionRuntime, payload: unknown): void {
    for (const client of runtime.clients) this.send(client, payload);
  }

  private send(client: WebSocket, payload: unknown): void {
    if (client.readyState === 1) client.send(JSON.stringify(payload));
  }

  private toPlaywrightSelector(selector: string): string {
    return selector.startsWith('//') ? `xpath=${selector}` : selector;
  }
}