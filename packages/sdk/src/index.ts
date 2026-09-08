import type { CreateRobotInput, Robot, RunStatus } from '@openscrape/contracts';

export type OpenScrapeClientOptions = {
  baseUrl: string;
  token?: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
};

export type WorkspaceUsage = {
  workspaceId: string;
  plan: string;
  periodStart: string;
  runs: { used: number; limit: number };
  remaining: number;
};

export type WorkspaceMetrics = {
  workspaceId: string;
  robots: number;
  activeSchedules: number;
  runs: Record<'queued' | 'running' | 'success' | 'failed' | 'cancelled', number>;
};

export type Schedule = {
  id: string;
  robotId: string;
  workspaceId: string;
  intervalMs: number;
  active: boolean;
};

export type ApiKeyMetadata = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

export class OpenScrapeApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'OpenScrapeApiError';
  }
}

export class OpenScrapeClient {
  private readonly baseUrl: string;
  private readonly headers: HeadersInit;
  private readonly request: typeof globalThis.fetch;

  constructor(options: OpenScrapeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.request = options.fetch ?? globalThis.fetch;
    this.headers = {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.apiKey ? { 'x-api-key': options.apiKey } : {}),
    };
  }

  listRobots(): Promise<Robot[]> {
    return this.get('/robots');
  }

  createRobot(input: CreateRobotInput): Promise<Robot> {
    return this.post('/robots', input);
  }

  listRuns(robotId: string): Promise<RunStatus[]> {
    return this.get(`/robots/${encodeURIComponent(robotId)}/runs`);
  }

  runRobot(robotId: string, url: string): Promise<RunStatus> {
    return this.post(`/robots/${encodeURIComponent(robotId)}/runs`, { url });
  }

  cancelRun(robotId: string, runId: string): Promise<{ cancelled: boolean }> {
    return this.delete(`/robots/${encodeURIComponent(robotId)}/runs/${encodeURIComponent(runId)}`);
  }

  getUsage(): Promise<WorkspaceUsage> {
    return this.get('/usage');
  }

  getMetrics(): Promise<WorkspaceMetrics> {
    return this.get('/metrics/workspace');
  }

  listSchedules(): Promise<Schedule[]> {
    return this.get('/schedules');
  }

  createSchedule(robotId: string, intervalMs: number): Promise<Schedule> {
    return this.post('/schedules', { robotId, intervalMs });
  }

  deleteSchedule(scheduleId: string): Promise<{ deleted: boolean }> {
    return this.delete(`/schedules/${encodeURIComponent(scheduleId)}`);
  }

  listApiKeys(): Promise<ApiKeyMetadata[]> {
    return this.get('/api-keys');
  }

  createApiKey(name: string): Promise<ApiKeyMetadata & { secret: string }> {
    return this.post('/api-keys', { name });
  }

  revokeApiKey(keyId: string): Promise<{ revoked: boolean }> {
    return this.delete(`/api-keys/${encodeURIComponent(keyId)}`);
  }

  listAuditEvents(): Promise<unknown[]> {
    return this.get('/audit');
  }

  private async get<T>(path: string): Promise<T> {
    return this.send<T>(path, { method: 'GET' });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async delete<T>(path: string): Promise<T> {
    return this.send<T>(path, { method: 'DELETE' });
  }

  private async send<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...init.headers },
    });
    const data = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = typeof data?.message === 'string' ? data.message : `OpenScrape API request failed with ${response.status}.`;
      throw new OpenScrapeApiError(response.status, message);
    }
    return data as T;
  }
}
