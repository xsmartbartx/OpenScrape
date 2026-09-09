export type RobotType = 'recorded' | 'ai' | 'scrape' | 'crawl' | 'search';

export interface CreateRobotInput {
  name: string;
  type: RobotType;
  startUrl: string;
  aiPrompt?: string;
  aiSchema?: Record<string, unknown>;
}

export interface Robot {
  id: string;
  name: string;
  type: RobotType;
  startUrl: string;
  status: 'draft' | 'ready' | 'running' | 'failed';
  aiPrompt?: string;
  aiSchema?: Record<string, unknown>;
}

export interface CreateRunInput {
  robotId: string;
  url: string;
}

export interface RunStatus {
  id: string;
  robotId: string;
  url: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  result?: string;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

