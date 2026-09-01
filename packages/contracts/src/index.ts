export type RobotType = 'recorded' | 'ai' | 'scrape' | 'crawl' | 'search';

export interface CreateRobotInput {
  name: string;
  type: RobotType;
  startUrl: string;
}

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}
