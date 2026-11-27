const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

function stripBrackets(host: string): string {
  const trimmed = host.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isIPv4(host: string): boolean {
  return IPV4_RE.test(host);
}

function isIPv6(host: string): boolean {
  if (!host.includes(":")) return false;
  return /^[0-9a-fA-F:.]+$/.test(host);
}

export function isIpAddress(host: string): boolean {
  const normalized = stripBrackets(host);
  return isIPv4(normalized) || isIPv6(normalized);
}

function isValidDomainName(host: string): boolean {
  if (
    host.length > 253 ||
    !/^[a-zA-Z0-9.-]+$/.test(host) ||
    host.startsWith(".") ||
    host.endsWith(".") ||
    host.includes("..")
  ) {
    return false;
  }

  for (const label of host.split(".")) {
    if (label.length === 0 || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
  }

  return true;
}

export function isValidServerHost(host: string): boolean {
  const normalized = stripBrackets(host.trim());
  if (!normalized) return false;
  return isIpAddress(normalized) || isValidDomainName(normalized);
}
