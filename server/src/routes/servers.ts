import { Hono } from "hono";
import {
  createGroup,
  createServer,
  copyServer,
  deleteGroup,
  deleteServer,
  getCredentialValue,
  getServer,
  getServerTree,
  moveTreeItem,
  updateGroup,
  updateServer,
} from "../db/servers";
import {
  parsePrivateKeyCredential,
  validatePrivateKeyCredential,
} from "../lib/private-key-credential";
import { jsonError } from "../lib/http";
import { isValidServerHost } from "../lib/resolve-host";
import type { Variables } from "../types";

export const serverRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

function validateHost(host: string | undefined): string | null {
  const trimmed = host?.trim();
  if (!trimmed) return "host is required";
  if (!isValidServerHost(trimmed)) {
    return "host must be a valid IP address or domain name";
  }
  return null;
}

serverRoutes.get("/tree", async (c) => {
  const user = c.get("user");
  const tree = await getServerTree(c.env.DB, user.id);
  return c.json({ tree });
});

serverRoutes.post("/groups", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name?: string; parent_id?: string | null }>();

  if (!body.name?.trim()) return jsonError(c, 400, "name is required");

  try {
    const group = await createGroup(c.env.DB, user.id, {
      name: body.name.trim(),
      parent_id: body.parent_id ?? null,
    });
    return c.json({ group }, 201);
  } catch (error) {
    return jsonError(
      c,
      400,
      error instanceof Error ? error.message : "failed to create group",
    );
  }
});

serverRoutes.put("/groups/:id", async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  const body = await c.req.json<{ name?: string; parent_id?: string | null }>();

  try {
    const group = await updateGroup(c.env.DB, user.id, groupId, {
      name: body.name?.trim(),
      parent_id: body.parent_id,
    });
    if (!group) return jsonError(c, 404, "group not found");
    return c.json({ group });
  } catch (error) {
    return jsonError(
      c,
      400,
      error instanceof Error ? error.message : "failed to update group",
    );
  }
});

serverRoutes.delete("/groups/:id", async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  const deleted = await deleteGroup(c.env.DB, user.id, groupId);
  if (!deleted) return jsonError(c, 404, "group not found");
  return c.json({ ok: true });
});

serverRoutes.put("/move", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    type?: "server" | "group";
    id?: string;
    parentId?: string | null;
    sortOrder?: number;
    index?: number;
  }>();

  if (body.type !== "server" && body.type !== "group") {
    return jsonError(c, 400, "type must be server or group");
  }
  if (!body.id) return jsonError(c, 400, "id is required");
  const index = body.index ?? body.sortOrder;
  if (typeof index !== "number") {
    return jsonError(c, 400, "index is required");
  }

  const parentId = body.parentId ?? null;

  try {
    await moveTreeItem(c.env.DB, user.id, {
      type: body.type,
      id: body.id,
      parentId,
      index,
    });
    const tree = await getServerTree(c.env.DB, user.id);
    return c.json({ tree });
  } catch (error) {
    return jsonError(
      c,
      400,
      error instanceof Error ? error.message : "failed to move item",
    );
  }
});

serverRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tree = await getServerTree(c.env.DB, user.id);
  return c.json({ tree });
});

serverRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    auth_type?: "password" | "private_key";
    credential?: string;
    group_id?: string | null;
  }>();

  if (!body.name?.trim()) return jsonError(c, 400, "name is required");
  const hostError = validateHost(body.host);
  if (hostError) return jsonError(c, 400, hostError);
  if (!body.username?.trim()) return jsonError(c, 400, "username is required");
  if (!body.credential?.trim()) {
    return jsonError(c, 400, "credential is required");
  }
  if (body.auth_type !== "password" && body.auth_type !== "private_key") {
    return jsonError(c, 400, "auth_type must be password or private_key");
  }

  const port = body.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return jsonError(c, 400, "port must be between 1 and 65535");
  }

  try {
    const credential =
      body.auth_type === "private_key"
        ? validatePrivateKeyCredential(body.credential!.trim())
        : body.credential!.trim();
    const server = await createServer(c.env.DB, user.id, {
      name: body.name.trim(),
      host: body.host!.trim(),
      port,
      username: body.username.trim(),
      auth_type: body.auth_type,
      credential,
      group_id: body.group_id ?? null,
    });
    return c.json({ server }, 201);
  } catch (error) {
    return jsonError(
      c,
      400,
      error instanceof Error ? error.message : "failed to create server",
    );
  }
});

