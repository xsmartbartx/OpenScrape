export type SelectorKind = 'test-id' | 'id' | 'role' | 'name' | 'aria-label' | 'href' | 'css-path' | 'text';

export type SelectorCandidate = {
  kind: SelectorKind;
  value: string;
  score: number;
  reason: string;
};

export type FieldMapping = {
  name: string;
  selector: string;
  attribute?: string;
  multiple?: boolean;
};

export type ExtractedField = {
  name: string;
  value: string | string[] | null;
};

export function generateSelectorCandidates(element: Element): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];
  const add = (candidate: SelectorCandidate) => {
    if (!candidates.some((item) => item.value === candidate.value) && isUnique(element, candidate.value)) {
      candidates.push(candidate);
    }
  };

  const testId = element.getAttribute('data-testid');
  if (testId) add({ kind: 'test-id', value: `[data-testid="${escapeAttribute(testId)}"]`, score: 100, reason: 'Stable test identifier.' });

  const id = element.getAttribute('id');
  if (id) add({ kind: 'id', value: `#${escapeCss(id)}`, score: 95, reason: 'Unique element id.' });

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) add({ kind: 'aria-label', value: `${element.tagName.toLowerCase()}[aria-label="${escapeAttribute(ariaLabel)}"]`, score: 90, reason: 'Accessible label.' });

  const name = element.getAttribute('name');
  if (name) add({ kind: 'name', value: `${element.tagName.toLowerCase()}[name="${escapeAttribute(name)}"]`, score: 85, reason: 'Semantic form name.' });

  const role = element.getAttribute('role');
  if (role && ariaLabel) add({ kind: 'role', value: `[role="${escapeAttribute(role)}"][aria-label="${escapeAttribute(ariaLabel)}"]`, score: 88, reason: 'Accessible role and label.' });

  const href = element.getAttribute('href');
  if (href && element.tagName.toLowerCase() === 'a') add({ kind: 'href', value: `a[href="${escapeAttribute(href)}"]`, score: 75, reason: 'Stable link target.' });

  add({ kind: 'css-path', value: buildCssPath(element), score: 50, reason: 'Short structural CSS path.' });

  const text = normalizeText(element.textContent ?? '');
  if (text && text.length <= 80) {
    add({ kind: 'text', value: xpathForText(element, text), score: 35, reason: 'Exact visible text fallback.' });
  }

  return candidates.sort((left, right) => right.score - left.score);
}

export function extractFields(root: ParentNode, mappings: FieldMapping[]): ExtractedField[] {
  return mappings.map((mapping) => {
    const nodes = Array.from(root.querySelectorAll(mapping.selector));
    const values = nodes.map((node) => mapping.attribute ? node.getAttribute(mapping.attribute) : normalizeText(node.textContent ?? '')).filter((value): value is string => Boolean(value));
    return { name: mapping.name, value: mapping.multiple ? values : values[0] ?? null };
  });
}

function isUnique(element: Element, selector: string): boolean {
  try {
    return element.ownerDocument.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function buildCssPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === 1 && parts.length < 5) {
    const tag = current.tagName.toLowerCase();
    const classes = Array.from(current.classList).filter(Boolean).slice(0, 2).map(escapeCss);
    let part = classes.length ? `${tag}.${classes.join('.')}` : tag;
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings: Element[] = Array.from(parent.children).filter((child: Element) => child.tagName === current?.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    const candidate = parts.join(' > ');
    if (isUnique(element, candidate)) return candidate;
    current = parent;
  }
  return parts.join(' > ');
}

function xpathForText(element: Element, text: string): string {
  const tag = element.tagName.toLowerCase();
  return `//${tag}[normalize-space(.)=${toXPathLiteral(text)}]`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeCss(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function toXPathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `concat("${value.split('"').join('", \'"\', "')}")`;
}
