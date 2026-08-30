import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedByRobots, parseRobotsTxt } from '../src/robots.js';

const rules = `User-agent: *\nDisallow: /private/\nAllow: /private/public/\nDisallow: /*.pdf$\n\nUser-agent: OpenScrape\nDisallow: /internal/`;

test('selects a specific user-agent group ahead of the wildcard group', () => {
  assert.deepEqual(parseRobotsTxt(rules), [{ type: 'disallow', path: '/internal/' }]);
  assert.equal(isAllowedByRobots('https://example.com/private/report', rules).allowed, true);
  assert.equal(isAllowedByRobots('https://example.com/internal/report', rules).allowed, false);
});

test('uses longest matching rule and supports wildcards and end anchors', () => {
  const wildcardOnly = 'User-agent: *\nDisallow: /private/\nAllow: /private/public/\nDisallow: /*.pdf$';
  assert.equal(isAllowedByRobots('https://example.com/private/secret', wildcardOnly).allowed, false);
  assert.equal(isAllowedByRobots('https://example.com/private/public/page', wildcardOnly).allowed, true);
  assert.equal(isAllowedByRobots('https://example.com/files/report.pdf', wildcardOnly).allowed, false);
  assert.equal(isAllowedByRobots('https://example.com/files/report.pdf.html', wildcardOnly).allowed, true);
});
