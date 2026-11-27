import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  endMcpAuthorization,
  getMcpAccessState,
  issueMcpToken,
  replaceMcpAuthorization,
  revokeMcpToken,
  type McpSelection,
} from "../db/mcp-access";
import type { Variables } from "../types";

export const mcpAccessRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

mcpAccessRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  const origin = c.req.header("Origin");
  const sameOrigin = origin === new URL(c.req.url).origin;
  const write = !["GET", "HEAD", "OPTIONS"].includes(c.req.method);
  if ((write || origin !== undefined) && !sameOrigin) {
    return c.json({ error: "A same-origin request is required" }, 403);
  }
  if (["POST", "PUT"].includes(c.req.method) &&
      c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return c.json({ error: "Expected application/json" }, 415);
  }
  await next();
});

mcpAccessRoutes.use("*", bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.json({ error: "Request is too large" }, 413),
}));

mcpAccessRoutes.get("/state", async (c) => {
  return c.json(await getMcpAccessState(c.env.DB, c.get("user").id));
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSelection(value: unknown): McpSelection[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const servers: McpSelection[] = [];
  for (const entry of value) {
    if (!isObject(entry)) return null;
    const { id, identityVersion } = entry;
    if (typeof id !== "string" || !id.length || id.length > 128 || seen.has(id) ||
        typeof identityVersion !== "string" || !/^[a-f0-9]{32}$/.test(identityVersion)) {
      return null;
    }
    seen.add(id);
    servers.push({ id, identityVersion });
  }
  return servers;
}

mcpAccessRoutes.put("/authorization", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isObject(body) || typeof body.revision !== "number" ||
      !Number.isSafeInteger(body.revision) || body.revision < 0) {
    return c.json({ error: "Invalid authorization revision" }, 400);
  }
  const servers = parseSelection(body.servers);
  if (servers === null) return c.json({ error: "Invalid server selection" }, 400);
  const replaced = await replaceMcpAuthorization(c.env.DB, c.get("user").id, body.revision, servers);
  if (!replaced) return c.json({ error: "The authorization or selected server has changed" }, 409);
  return c.json({ ok: true });
});

mcpAccessRoutes.delete("/authorization", async (c) => {
  await endMcpAuthorization(c.env.DB, c.get("user").id);
  return c.json({ ok: true });
});

mcpAccessRoutes.post("/tokens", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isObject(body) || Object.keys(body).length !== 0) {
    return c.json({ error: "Expected an empty JSON object" }, 400);
  }
  return c.json(await issueMcpToken(c.env.DB, c.get("user").id), 201);
});

mcpAccessRoutes.delete("/tokens/:id", async (c) => {
  if (!await revokeMcpToken(c.env.DB, c.get("user").id, c.req.param("id"))) {
    return c.json({ error: "Pairing not found" }, 404);
  }
  return c.json({ ok: true });
});
