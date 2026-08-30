import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBySelector, extractRow, stripMarkup } from '../src/extractor.js';
import { validateRobot } from '../src/validation.js';

test('extracts the first matching tag, class, and id', () => {
  const html = '<main><h1 id="title">A <em>great</em> product</h1><p class="summary featured">  Useful &amp; affordable </p></main>';
  assert.equal(extractBySelector(html, 'h1'), 'A great product');
  assert.equal(extractBySelector(html, '#title'), 'A great product');
  assert.equal(extractBySelector(html, '.summary'), 'Useful & affordable');
  assert.deepEqual(extractRow(html, [{ name: 'title', selector: '#title' }, { name: 'summary', selector: '.summary' }]), { title: 'A great product', summary: 'Useful & affordable' });
});

test('normalizes markup text and rejects unsupported selectors', () => {
  assert.equal(stripMarkup(' hello <b>world</b> '), 'hello world');
  assert.throws(() => extractBySelector('<p>Hi</p>', 'main p'), /Unsupported selector/);
});

test('validates the required robot fields', () => {
  assert.deepEqual(validateRobot({ name: 'Homepage', startUrl: 'https://example.com', fields: [{ name: 'title', selector: 'h1' }] }), []);
  assert.match(validateRobot({ name: '', startUrl: 'file:///private/a', fields: [] }).join(' '), /name is required.*HTTP\(S\).*At least one/);
});
