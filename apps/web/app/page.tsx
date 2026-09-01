'use client';

import { FormEvent, useEffect, useState } from 'react';

type Robot = {
  id: string;
  name: string;
  type: 'recorded' | 'ai' | 'scrape' | 'crawl' | 'search';
  startUrl: string;
  status: 'draft' | 'ready' | 'running' | 'failed';
};

type RunStatus = {
  id: string;
  robotId: string;
  url: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  startedAt: string;
  result?: string;
};

const defaultForm = {
  name: 'Example product list',
  type: 'scrape' as const,
  startUrl: 'https://example.com/products',
};

export default function HomePage() {
  const [robots, setRobots] = useState<Robot[]>([]);
  const [runs, setRuns] = useState<RunStatus[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);

  const fetchRobots = async () => {
    const response = await fetch('http://localhost:3001/api/v1/robots');
    const data = await response.json();
    setRobots(data);
  };

  const fetchRuns = async (robotId: string) => {
    const response = await fetch(`http://localhost:3001/api/v1/robots/${robotId}/runs`);
    const data = await response.json();
    setRuns(data);
  };

  useEffect(() => {
    void fetchRobots();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const response = await fetch('http://localhost:3001/api/v1/robots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const created = await response.json();
    await fetchRobots();
    await fetchRuns(created.id);
    setLoading(false);
  };

  const onRunRobot = async (robotId: string, url: string) => {
    await fetch(`http://localhost:3001/api/v1/robots/${robotId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    await fetchRuns(robotId);
  };

  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">OpenScrape</p>
          <h1>Turn websites into structured data.</h1>
        </div>
      </header>

      <section className="grid two-column">
        <form className="card" onSubmit={onSubmit}>
          <h2>Create robot</h2>
          <label>
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            Type
            <select
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as typeof form.type }))}
            >
              <option value="scrape">scrape</option>
              <option value="recorded">recorded</option>
              <option value="ai">ai</option>
              <option value="crawl">crawl</option>
              <option value="search">search</option>
            </select>
          </label>
          <label>
            Start URL
            <input
              value={form.startUrl}
              onChange={(event) => setForm((current) => ({ ...current, startUrl: event.target.value }))}
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create robot'}
          </button>
        </form>

        <div className="card">
          <h2>Robots</h2>
          {robots.length === 0 ? (
            <p>No robots yet.</p>
          ) : (
            <ul className="robot-list">
              {robots.map((robot) => (
                <li key={robot.id}>
                  <div>
                    <strong>{robot.name}</strong>
                    <span>{robot.type}</span>
                  </div>
                  <button type="button" onClick={() => onRunRobot(robot.id, robot.startUrl)}>
                    Run
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card run-panel">
        <h2>Recent runs</h2>
        {runs.length === 0 ? (
          <p>Run history will appear here.</p>
        ) : (
          <ul className="run-list">
            {runs.map((run) => (
              <li key={run.id}>
                <div>
                  <strong>{run.robotId}</strong>
                  <span>{run.url}</span>
                </div>
                <div className="meta">
                  <span>{run.status}</span>
                  <small>{new Date(run.startedAt).toLocaleString()}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
