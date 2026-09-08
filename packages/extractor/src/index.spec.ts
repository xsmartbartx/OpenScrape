import { JSDOM } from 'jsdom';
import { extractFields, generateSelectorCandidates } from './index';

describe('selector generator and deterministic extractor', () => {
  it('ranks stable attributes before structural fallbacks', () => {
    const dom = new JSDOM('<main><button data-testid="buy" aria-label="Buy now">Buy</button></main>');
    const element = dom.window.document.querySelector('button')!;
    const candidates = generateSelectorCandidates(element);

    expect(candidates[0]).toMatchObject({ kind: 'test-id', score: 100 });
    expect(candidates.some((candidate) => candidate.kind === 'aria-label')).toBe(true);
    expect(new Set(candidates.map((candidate) => candidate.value)).size).toBe(candidates.length);
  });

  it('extracts text, attributes, and multiple values from field mappings', () => {
    const dom = new JSDOM('<article><h1> Product </h1><a href="/one">One</a><a href="/two">Two</a></article>');
    const fields = extractFields(dom.window.document, [
      { name: 'title', selector: 'h1' },
      { name: 'links', selector: 'a', attribute: 'href', multiple: true },
    ]);

    expect(fields).toEqual([
      { name: 'title', value: 'Product' },
      { name: 'links', value: ['/one', '/two'] },
    ]);
  });
});
