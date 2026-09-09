export type PaginationOptions = {
  maxPages?: number;
  nextSelector?: string;
  sameOriginOnly?: boolean;
};

export type ScrollOptions = {
  maxScrolls?: number;
  waitMs?: number;
};

export function findNextPageUrl(document: Document, currentUrl: string, options: PaginationOptions = {}): string | undefined {
  const selector = options.nextSelector ?? 'a[rel="next"], a.next, a[aria-label*="Next" i], a[aria-label*="next" i]';
  const link = document.querySelector<HTMLAnchorElement>(selector);
  const href = link?.getAttribute('href');
  if (!href) return undefined;

  const nextUrl = new URL(href, currentUrl);
  if (options.sameOriginOnly !== false && nextUrl.origin !== new URL(currentUrl).origin) return undefined;
  return nextUrl.toString();
}

export async function crawlPagination(
  startUrl: string,
  fetchDocument: (url: string) => Promise<Document>,
  options: PaginationOptions = {},
): Promise<string[]> {
  const maxPages = options.maxPages ?? 20;
  const visited = new Set<string>();
  const pages: string[] = [];
  let currentUrl: string | undefined = startUrl;

  while (currentUrl && pages.length < maxPages && !visited.has(currentUrl)) {
    visited.add(currentUrl);
    pages.push(currentUrl);
    const document = await fetchDocument(currentUrl);
    currentUrl = findNextPageUrl(document, currentUrl, options);
  }

  return pages;
}

export async function scrollUntilStable(
  scroll: () => Promise<{ height: number }>,
  options: ScrollOptions = {},
): Promise<number> {
  const maxScrolls = options.maxScrolls ?? 15;
  const waitMs = options.waitMs ?? 500;
  let previousHeight = 0;
  let scrolls = 0;

  while (scrolls < maxScrolls) {
    const { height } = await scroll();
    scrolls += 1;
    if (height <= previousHeight) break;
    previousHeight = height;
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return scrolls;
}
