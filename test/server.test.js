import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRun } from '../src/server.js';
import { createStore } from '../src/store.js';

test('executes a queued run and stores its extracted row', async () => {
  const store = createStore();
  const robot = await store.createRobot({ name: 'Test robot', startUrl: 'https://example.com', fields: [{ name: 'title', selector: 'h1' }] });
  const run = await store.createRun(robot.id);
  await executeRun(store, run, robot, async () => '<h1>Example</h1>', async () => ({ allowed: true, reason: 'No matching robots.txt rule.' }));
  assert.equal(store.runs[0].status, 'success');
  assert.deepEqual(store.results[0].data, { title: 'Example' });
});

test('marks a run failed when robots.txt blocks its path', async () => {
  const store = createStore();
  const robot = await store.createRobot({ name: 'Blocked', startUrl: 'https://example.com/private', fields: [{ name: 'title', selector: 'h1' }] });
  const run = await store.createRun(robot.id);
  await executeRun(store, run, robot, async () => { throw new Error('should not fetch'); }, async () => ({ allowed: false, reason: 'Blocked by robots.txt rule: /private' }));
  assert.equal(store.runs[0].status, 'failed');
  assert.match(store.runs[0].error, /robots.txt/);
  assert.equal(store.results.length, 0);
});

test('stores every matching repeated record and reports the count', async () => {
  const store = createStore();
  const robot = await store.createRobot({ name: 'Products', startUrl: 'https://example.com/products', rowSelector: '.product', maxRows: 2, fields: [{ name: 'name', selector: 'h2' }, { name: 'price', selector: '.price' }] });
  const run = await store.createRun(robot.id);
  await executeRun(store, run, robot, async () => '<article class="product"><h2>One</h2><span class="price">$1</span></article><article class="product"><h2>Two</h2><span class="price">$2</span></article>', async () => ({ allowed: true, reason: 'No matching robots.txt rule.' }));
  assert.equal(store.runs[0].stats.items, 2);
  assert.deepEqual(store.results.map((result) => result.data), [{ name: 'One', price: '$1' }, { name: 'Two', price: '$2' }]);
});
