import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStore } from './store.js';
import { extractRows, fetchHtml } from './extractor.js';
import { validateRobot } from './validation.js';
import { assertRobotsAllowed } from './robots.js';
import { createScheduler } from './scheduler.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');

export function createApp({ store = createStore({ filePath: join(root, 'data', 'openscrape.json') }), htmlFetcher = fetchHtml, robotsChecker = assertRobotsAllowed } = {}) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url, store, htmlFetcher, robotsChecker);
      if (request.method !== 'GET') return send(response, 405, { error: 'Method not allowed.' });
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[\w./-]+$/.test(file)) return send(response, 404, { error: 'Not found.' });
      const content = await readFile(join(publicDir, file));
      response.writeHead(200, { 'content-type': contentType(file) });
      response.end(content);
    } catch (error) {
      if (error.code === 'ENOENT') return send(response, 404, { error: 'Not found.' });
      console.error(error);
      send(response, 500, { error: 'Unexpected server error.' });
    }
  });
  const scheduler = createScheduler({ store, runRobot: (run, robot) => executeRun(store, run, robot, htmlFetcher, robotsChecker) });
  return { server, store, scheduler };
}

async function handleApi(request, response, url, store, htmlFetcher, robotsChecker) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (request.method === 'GET' && url.pathname === '/api/health') return send(response, 200, { status: 'ok' });
  if (request.method === 'GET' && url.pathname === '/api/robots') return send(response, 200, { robots: store.robots });
  if (request.method === 'POST' && url.pathname === '/api/robots') {
    const input = await jsonBody(request); const errors = validateRobot(input);
    return errors.length ? send(response, 422, { errors }) : send(response, 201, { robot: await store.createRobot(input) });
  }
  if (parts[1] === 'robots' && parts[2] && parts.length === 3) {
    const id = parts[2];
    if (request.method === 'PUT') { const input = await jsonBody(request); const errors = validateRobot(input); if (errors.length) return send(response, 422, { errors }); const robot = await store.updateRobot(id, input); return robot ? send(response, 200, { robot }) : send(response, 404, { error: 'Robot not found.' }); }
    if (request.method === 'DELETE') return await store.deleteRobot(id) ? send(response, 204) : send(response, 404, { error: 'Robot not found.' });
  }
  if (request.method === 'POST' && parts[1] === 'robots' && parts[2] && parts[3] === 'runs' && parts.length === 4) {
    const robot = store.robots.find((item) => item.id === parts[2]);
    if (!robot) return send(response, 404, { error: 'Robot not found.' });
    const run = await store.createRun(robot.id);
    executeRun(store, run, robot, htmlFetcher, robotsChecker);
    return send(response, 202, { run });
  }
  if (request.method === 'GET' && url.pathname === '/api/runs') return send(response, 200, { runs: store.runs });
  if (request.method === 'GET' && parts[1] === 'runs' && parts[2] && parts.length === 3) {
    const run = store.runs.find((item) => item.id === parts[2]);
    return run ? send(response, 200, { run }) : send(response, 404, { error: 'Run not found.' });
  }
  if (request.method === 'GET' && parts[1] === 'runs' && parts[2] && parts[3] === 'results') {
    const results = store.results.filter((item) => item.runId === parts[2]);
    return send(response, 200, { results });
  }
  if (request.method === 'GET' && parts[1] === 'runs' && parts[2] && parts[3] === 'export.csv') {
    const results = store.results.filter((item) => item.runId === parts[2]);
    const fields = [...new Set(results.flatMap((row) => Object.keys(row.data)))];
    const headers = ['page_index', 'source_url', ...fields];
    const csv = [headers, ...results.map((row) => [row.pageIndex ?? '', row.sourceUrl ?? '', ...fields.map((key) => row.data[key] ?? '')])].map((row) => row.map(csvValue).join(',')).join('\n');
    response.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="run-${parts[2]}.csv"` }); return response.end(csv);
  }
  return send(response, 404, { error: 'Not found.' });
}

export async function executeRun(store, run, robot, htmlFetcher, robotsChecker = assertRobotsAllowed) {
  await store.updateRun(run.id, { status: 'running', startedAt: new Date().toISOString() });
  await store.addRunEvent(run.id, { message: 'Worker started.' });
  let pages = 0;
  let rows = [];
  try {
    const pageUrls = paginationUrls(robot);
    if (!robot.respectRobotsTxt) {
      await store.addRunEvent(run.id, { level: 'warning', message: 'robots.txt check was disabled for this robot.' });
    }
    for (const [index, pageUrl] of pageUrls.entries()) {
      if (rows.length >= (robot.maxRows ?? 50)) break;
      if (robot.respectRobotsTxt) {
        const policy = await robotsChecker(pageUrl);
        await store.addRunEvent(run.id, { level: policy.allowed ? 'info' : 'warning', message: `Page ${index + 1}: ${policy.reason}` });
        if (!policy.allowed) throw new Error(`Run blocked: ${policy.reason}`);
      }
      await store.addRunEvent(run.id, { message: `Fetching page ${index + 1} of ${pageUrls.length}.` });
      const html = await htmlFetcher(pageUrl);
      pages += 1;
      const remaining = Math.max((robot.maxRows ?? 50) - rows.length, 0);
      const pageRows = extractRows(html, robot.fields, robot.rowSelector, remaining);
      rows.push(...pageRows.map((data) => ({ data, sourceUrl: pageUrl, pageIndex: index + 1 })));
      await store.addRunEvent(run.id, { message: `Page ${index + 1}: extracted ${pageRows.length} row(s).` });
      if (rows.length >= (robot.maxRows ?? 50)) break;
    }
    for (const result of rows) await store.addResults(run.id, robot.id, [result.data], result);
    await store.addRunEvent(run.id, { message: `Extracted ${rows.length} row(s) across ${robot.fields.length} field(s).` });
    await store.updateRun(run.id, { status: 'success', finishedAt: new Date().toISOString(), stats: { pages, items: rows.length, errors: 0 } });
  } catch (error) {
    await store.addRunEvent(run.id, { level: 'error', message: error.message });
    await store.updateRun(run.id, { status: 'failed', finishedAt: new Date().toISOString(), stats: { pages, items: rows.length, errors: 1 }, error: error.message });
  }
}

export function paginationUrls(robot) {
  if (!robot.paginationUrlTemplate) return [robot.startUrl];
  return Array.from({ length: robot.maxPages ?? 1 }, (_, index) => robot.paginationUrlTemplate.replaceAll('{page}', String(index + 1)));
}

function csvValue(value) { const text = String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function contentType(file) { return file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8'; }
function send(response, status, body) { response.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json; charset=utf-8' }); response.end(body === undefined ? undefined : JSON.stringify(body)); }
async function jsonBody(request) { let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 100_000) throw new Error('Request body too large.'); } try { return JSON.parse(body); } catch { return null; } }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp();
  await app.store.load();
  app.server.listen(process.env.PORT ?? 3000, () => {
    app.scheduler.start();
    console.log(`OpenScrape is running at http://localhost:${process.env.PORT ?? 3000}`);
  });
}
