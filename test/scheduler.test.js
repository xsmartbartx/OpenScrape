import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler, matchesCron, validateCron, validateTimeZone } from '../src/scheduler.js';
import { createStore } from '../src/store.js';

test('matches five-field cron expressions in the configured timezone', () => {
  const date = new Date('2026-08-30T07:00:00Z'); // Sunday, 09:00 in Warsaw summer time
  assert.equal(matchesCron('0 9 * * *', date, 'Europe/Warsaw'), true);
  assert.equal(matchesCron('0 7 * * 0', date, 'UTC'), true);
  assert.equal(matchesCron('*/15 7 * * *', date, 'UTC'), true);
  assert.equal(matchesCron('1-5 7 * * *', date, 'UTC'), false);
});

test('uses day-of-month OR day-of-week when both cron fields are restricted', () => {
  const sundayAugust30 = new Date('2026-08-30T09:00:00Z');
  assert.equal(matchesCron('0 9 30 8 1', sundayAugust30, 'UTC'), true);
});

test('validates cron and timezone input', () => {
  assert.equal(validateCron('0 9 * * 1-5'), null);
  assert.match(validateCron('every morning'), /five-field/);
  assert.equal(validateTimeZone('Europe/Warsaw'), null);
  assert.match(validateTimeZone('Mars/Olympus'), /IANA timezone/);
});

test('creates one scheduled run per robot per matching minute', async () => {
  const store = createStore();
  const robot = await store.createRobot({ name: 'Scheduled', startUrl: 'https://example.com', fields: [{ name: 'title', selector: 'h1' }], scheduleCron: '* * * * *', scheduleTimezone: 'UTC' });
  const executed = [];
  const scheduler = createScheduler({ store, runRobot: async (run, scheduledRobot) => { executed.push({ run, scheduledRobot }); } });
  const date = new Date('2026-08-30T07:00:00Z');
  await scheduler.tick(date);
  await scheduler.tick(date);
  assert.equal(executed.length, 1);
  assert.equal(executed[0].scheduledRobot.id, robot.id);
  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0].trigger, 'schedule');
  assert.match(store.runs[0].events[1].message, /Scheduled run matched/);
});
