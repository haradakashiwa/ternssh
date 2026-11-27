import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getAuthMode } from "../auth/identity";
import { authenticateMcpToken, listMcpAuthorizedServers } from "../db/mcp-access";

const supportedVersions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const listServers = {
  name: "list_authorized_servers",
  description: "List the servers currently selected and confirmed in the ternssh workspace.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, openWorldHint: false },
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rpcError(id: string | number | null, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

function unauthorized() {
  return new Response(null, {
    status: 401,
    headers: { "WWW-Authenticate": 'Bearer realm="ternssh-mcp"' },
  });
}

export const mcpRoutes = new Hono<{ Bindings: Env; Variables: { token: string } }>();

mcpRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
  const origin = c.req.header("Origin");
  if (origin !== undefined && origin !== new URL(c.req.url).origin) {
    return c.body(null, 403);
  }
  const match = /^Bearer (tmcp_[A-Za-z0-9_-]{43})$/i.exec(c.req.header("Authorization") ?? "");
  if (!match) return unauthorized();
  if (await getAuthMode(c.env) === "onboarding") return c.body(null, 403);
  if (!(await authenticateMcpToken(c.env.DB, match[1]))) return unauthorized();
  c.set("token", match[1]);
  return next();
});

mcpRoutes.post("/", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.body(null, 413) }), async (c) => {
  if (c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return c.body(null, 415);
  }
  const accepts = (c.req.header("Accept") ?? "").toLowerCase()
    .split(",").map((v) => v.split(";")[0].trim());
  if (!accepts.includes("application/json") || !accepts.includes("text/event-stream")) {
    return c.body(null, 406);
  }
  const version = c.req.header("MCP-Protocol-Version");
  if (version && !supportedVersions.includes(version)) {
    return rpcError(null, -32600, "Unsupported protocol version", 400);
  }
  let message: unknown;
  try {
    message = await c.req.json();
  } catch {
    return rpcError(null, -32700, "Invalid JSON", 400);
  }
  if (!object(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(null, -32600, "Invalid request", 400);
  }
  const { id, method, params } = message;
  if (id === undefined && method.startsWith("notifications/")) return c.body(null, 202);
  if (typeof id !== "string" && typeof id !== "number") {
    return rpcError(null, -32600, "Invalid request id", 400);
  }
  if (params !== undefined && !object(params)) return rpcError(id, -32602, "Invalid params");
  const result = (value: unknown) => c.json({ jsonrpc: "2.0", id, result: value });
  switch (method) {
    case "initialize": {
      if (typeof params?.protocolVersion !== "string" || !object(params.capabilities) ||
          !object(params.clientInfo) || typeof params.clientInfo.name !== "string" ||
          typeof params.clientInfo.version !== "string") {
        return rpcError(id, -32602, "Invalid initialization parameters");
      }
      return result({
        protocolVersion: supportedVersions.includes(params.protocolVersion)
          ? params.protocolVersion : supportedVersions[0],
        capabilities: { tools: {} },
        serverInfo: { name: "ternssh", version: "1.0.0" },
      });
    }
    case "ping":
      return result({});
    case "tools/list":
      return result({ tools: [listServers] });
    case "tools/call": {
      if (params?.name !== listServers.name) return rpcError(id, -32602, "Unknown tool");
      const args = params.arguments;
      if (args !== undefined && (!object(args) || Object.keys(args).length > 0)) {
        return rpcError(id, -32602, "This tool takes no arguments");
      }
      const servers = await listMcpAuthorizedServers(c.env.DB, c.get("token"));
      if (!servers) return unauthorized();
      return result({ content: [{ type: "text", text: JSON.stringify({ servers }) }] });
    }
    default:
      return rpcError(id, -32601, "Method not found");
  }
});

mcpRoutes.all("/", (c) => {
  c.header("Allow", "POST");
  return c.body(null, 405);
});

mcpRoutes.all("*", (c) => c.notFound());

mcpRoutes.onError(() => new Response("MCP service unavailable", {
  status: 503,
  headers: { "Cache-Control": "no-store" },
}));
