const blockedHostnames = new Set(['localhost', 'metadata.google.internal', 'instance-data.ec2.internal']);

function isBlockedIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd');
}

export function validateTargetUrl(value: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'URL must be valid.';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'Only http and https URLs are supported.';
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIpv6 = hostname.includes(':');
  if (blockedHostnames.has(hostname) || hostname.endsWith('.localhost') ||
    (isIpv4 && isBlockedIpv4(hostname)) || (isIpv6 && isBlockedIpv6(hostname))) {
    return 'Private and local network targets are not allowed.';
  }
}
