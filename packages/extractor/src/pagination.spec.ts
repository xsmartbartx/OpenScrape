import { JSDOM } from 'jsdom';
import { crawlPagination, findNextPageUrl, scrollUntilStable } from './pagination';

describe('pagination helpers', () => {
  it('finds same-origin next links and rejects cross-origin links', () => {
    const document = new JSDOM('<a rel="next" href="/page/2">Next</a>').window.document;
    expect(findNextPageUrl(document, 'https://example.com/page/1')).toBe('https://example.com/page/2');

    const external = new JSDOM('<a rel="next" href="https://other.example/page/2">Next</a>').window.document;
    expect(findNextPageUrl(external, 'https://example.com/page/1')).toBeUndefined();
  });

  it('crawls unique pages up to the configured limit', async () => {
    const documents = new Map([
      ['https://example.com/1', new JSDOM('<a rel="next" href="/2">Next</a>').window.document],
      ['https://example.com/2', new JSDOM('<a rel="next" href="/2">Next</a>').window.document],
    ]);
    const pages = await crawlPagination('https://example.com/1', async (url) => documents.get(url)!, { maxPages: 10 });
    expect(pages).toEqual(['https://example.com/1', 'https://example.com/2']);
  });

  it('stops infinite scroll when page height stops growing', async () => {
    const heights = [100, 200, 200];
    let index = 0;
    const scrolls = await scrollUntilStable(async () => ({ height: heights[index++] }), { maxScrolls: 10, waitMs: 0 });
    expect(scrolls).toBe(3);
  });
});
