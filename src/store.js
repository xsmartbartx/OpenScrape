import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const now = () => new Date().toISOString();

export function createEmptyState() {
  return { robots: [], runs: [], results: [] };
}

export function createStore({ filePath } = {}) {
  let state = createEmptyState();

  async function load() {
    if (!filePath) return state;
    try {
      state = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return state;
  }

  async function save() {
    if (!filePath) return;
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(state, null, 2));
    await rename(temporaryPath, filePath);
  }

  async function createRobot(input) {
    const timestamp = now();
    const robot = {
      id: randomUUID(),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      startUrl: input.startUrl.trim(),
      fields: input.fields,
      respectRobotsTxt: input.respectRobotsTxt !== false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.robots.unshift(robot);
    await save();
    return robot;
  }

  async function updateRobot(id, input) {
    const robot = state.robots.find((item) => item.id === id);
    if (!robot) return null;
    Object.assign(robot, {
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      startUrl: input.startUrl.trim(),
      fields: input.fields,
      respectRobotsTxt: input.respectRobotsTxt !== false,
      updatedAt: now()
    });
    await save();
    return robot;
  }

  async function deleteRobot(id) {
    const index = state.robots.findIndex((item) => item.id === id);
    if (index === -1) return false;
    state.robots.splice(index, 1);
    const runIds = new Set(state.runs.filter((run) => run.robotId === id).map((run) => run.id));
    state.runs = state.runs.filter((run) => run.robotId !== id);
    state.results = state.results.filter((result) => !runIds.has(result.runId));
    await save();
    return true;
  }

  async function createRun(robotId) {
    const run = { id: randomUUID(), robotId, status: 'queued', trigger: 'manual', createdAt: now(), startedAt: null, finishedAt: null, stats: null, error: null };
    state.runs.unshift(run);
    await save();
    return run;
  }

  async function updateRun(id, changes) {
    const run = state.runs.find((item) => item.id === id);
    if (!run) return null;
    Object.assign(run, changes);
    await save();
    return run;
  }

  async function addResults(runId, robotId, rows) {
    const records = rows.map((row) => ({ id: randomUUID(), runId, robotId, data: row, createdAt: now() }));
    state.results.unshift(...records);
    await save();
    return records;
  }

  return {
    load, createRobot, updateRobot, deleteRobot, createRun, updateRun, addResults,
    get robots() { return state.robots; },
    get runs() { return state.runs; },
    get results() { return state.results; }
  };
}
