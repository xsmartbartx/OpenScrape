'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { generateSelectorCandidates } from '@openscrape/extractor';

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

type RunLog = { id: string; level: string; message: string; createdAt: string };

type WorkspaceMetrics = {
  robots: number;
  activeSchedules: number;
  runs: { queued: number; running: number; success: number; failed: number; cancelled: number };
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
  const [expandedRunId, setExpandedRunId] = useState<string>();
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string>();
  const [previewRobotId, setPreviewRobotId] = useState<string>();
  const [recording, setRecording] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<string>();
  const [liveFrame, setLiveFrame] = useState<string>();
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'ready' | 'stopped'>('idle');
  const [liveSelector, setLiveSelector] = useState('');
  const [liveValue, setLiveValue] = useState('');
  const recorderSocket = useRef<WebSocket>();
  const [metrics, setMetrics] = useState<WorkspaceMetrics>();

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

  const fetchLogs = async (robotId: string, runId: string) => {
    const response = await apiFetch(`/robots/${robotId}/runs/${runId}/logs`);
    if (!response.ok) throw new Error('Could not load run logs.');
    setRunLogs(await response.json());
  };

  const loadPreview = async (robotId: string) => {
    const response = await apiFetch(`/robots/${robotId}/preview`);
    if (!response.ok) throw new Error('No captured HTML is available for this robot.');
    const html = await response.text();
    setPreviewHtml(DOMPurify.sanitize(html, { FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'] }));
    setPreviewRobotId(robotId);
    setRecording(true);
  };

  const recordElement = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!recording || !previewRobotId) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    event.preventDefault();
    event.stopPropagation();
    const element = target.closest('a,button,input,select,textarea,img,h1,h2,h3,h4,p,li,td,th') ?? target;
    const candidates = generateSelectorCandidates(element).map(({ kind, value, score, reason }) => ({ kind, value, score, reason }));
    const action = ['a', 'button'].includes(element.tagName.toLowerCase()) ? 'click' : 'extract';
    const response = await apiFetch(`/robots/${previewRobotId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, selector: { candidates }, value: element.textContent?.trim() }),
    });
    if (!response.ok) throw new Error('Could not save recorded step.');
    setError(undefined);
  };

  const stopLiveRecorder = async () => {
    const sessionId = liveSessionId;
    recorderSocket.current?.close();
    recorderSocket.current = undefined;
    if (sessionId && previewRobotId) {
      await apiFetch(`/robots/${previewRobotId}/recorder-sessions/${sessionId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    setLiveSessionId(undefined);
    setLiveFrame(undefined);
    setLiveStatus('stopped');
  };

  const startLiveRecorder = async () => {
    if (!previewRobotId || !token) return;
    setLiveStatus('connecting');
    setError(undefined);
    try {
      const response = await apiFetch(`/robots/${previewRobotId}/recorder-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const session = await response.json() as { id?: string };
      if (!response.ok || !session.id) throw new Error('Could not start live recorder.');
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${wsProtocol}//${new URL(apiBaseUrl).host}/api/v1/recorder`);
      recorderSocket.current = socket;
      setLiveSessionId(session.id);
      socket.onopen = () => socket.send(JSON.stringify({ type: 'attach', sessionId: session.id, token }));
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { type?: string; data?: string; message?: string };
        if (message.type === 'ready') setLiveStatus('ready');
        if (message.type === 'frame' && message.data) setLiveFrame(`data:image/jpeg;base64,${message.data}`);
        if (message.type === 'error') setError(message.message ?? 'Live recorder error.');
        if (message.type === 'stopped') setLiveStatus('stopped');
      };
      socket.onerror = () => setError('Live recorder connection failed.');
      socket.onclose = () => setLiveStatus((current) => current === 'stopped' ? current : 'idle');
    } catch (startError) {
      setLiveStatus('idle');
      setError(startError instanceof Error ? startError.message : 'Could not start live recorder.');
    }
  };

  const sendLiveAction = (action: Record<string, unknown>) => {
    if (recorderSocket.current?.readyState !== WebSocket.OPEN) return;
    recorderSocket.current.send(JSON.stringify(action));
  };

  useEffect(() => () => { recorderSocket.current?.close(); }, []);

  useEffect(() => {
    setToken(window.localStorage.getItem('openscrape_session') ?? undefined);
  }, []);

  useEffect(() => {
    if (!token) return;
    void fetchRobots().catch((loadError: Error) => setError(loadError.message));
    void loadApiKeys().catch((loadError: Error) => setError(loadError.message));
    void loadMetrics().catch((loadError: Error) => setError(loadError.message));
  }, [token]);

  const loadMetrics = async () => {
    const response = await apiFetch('/metrics/workspace');
    if (!response.ok) throw new Error('Could not load workspace metrics.');
    setMetrics(await response.json());
  };

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
      await loadMetrics();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Unexpected error.');
    }
  };

  const onCancelRun = async (robotId: string, runId: string) => {
    try {
      const response = await apiFetch(`/robots/${robotId}/runs/${runId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not cancel run.');
      await fetchRuns(robotId);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel run.');
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
      {metrics ? <section className="metrics-strip" aria-label="Workspace metrics">
        <div><b>{metrics.robots}</b><span>Robots</span></div>
        <div><b>{metrics.activeSchedules}</b><span>Schedules</span></div>
        <div><b>{metrics.runs.running + metrics.runs.queued}</b><span>Active runs</span></div>
        <div><b>{metrics.runs.success}</b><span>Successful</span></div>
        <div><b>{metrics.runs.failed}</b><span>Failed</span></div>
      </section> : null}
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
                    <button type="button" className={selectedRobotId === robot.id ? 'selected' : ''} onClick={() => { setSelectedRobotId(robot.id); void loadPreview(robot.id).catch((previewError: Error) => setError(previewError.message)); }}>
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
      {previewHtml && previewRobotId ? <section className="card recorder-panel">
        <div className="panel-heading"><h2>Recorder preview</h2><div className="recorder-actions"><button type="button" onClick={() => setRecording((active) => !active)}>{recording ? 'Stop recording' : 'Record clicks'}</button>{liveSessionId ? <button type="button" onClick={() => void stopLiveRecorder()}>Stop live</button> : <button type="button" onClick={() => void startLiveRecorder()}>Start live</button>}</div></div>
        <p className="muted">{recording ? 'Click an element to save a ranked selector step.' : 'Preview mode'}</p>
        <div className={`preview-frame ${recording ? 'recording' : ''}`} onClick={(event) => void recordElement(event).catch((recordError: Error) => setError(recordError.message))} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        {liveStatus !== 'idle' ? <div className="live-recorder">
          <div className="panel-heading"><strong>Live session</strong><span className="muted">{liveStatus}</span></div>
          {liveFrame ? <img className="live-frame" src={liveFrame} alt="Live browser preview" onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            sendLiveAction({ type: 'click', x: ((event.clientX - bounds.left) / bounds.width) * 1280, y: ((event.clientY - bounds.top) / bounds.height) * 720 });
          }} /> : <p className="muted">Waiting for the browser frame...</p>}
          <div className="live-action-form">
            <input aria-label="Live selector" placeholder="CSS or XPath selector" value={liveSelector} onChange={(event) => setLiveSelector(event.target.value)} />
            <input aria-label="Live value" placeholder="Value or URL" value={liveValue} onChange={(event) => setLiveValue(event.target.value)} />
            <button type="button" onClick={() => sendLiveAction({ type: 'goto', value: liveValue })}>Go</button>
            <button type="button" onClick={() => sendLiveAction({ type: 'fill', selector: liveSelector, value: liveValue })}>Fill</button>
            <button type="button" onClick={() => sendLiveAction({ type: 'click', selector: liveSelector })}>Click</button>
            <button type="button" onClick={() => sendLiveAction({ type: 'wait', value: liveValue || '500' })}>Wait</button>
          </div>
        </div> : null}
      </section> : null}

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
                  {run.status === 'queued' || run.status === 'running' ? (
                    <button type="button" onClick={() => void onCancelRun(run.robotId, run.id)}>Cancel</button>
                  ) : null}
                  <button type="button" onClick={() => { setExpandedRunId(run.id); void fetchLogs(run.robotId, run.id).catch((logError: Error) => setError(logError.message)); }}>Logs</button>
                  {run.status === 'success' ? (
                    <>
                      <button type="button" onClick={() => void openArtifact(`/robots/${run.robotId}/runs/${run.id}/html`)}>HTML</button>
                      <button type="button" onClick={() => void openArtifact(`/robots/${run.robotId}/runs/${run.id}/screenshot`)}>PNG</button>
                    </>
                  ) : null}
                </div>
                {expandedRunId === run.id ? <div className="run-logs">{runLogs.map((log) => <small key={log.id}><b>{log.level}</b> {new Date(log.createdAt).toLocaleTimeString()} {log.message}</small>)}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      </> : null}
    </main>
  );
}
