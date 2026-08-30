const MAX_RESPONSE_BYTES = 2_000_000;

export function stripMarkup(value = '') {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

export function extractBySelector(html, selector) {
  const trimmed = selector.trim();
  if (!trimmed) return '';
  const idMatch = trimmed.match(/^#([A-Za-z][\w-]*)$/);
  const classMatch = trimmed.match(/^\.([A-Za-z][\w-]*)$/);
  const tagMatch = trimmed.match(/^[A-Za-z][\w-]*$/);
  let expression;
  if (idMatch) expression = new RegExp(`<([\\w-]+)[^>]*\\bid=["']${escapeRegExp(idMatch[1])}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
  else if (classMatch) expression = new RegExp(`<([\\w-]+)[^>]*\\bclass=["'][^"']*\\b${escapeRegExp(classMatch[1])}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
  else if (tagMatch) expression = new RegExp(`<(${escapeRegExp(trimmed)})[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
  else throw new Error(`Unsupported selector "${selector}". MVP supports tag, .class, and #id selectors.`);
  const match = html.match(expression);
  return match ? stripMarkup(match[2]) : '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
