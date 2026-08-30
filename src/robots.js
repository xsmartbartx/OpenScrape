const USER_AGENT = 'OpenScrape';

export function parseRobotsTxt(text, userAgent = USER_AGENT) {
  const groups = [];
  let group = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) { group = null; continue; }
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (!group || group.rules.length) { group = { agents: [], rules: [] }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && group) {
      group.rules.push({ type: key, path: value });
    }
  }
  const normalizedAgent = userAgent.toLowerCase();
  const matchingGroups = groups.filter((item) => item.agents.some((agent) => agent !== '*' && normalizedAgent.includes(agent)));
  const selected = matchingGroups.length ? matchingGroups : groups.filter((item) => item.agents.includes('*'));
  return selected.flatMap((item) => item.rules).filter((rule) => rule.path !== '');
}

export function isAllowedByRobots(url, robotsText, userAgent = USER_AGENT) {
  const path = new URL(url).pathname + new URL(url).search;
  const matches = parseRobotsTxt(robotsText, userAgent).filter((rule) => ruleMatches(path, rule.path));
  if (!matches.length) return { allowed: true, matchedRule: null };
  matches.sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length || (a.type === 'allow' ? -1 : 1));
  const rule = matches[0];
  return { allowed: rule.type === 'allow', matchedRule: rule };
}

export async function assertRobotsAllowed(url, fetcher = fetch) {
  const target = new URL(url);
  const robotsUrl = new URL('/robots.txt', target).toString();
  let response;
  try {
    response = await fetcher(robotsUrl, { headers: { 'user-agent': `${USER_AGENT}/0.1` }, redirect: 'follow', signal: AbortSignal.timeout(8_000) });
  } catch {
    return { checked: false, allowed: true, reason: 'robots.txt could not be retrieved; allowing the run.' };
  }
  if (response.status === 401 || response.status === 403) return { checked: true, allowed: false, reason: `robots.txt returned ${response.status}.` };
  if (!response.ok) return { checked: false, allowed: true, reason: `robots.txt returned ${response.status}; allowing the run.` };
  const result = isAllowedByRobots(url, await response.text());
  return result.allowed
    ? { checked: true, allowed: true, reason: result.matchedRule ? `Allowed by ${result.matchedRule.path}.` : 'No matching robots.txt rule.' }
    : { checked: true, allowed: false, reason: `Blocked by robots.txt rule: ${result.matchedRule.path}` };
}

function ruleMatches(path, rule) {
  const anchored = rule.endsWith('$');
  const source = anchored ? rule.slice(0, -1) : rule;
  const pattern = `^${source.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}${anchored ? '$' : ''}`;
  return new RegExp(pattern).test(path);
}