serverRoutes.post("/:id/copy", async (c) => {
  const user = c.get("user");
  const sourceId = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    auth_type?: "password" | "private_key";
    credential?: string;
    group_id?: string | null;
  }>();

  if (!body.name?.trim()) return jsonError(c, 400, "name is required");
  const hostError = validateHost(body.host);
  if (hostError) return jsonError(c, 400, hostError);
  if (!body.username?.trim()) return jsonError(c, 400, "username is required");
  if (body.auth_type !== "password" && body.auth_type !== "private_key") {
    return jsonError(c, 400, "auth_type must be password or private_key");
  }

  const port = body.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return jsonError(c, 400, "port must be between 1 and 65535");
  }

  try {
    let credential = body.credential?.trim();
    if (credential && body.auth_type === "private_key") {
      credential = validatePrivateKeyCredential(credential);
    } else if (credential && body.auth_type === "password") {
      credential = credential.trim();
    }

    const server = await copyServer(c.env.DB, user.id, sourceId, {
      name: body.name.trim(),
      host: body.host!.trim(),
      port,
      username: body.username.trim(),
      auth_type: body.auth_type,
      credential,
      group_id: body.group_id ?? null,
    });
    return c.json({ server }, 201);
  } catch (error) {
    return jsonError(
      c,
      400,
      error instanceof Error ? error.message : "failed to copy server",
    );
  }
});

serverRoutes.put("/:id", async (c) => {
  const user = c.get("user");
  const serverId = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    auth_type?: "password" | "private_key";
    credential?: string;
    passphrase?: string;
    group_id?: string | null;
  }>();

  if (
    body.auth_type !== undefined &&
    body.auth_type !== "password" &&
    body.auth_type !== "private_key"
  ) {
    return jsonError(c, 400, "auth_type must be password or private_key");
  }

  if (body.port !== undefined) {
    if (!Number.isInteger(body.port) || body.port < 1 || body.port > 65535) {
      return jsonError(c, 400, "port must be between 1 and 65535");
    }
  }

  if (body.host !== undefined) {
    const hostError = validateHost(body.host);
    if (hostError) return jsonError(c, 400, hostError);
  }

  try {
    let credential = body.credential?.trim();
    const nextAuthType = body.auth_type;
    if (credential && nextAuthType === "private_key") {
      credential = validatePrivateKeyCredential(credential);
    }

    const server = await updateServer(c.env.DB, user.id, serverId, {
      name: body.name?.trim(),
      host: body.host?.trim(),
      username: body.username?.trim(),
      port: body.port,
      auth_type: body.auth_type,
      credential,
      passphrase: body.passphrase,
      group_id: body.group_id,
    });

    if (!server) return jsonError(c, 404, "server not found");
    return c.json({ server });
  } catch (error) {
    return jsonError(
      c,
      400,
      error instanceof Error ? error.message : "failed to update server",
    );
  }
});

// The server's address and credential, for a client that connects to it
// itself (the desktop app) instead of through a session of the site.
serverRoutes.get("/:id/credential", async (c) => {
  const user = c.get("user");
  const server = await getServer(c.env.DB, user.id, c.req.param("id"));
  if (!server) return jsonError(c, 404, "server not found");
  const value = await getCredentialValue(c.env.DB, user.id, server.credential_ref);
  if (value === null) return jsonError(c, 404, "credential not found");
  c.header("Cache-Control", "no-store");
  const base = {
    id: server.id,
    host: server.host,
    port: server.port,
    username: server.username,
    auth_type: server.auth_type,
  };
  if (server.auth_type === "password") {
    return c.json({ ...base, password: value });
  }
  const key = parsePrivateKeyCredential(value);
  return c.json({
    ...base,
    private_key: key.privateKey,
    passphrase: key.passphrase ?? "",
  });
});

serverRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const serverId = c.req.param("id");
  const deleted = await deleteServer(c.env.DB, user.id, serverId);
  if (!deleted) return jsonError(c, 404, "server not found");
  return c.json({ ok: true });
});
