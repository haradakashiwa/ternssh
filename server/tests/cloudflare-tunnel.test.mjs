import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery as statements } from "wrangler";

const bundle = async (entry) => (await build({
  entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
  bundle: true, format: "esm", write: false, platform: "browser", external: ["cloudflare:*"],
})).outputFiles[0].text;

// Stands in for the edge in front of a tunnel: Access checks the service token,
// then the `ssh://` ingress carries the stream. Here the "SSH daemon" answers with
// its version line and echoes every byte back.
const tunnelEdge = `
export default {
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("no upgrade", { status: 426 });
    if (request.headers.get("CF-Access-Client-Id") !== "abc.access" ||
        request.headers.get("CF-Access-Client-Secret") !== "s3cret") {
      return new Response(null, { status: 302, headers: { Location: "https://team.cloudflareaccess.com/login" } });
    }
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    server.send(new TextEncoder().encode("SSH-2.0-OpenSSH_9.9\\r\\n"));
    server.addEventListener("message", (event) => {
      if (new TextDecoder().decode(event.data) === "bye") return server.close(1000, "done");
      server.send(event.data);
    });
    return new Response(null, { status: 101, webSocket: client });
  },
};`;

const client = `
import { connectThroughTunnel } from "./cloudflare-tunnel.ts";
export default {
  async fetch(request) {
    const token = new URL(request.url).searchParams.get("token") === "good"
      ? { clientId: "abc.access", clientSecret: "s3cret" } : null;
    try {
      const socket = await connectThroughTunnel("ssh.example.com", token);
      const reader = socket.readable.getReader();
      const writer = socket.writable.getWriter();
      const decoder = new TextDecoder();
      const banner = decoder.decode((await reader.read()).value);
      await writer.write(new Uint8Array([0, 1, 2, 255]));
      const echoed = Array.from((await reader.read()).value);
      await writer.write(new TextEncoder().encode("bye"));
      const ended = (await reader.read()).done;
      return Response.json({ banner, echoed, ended });
    } catch (error) {
      return Response.json({ error: error.message }, { status: 502 });
    }
  },
};`;

test("a tunnel connection carries raw bytes over a WebSocket with the Access service token", async (t) => {
  const tunnelModule = await bundle("../src/lib/cloudflare-tunnel.ts");
  const mf = new Miniflare({
    workers: [
      {
        name: "client", compatibilityDate: "2026-01-01", outboundService: "edge",
        modules: [
          { type: "ESModule", path: "client.mjs", contents: client },
          { type: "ESModule", path: "cloudflare-tunnel.ts", contents: tunnelModule },
        ],
      },
      { name: "edge", modules: true, script: tunnelEdge, compatibilityDate: "2026-01-01" },
    ],
  });
  t.after(() => mf.dispose());

  const ok = await mf.dispatchFetch("https://client.test/?token=good");
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), {
    banner: "SSH-2.0-OpenSSH_9.9\r\n",
    echoed: [0, 1, 2, 255],
    ended: true,
  });

  const denied = await mf.dispatchFetch("https://client.test/");
  assert.equal(denied.status, 502);
  assert.match((await denied.json()).error, /Cloudflare Access 拒绝了连接 \(302\)/);
});

test("servers keep their tunnel token private and drop it when they go back to a direct connection", async (t) => {
  const mf = new Miniflare({
    modules: true, script: await bundle("../src/index.ts"), compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"], cf: false,
    serviceBindings: { ASSETS: () => new Response("web assets") },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(file, migrations), "utf8");
    await db.batch(statements(sql).map((s) => db.prepare(s)));
  }

  const origin = "https://ternssh.example";
  const password = randomUUID();
  const headers = {
    Authorization: "Basic " + Buffer.from("owner:" + password).toString("base64"),
    Origin: origin, "Content-Type": "application/json",
  };
  const request = (path, method = "GET", data) => mf.dispatchFetch(origin + path, {
    method, headers, body: data === undefined ? undefined : JSON.stringify(data),
  });
  assert.equal((await mf.dispatchFetch(origin + "/api/v1/onboarding/setup", {
    method: "POST", headers, body: JSON.stringify({ username: "owner", password, confirmPassword: password }),
  })).status, 201);

  const base = { name: "box", host: "ssh.example.com", port: 22, username: "root", auth_type: "password", credential: "pw" };
  const token = { client_id: "abc.access", client_secret: "s3cret" };

  // A tunnel is addressed by hostname, and a token needs both of its parts.
  assert.equal((await request("/api/v1/servers", "POST",
    { ...base, host: "10.0.0.1", connection_type: "cloudflare_tunnel" })).status, 400);
  assert.equal((await request("/api/v1/servers", "POST",
    { ...base, connection_type: "cloudflare_tunnel", tunnel_token: { client_id: "abc.access" } })).status, 400);
  assert.equal((await request("/api/v1/servers", "POST", { ...base, connection_type: "ssh" })).status, 400);

  const createdResponse = await request("/api/v1/servers", "POST",
    { ...base, connection_type: "cloudflare_tunnel", tunnel_token: token });
  assert.equal(createdResponse.status, 201);
  const { server } = await createdResponse.json();
  assert.equal(server.connection_type, "cloudflare_tunnel");
  assert.equal(server.has_tunnel_token, true);

  // The tree never carries the secret; the desktop credential endpoint does.
  const tree = await (await request("/api/v1/servers/tree")).text();
  assert.ok(!tree.includes("s3cret"));
  const credential = await (await request(`/api/v1/servers/${server.id}/credential`)).json();
  assert.equal(credential.connection_type, "cloudflare_tunnel");
  assert.deepEqual(credential.tunnel_token, token);

  // A copy keeps the token unless the request replaces it.
  const copy = (await (await request(`/api/v1/servers/${server.id}/copy`, "POST",
    { ...base, name: "box copy", credential: undefined })).json()).server;
  assert.equal(copy.connection_type, "cloudflare_tunnel");
  assert.equal(copy.has_tunnel_token, true);

  // Editing other fields keeps the token; switching to direct removes the stored row.
  const countCredentials = async () =>
    (await db.prepare("SELECT COUNT(*) AS n FROM credentials").first()).n;
  const before = await countCredentials();
  let updated = (await (await request(`/api/v1/servers/${server.id}`, "PUT", { name: "renamed" })).json()).server;
  assert.equal(updated.has_tunnel_token, true);
  updated = (await (await request(`/api/v1/servers/${server.id}`, "PUT", { connection_type: "direct" })).json()).server;
  assert.equal(updated.connection_type, "direct");
  assert.equal(updated.has_tunnel_token, false);
  assert.equal(await countCredentials(), before - 1);

  // Deleting a tunnel server deletes both of its credentials.
  const beforeDelete = await countCredentials();
  assert.equal((await request(`/api/v1/servers/${copy.id}`, "DELETE")).status, 200);
  assert.equal(await countCredentials(), beforeDelete - 2);
});
