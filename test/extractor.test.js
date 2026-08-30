import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAllBySelector, extractBySelector, extractRow, extractRows, stripMarkup } from '../src/extractor.js';
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

test('extracts repeated records while preserving nested card content', () => {
  const html = `<section>
    <article class="product"><h2>First <em>item</em></h2><p class="price">$10</p></article>
    <article class="product"><h2>Second item</h2><p class="price">$20</p></article>
  </section>`;
  assert.deepEqual(extractAllBySelector(html, '.price'), ['$10', '$20']);
  assert.deepEqual(extractRows(html, [{ name: 'name', selector: 'h2' }, { name: 'price', selector: '.price' }], '.product'), [
    { name: 'First item', price: '$10' },
    { name: 'Second item', price: '$20' }
  ]);
  assert.equal(extractRows(html, [{ name: 'name', selector: 'h2' }], '.product', 1).length, 1);
});

test('validates the required robot fields', () => {
  assert.deepEqual(validateRobot({ name: 'Homepage', startUrl: 'https://example.com', fields: [{ name: 'title', selector: 'h1' }] }), []);
  assert.match(validateRobot({ name: '', startUrl: 'file:///private/a', fields: [] }).join(' '), /name is required.*HTTP\(S\).*At least one/);
});

test('validates repeated-record options', () => {
  assert.match(validateRobot({ name: 'List', startUrl: 'https://example.com', fields: [{ name: 'title', selector: 'h2' }], rowSelector: '', maxRows: 101 }).join(' '), /rowSelector.*maxRows/);
});
