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

type ApiKey = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
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
  const apiBaseUrl = 'http://localhost:3001/api/v1';
  const [robots, setRobots] = useState<Robot[]>([]);
  const [runs, setRuns] = useState<RunStatus[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>();
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [token, setToken] = useState<string>();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', displayName: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newSecret, setNewSecret] = useState<string>();

  const apiFetch = (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  };

  const fetchRobots = async () => {
    const response = await apiFetch('/robots');
    if (!response.ok) throw new Error('Could not load robots.');
    const data = await response.json();
    setRobots(data);
    setSelectedRobotId((current) => current ?? data[0]?.id);
  };

  const fetchRuns = async (robotId: string) => {
    const response = await apiFetch(`/robots/${robotId}/runs`);
    if (!response.ok) throw new Error('Could not load run history.');
    const data = await response.json();
    setRuns(data);
  };

  useEffect(() => {
    setToken(window.localStorage.getItem('openscrape_session') ?? undefined);
  }, []);

  useEffect(() => {
    if (!token) return;
    void fetchRobots().catch((loadError: Error) => setError(loadError.message));
    void loadApiKeys().catch((loadError: Error) => setError(loadError.message));
  }, [token]);

  const loadApiKeys = async () => {
    const response = await apiFetch('/api-keys');
    if (!response.ok) throw new Error('Could not load API keys.');
    setApiKeys(await response.json());
  };

  useEffect(() => {
    if (!selectedRobotId) return;

    void fetchRuns(selectedRobotId).catch((loadError: Error) => setError(loadError.message));
    const interval = window.setInterval(() => {
      void fetchRuns(selectedRobotId).catch((loadError: Error) => setError(loadError.message));
    }, 2000);

    return () => window.clearInterval(interval);
  }, [selectedRobotId]);

  const onAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'Authentication failed.');
      window.localStorage.setItem('openscrape_session', data.token);
      setToken(data.token);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    if (token) await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.localStorage.removeItem('openscrape_session');
    setToken(undefined);
    setRobots([]);
    setRuns([]);
    setApiKeys([]);
    setNewSecret(undefined);
  };

  const createApiKey = async () => {
    const response = await apiFetch('/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName }),
    });
    if (!response.ok) throw new Error('Could not create API key.');
    const created = await response.json();
    setNewSecret(created.secret);
    setNewKeyName('');
    await loadApiKeys();
  };

  const revokeApiKey = async (id: string) => {
    const response = await apiFetch(`/api-keys/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not revoke API key.');
    await loadApiKeys();
  };

  const openArtifact = async (path: string) => {
    const response = await apiFetch(path);
    if (!response.ok) throw new Error('Could not load artifact.');
    const blobUrl = URL.createObjectURL(await response.blob());
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      const response = await apiFetch('/robots', {
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
      const response = await apiFetch(`/robots/${robotId}/runs`, {
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

      {!token ? (
        <form className="card auth-card" onSubmit={onAuthSubmit}>
          <div className="panel-heading">
            <h2>{authMode === 'login' ? 'Sign in' : 'Create account'}</h2>
            <button type="button" onClick={() => setAuthMode((mode) => mode === 'login' ? 'register' : 'login')}>
              {authMode === 'login' ? 'Register' : 'Sign in'}
            </button>
          </div>
          {authMode === 'register' ? (
            <label>Display name<input value={authForm.displayName} onChange={(event) => setAuthForm((current) => ({ ...current, displayName: event.target.value }))} /></label>
          ) : null}
          <label>Email<input type="email" required value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} /></label>
          <label>Password<input type="password" required minLength={12} value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} /></label>
          <button type="submit" disabled={authLoading}>{authLoading ? 'Working...' : authMode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
      ) : null}

      {token ? <>
      <div className="session-bar"><span>Authenticated workspace</span><button type="button" onClick={() => void logout()}>Sign out</button></div>
      <section className="card key-panel">
        <div className="panel-heading"><h2>API keys</h2><span className="muted">Secrets are shown once</span></div>
        <div className="key-create">
          <input placeholder="Key name" value={newKeyName} onChange={(event) => setNewKeyName(event.target.value)} />
          <button type="button" onClick={() => void createApiKey().catch((keyError: Error) => setError(keyError.message))}>Create key</button>
        </div>
        {newSecret ? <div className="secret-box"><strong>Copy this secret now:</strong><code>{newSecret}</code><button type="button" onClick={() => setNewSecret(undefined)}>Dismiss</button></div> : null}
        <ul className="key-list">
          {apiKeys.map((key) => <li key={key.id}><div><strong>{key.name}</strong><small>Created {new Date(key.createdAt).toLocaleString()}</small></div>{key.revokedAt ? <span>Revoked</span> : <button type="button" onClick={() => void revokeApiKey(key.id).catch((keyError: Error) => setError(keyError.message))}>Revoke</button>}</li>)}
        </ul>
      </section>
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
              <button type="button" onClick={() => void openArtifact(`/robots/${selectedRobotId}/runs/export.json`)}>JSON</button>
              <button type="button" onClick={() => void openArtifact(`/robots/${selectedRobotId}/runs/export.csv`)}>CSV</button>
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
                      <button type="button" onClick={() => void openArtifact(`/robots/${run.robotId}/runs/${run.id}/html`)}>HTML</button>
                      <button type="button" onClick={() => void openArtifact(`/robots/${run.robotId}/runs/${run.id}/screenshot`)}>PNG</button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </> : null}
    </main>
  );
}
