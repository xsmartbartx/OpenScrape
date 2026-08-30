import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRun } from '../src/server.js';
import { createStore } from '../src/store.js';

test('executes a queued run and stores its extracted row', async () => {
  const store = createStore();
  const robot = await store.createRobot({ name: 'Test robot', startUrl: 'https://example.com', fields: [{ name: 'title', selector: 'h1' }] });
  const run = await store.createRun(robot.id);
  await executeRun(store, run, robot, async () => '<h1>Example</h1>');
  assert.equal(store.runs[0].status, 'success');
  assert.deepEqual(store.results[0].data, { title: 'Example' });
});
