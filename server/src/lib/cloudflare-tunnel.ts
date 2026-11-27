// SSH through a Cloudflare Tunnel, the way `cloudflared access ssh --hostname <host>`
// reaches it: a WebSocket to https://<host> whose binary messages carry the raw
// TCP stream that the tunnel's `ssh://` ingress forwards to the SSH daemon.
// A server cannot sign in through a browser, so an Access-protected hostname
// needs a service token (an Access policy with the "Service Auth" action).

export interface CloudflareAccessServiceToken {
  clientId: string;
  clientSecret: string;
}

/** The same shape as a `cloudflare:sockets` Socket, as far as SSHSession uses it. */
export interface StreamSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): void;
}

const CONNECT_TIMEOUT_MS = 15_000;

export function parseServiceToken(value: string | null): CloudflareAccessServiceToken | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { client_id?: unknown; client_secret?: unknown };
    if (typeof parsed.client_id === "string" && typeof parsed.client_secret === "string" &&
        parsed.client_id && parsed.client_secret) {
      return { clientId: parsed.client_id, clientSecret: parsed.client_secret };
    }
  } catch {
    // fall through
  }
  return null;
}

export function serializeServiceToken(token: CloudflareAccessServiceToken): string {
  return JSON.stringify({ client_id: token.clientId, client_secret: token.clientSecret });
}

/** Validates a service token from a request body; null when it is malformed. */
export function validateServiceToken(
  clientId: unknown,
  clientSecret: unknown,
): CloudflareAccessServiceToken | null {
  if (typeof clientId !== "string" || typeof clientSecret !== "string") return null;
  const id = clientId.trim();
  const secret = clientSecret.trim();
  // Access client IDs end in ".access"; both parts are printable ASCII header values.
  if (!id || !secret || id.length > 256 || secret.length > 256) return null;
  if (!/^[\x21-\x7e]+$/.test(id) || !/^[\x21-\x7e]+$/.test(secret)) return null;
  return { clientId: id, clientSecret: secret };
}

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

export async function connectThroughTunnel(
  hostname: string,
  token: CloudflareAccessServiceToken | null,
): Promise<StreamSocket> {
  const headers = new Headers({ Upgrade: "websocket" });
  if (token) {
    headers.set("CF-Access-Client-Id", token.clientId);
    headers.set("CF-Access-Client-Secret", token.clientSecret);
  }

  const url = `https://${hostname}/`;
  const response = await fetch(url, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
  });

  const ws = response.webSocket;
  if (!ws) {
    // Access answers an unauthenticated request with a redirect to its login page.
    if (response.status >= 300 && response.status < 400 || response.status === 401 ||
        response.status === 403) {
      throw new Error(
        `Cloudflare Access 拒绝了连接 (${response.status})：请检查 Service Token，并确认该应用的策略对其放行 (Service Auth)`,
      );
    }
    throw new Error(`无法通过 Cloudflare Tunnel 连接 ${hostname} (HTTP ${response.status})`);
  }
  ws.accept();

  let closed = false;
  const closeSocket = () => {
    if (closed) return;
    closed = true;
    try {
      ws.close(1000, "closed");
    } catch {
      // already closed
    }
  };

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      ws.addEventListener("message", (event) => {
        const bytes = toBytes(event.data);
        if (bytes) {
          controller.enqueue(bytes);
        } else if (typeof event.data === "string") {
          controller.enqueue(new TextEncoder().encode(event.data));
        }
      });
      ws.addEventListener("close", () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
      ws.addEventListener("error", () => {
        closed = true;
        try {
          controller.error(new Error("Cloudflare Tunnel WebSocket error"));
        } catch {
          // already closed
        }
      });
    },
    cancel: closeSocket,
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      if (closed) throw new Error("Cloudflare Tunnel connection is closed");
      ws.send(chunk);
    },
    close: closeSocket,
    abort: closeSocket,
  });

  return { readable, writable, close: closeSocket };
}
