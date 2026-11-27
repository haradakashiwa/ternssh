import { connectThroughTunnel } from "./cloudflare-tunnel";
import type { SSHConnectionConfig } from "../ssh/types";

const DOH_URL = "https://1.1.1.1/dns-query";

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

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

function formatConnectHostname(address: string): string {
  return address.includes(":") ? `[${address}]` : address;
}

async function queryDoh(name: string, type: "A" | "AAAA"): Promise<string | null> {
  const url = new URL(DOH_URL);
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/dns-json" },
  });
  if (!response.ok) {
    throw new Error(`DNS 查询失败 (${response.status})`);
  }

  const body = (await response.json()) as DohResponse;
  if (body.Status !== 0 || !body.Answer?.length) {
    return null;
  }

  const typeCode = type === "A" ? 1 : 28;
  const record = body.Answer.find((answer) => answer.type === typeCode);
  return record?.data ?? null;
}

export async function resolveHostAddress(host: string): Promise<string> {
  const normalized = stripBrackets(host);
  if (!normalized) {
    throw new Error("主机名为空");
  }

  if (isIpAddress(normalized)) {
    return normalized;
  }

  if (!isValidDomainName(normalized)) {
    throw new Error("无效的主机名");
  }

  const ipv4 = await queryDoh(normalized, "A");
  if (ipv4) return ipv4;

  const ipv6 = await queryDoh(normalized, "AAAA");
  if (ipv6) return ipv6;

  throw new Error(`无法解析域名: ${normalized}`);
}

/** Opens the byte stream an SSH session runs over: direct TCP, or a Cloudflare Tunnel. */
export async function connectToServer(config: SSHConnectionConfig) {
  if (config.tunnel) {
    const hostname = stripBrackets(config.host);
    if (!isValidDomainName(hostname)) {
      throw new Error("Cloudflare Tunnel 连接需要填写隧道的主机名（域名）");
    }
    return connectThroughTunnel(hostname, config.tunnel.accessToken);
  }
  return connectToHost(config.host, config.port);
}

export async function connectToHost(host: string, port: number) {
  const { connect } = await import("cloudflare:sockets");
  const address = await resolveHostAddress(host);
  const socket = connect({
    hostname: formatConnectHostname(address),
    port,
  });
  await socket.opened;
  return socket;
}
