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

type ScrapeResult = {
  title?: string;
  snippet?: string;
};

function parseResult(result?: string): ScrapeResult | undefined {
  if (!result) return undefined;

  try {
    return JSON.parse(result) as ScrapeResult;
  } catch {
    return undefined;
  }
}

const defaultForm = {
  name: 'Example product list',
  type: 'scrape' as const,
  startUrl: 'https://example.com/products',
};

export default function HomePage() {
  const [robots, setRobots] = useState<Robot[]>([]);
  const [runs, setRuns] = useState<RunStatus[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>();
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const fetchRobots = async () => {
    const response = await fetch('http://localhost:3001/api/v1/robots');
    if (!response.ok) throw new Error('Could not load robots.');
    const data = await response.json();
    setRobots(data);
    setSelectedRobotId((current) => current ?? data[0]?.id);
  };

  const fetchRuns = async (robotId: string) => {
    const response = await fetch(`http://localhost:3001/api/v1/robots/${robotId}/runs`);
    if (!response.ok) throw new Error('Could not load run history.');
    const data = await response.json();
    setRuns(data);
  };

  useEffect(() => {
    void fetchRobots().catch((loadError: Error) => setError(loadError.message));
  }, []);

  useEffect(() => {
    if (!selectedRobotId) return;

    void fetchRuns(selectedRobotId).catch((loadError: Error) => setError(loadError.message));
    const interval = window.setInterval(() => {
      void fetchRuns(selectedRobotId).catch((loadError: Error) => setError(loadError.message));
    }, 2000);

    return () => window.clearInterval(interval);
  }, [selectedRobotId]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      const response = await fetch('http://localhost:3001/api/v1/robots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error('Could not create robot.');

      const created = await response.json();
      setSelectedRobotId(created.id);
      await fetchRobots();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unexpected error.');
    } finally {
      setLoading(false);
    }
  };

  const onRunRobot = async (robotId: string, url: string) => {
    setSelectedRobotId(robotId);
    setError(undefined);

    try {
      const response = await fetch(`http://localhost:3001/api/v1/robots/${robotId}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error('Could not start robot.');
      await fetchRuns(robotId);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Unexpected error.');
    }
  };

  return (
    <main className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">OpenScrape</p>
          <h1>Turn websites into structured data.</h1>
        </div>
      </header>

      {error ? <p className="error-message" role="alert">{error}</p> : null}

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
                  <div className="robot-actions">
                    <button type="button" className={selectedRobotId === robot.id ? 'selected' : ''} onClick={() => setSelectedRobotId(robot.id)}>
                      View
                    </button>
                    <button type="button" onClick={() => onRunRobot(robot.id, robot.startUrl)}>
                      Run
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card run-panel">
        <div className="panel-heading">
          <h2>Recent runs</h2>
          {selectedRobotId ? (
            <div className="export-actions">
              <a href={`http://localhost:3001/api/v1/robots/${selectedRobotId}/runs/export.json`} download>JSON</a>
              <a href={`http://localhost:3001/api/v1/robots/${selectedRobotId}/runs/export.csv`} download>CSV</a>
            </div>
          ) : null}
        </div>
        {runs.length === 0 ? (
          <p>Run history will appear here.</p>
        ) : (
          <ul className="run-list">
            {runs.map((run) => (
              <li key={run.id} className="run-item">
                <div>
                  <strong>{run.robotId}</strong>
                  <span>{run.url}</span>
                  {parseResult(run.result)?.title ? <b>{parseResult(run.result)?.title}</b> : null}
                  {parseResult(run.result)?.snippet ? <p>{parseResult(run.result)?.snippet}</p> : null}
                </div>
                <div className="meta">
                  <span>{run.status}</span>
                  <small>{new Date(run.startedAt).toLocaleString()}</small>
                  {run.status === 'success' ? (
                    <>
                      <a href={`http://localhost:3001/api/v1/robots/${run.robotId}/runs/${run.id}/html`} target="_blank" rel="noreferrer">HTML</a>
                      <a href={`http://localhost:3001/api/v1/robots/${run.robotId}/runs/${run.id}/screenshot`} target="_blank" rel="noreferrer">PNG</a>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
