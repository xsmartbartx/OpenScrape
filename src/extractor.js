const MAX_RESPONSE_BYTES = 2_000_000;

export function stripMarkup(value = '') {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

export function extractBySelector(html, selector) {
  return stripMarkup(findElements(html, selector)[0]?.html ?? '');
}

export function extractAllBySelector(html, selector) {
  return findElements(html, selector).map((element) => stripMarkup(element.html));
}

export function extractRows(html, fields, rowSelector, maxRows = 50) {
  if (!rowSelector) return [extractRow(html, fields)];
  return findElements(html, rowSelector).slice(0, maxRows).map((element) => extractRow(element.html, fields));
}

export function findElements(html, selector) {
  const matcher = createSelectorMatcher(selector);
  const stack = [];
  const elements = [];
  const tags = /<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*?)?\s*\/?>/g;
  let tag;
  while ((tag = tags.exec(html))) {
    const raw = tag[0];
    const name = tag[1].toLowerCase();
    if (raw.startsWith('</')) {
      const index = findLastOpenTag(stack, name);
      if (index === -1) continue;
      const [entry] = stack.splice(index, 1);
      if (entry.matches) elements.push({ html: html.slice(entry.contentStart, tag.index), index: entry.index });
      continue;
    }
    if (isVoidTag(name) || raw.endsWith('/>')) continue;
    stack.push({ tag: name, contentStart: tags.lastIndex, index: tag.index, matches: matcher(name, raw) });
  }
  return elements.sort((a, b) => a.index - b.index);
}

function createSelectorMatcher(selector) {
  const trimmed = selector?.trim();
  const idMatch = trimmed?.match(/^#([A-Za-z][\w-]*)$/);
  const classMatch = trimmed?.match(/^\.([A-Za-z][\w-]*)$/);
  const tagMatch = trimmed?.match(/^[A-Za-z][\w-]*$/);
  if (!trimmed || (!idMatch && !classMatch && !tagMatch)) throw new Error(`Unsupported selector "${selector}". MVP supports tag, .class, and #id selectors.`);
  if (tagMatch) return (tag) => tag === trimmed.toLowerCase();
  const attribute = idMatch ? 'id' : 'class';
  const expected = (idMatch?.[1] ?? classMatch?.[1]).toLowerCase();
  return (_, raw) => {
    const value = attributeValue(raw, attribute)?.toLowerCase();
    return attribute === 'class' ? value?.split(/\s+/).includes(expected) : value === expected;
  };
}

function attributeValue(tag, attribute) {
  const expression = new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = tag.match(expression);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function findLastOpenTag(stack, tag) {
  for (let index = stack.length - 1; index >= 0; index -= 1) if (stack[index].tag === tag) return index;
  return -1;
}

function isVoidTag(tag) {
  return new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']).has(tag);
}

export async function fetchHtml(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) URLs are supported.');
  const response = await fetch(parsed, { headers: { 'user-agent': 'OpenScrape-MVP/0.1 (+self-hosted)' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Website returned ${response.status}.`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error('The page is too large for the MVP extractor.');
  const html = await response.text();
  if (html.length > MAX_RESPONSE_BYTES) throw new Error('The page is too large for the MVP extractor.');
  return html;
}

export function extractRow(html, fields) {
  return Object.fromEntries(fields.map((field) => [field.name, extractBySelector(html, field.selector)]));
}
