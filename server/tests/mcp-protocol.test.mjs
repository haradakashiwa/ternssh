import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery as statements } from "wrangler";

test("MCP transport, web authentication and scope replacement through the Worker", async (t) => {
  const source = await build({
    entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    bundle: true, format: "esm", write: false, platform: "browser", external: ["cloudflare:*"],
  });
  const mf = new Miniflare({
    modules: true, script: source.outputFiles[0].text, compatibilityDate: "2026-01-01",
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
  const webHeaders = {
    Authorization: "Basic " + Buffer.from("owner:" + password).toString("base64"),
    Origin: origin, "Content-Type": "application/json",
  };
  const request = (path, method = "GET", headers = {}, data) => mf.dispatchFetch(origin + path, {
    method, headers, body: data === undefined ? undefined : JSON.stringify(data),
  });
  assert.deepEqual(await (await request("/api/health")).json(), { ok: true });
  for (const path of ["/api/v1/me/reset", "/api/v1/dashboards/reset"]) {
    assert.equal((await request(path, "POST", { ...webHeaders, Origin: "https://foreign.example" })).status, 403);
  }
  const manager = "/api/v1/mcp-access";
  const tokenLike = "tmcp_" + "x".repeat(43);
  assert.equal((await request("/mcp", "POST", { Authorization: "Bearer " + tokenLike })).status, 403);
  assert.equal((await request(manager + "/state")).status, 403);
  assert.equal((await request("/api/v1/onboarding/setup", "POST", webHeaders,
    { username: "owner", password, confirmPassword: password })).status, 201);

  assert.equal((await request(manager + "/tokens", "POST", { ...webHeaders, Origin: "https://cross-site.example" }, {})).status, 403);
  const created = await request(manager + "/tokens", "POST", webHeaders, {});
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("cache-control"), "no-store");
  const pairing = await created.json();
  const rpcHeaders = {
    Authorization: "Bearer " + pairing.token,
    "Content-Type": "application/json", Accept: "application/json, text/event-stream",
  };
  const rpc = (method, params, overrides = {}) => request("/mcp", "POST", { ...rpcHeaders, ...overrides },
    { jsonrpc: "2.0", id: 1, method, params });
  const list = async () => {
    const response = await rpc("tools/call", { name: "list_authorized_servers", arguments: {} });
    assert.equal(response.status, 200);
    const data = await response.json();
    return JSON.parse(data.result.content[0].text).servers;
  };
  assert.equal((await rpc("ping", {}, { Authorization: "" })).status, 401);
  assert.equal((await rpc("ping", {}, { Authorization: webHeaders.Authorization })).status, 401);
  assert.equal((await rpc("ping", {}, { Authorization: "Bearer " + tokenLike })).status, 401);
  assert.equal((await request(manager + "/state", "GET", rpcHeaders)).status, 401);
  assert.equal((await request("/api/v1/servers/missing/credential", "GET", rpcHeaders)).status, 401);
  assert.equal((await rpc("ping", {}, { Origin: "https://cross-site.example" })).status, 403);
  assert.equal((await rpc("ping", {}, { Accept: "text/html" })).status, 406);
  assert.equal((await rpc("ping", {}, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await rpc("ping", {}, { "MCP-Protocol-Version": "unknown" })).status, 400);
  assert.equal((await rpc("ping", { large: "x".repeat(17000) })).status, 413);
  assert.equal((await request("/mcp", "GET", rpcHeaders)).status, 405);

  const init = await rpc("initialize", {
    protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" },
  });
  assert.equal((await init.json()).result.protocolVersion, "2025-11-25");
  const notification = await request("/mcp", "POST", rpcHeaders,
    { jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");
  const catalog = await (await rpc("tools/list", {})).json();
  assert.ok(catalog.result.tools.some((tool) => tool.name === "list_authorized_servers"));
  const invalid = await (await rpc("tools/call", { name: "grant_server" })).json();
  assert.equal(invalid.error.code, -32602);
  assert.deepEqual(await list(), []);

  await db.prepare("INSERT INTO credentials (id, user_id, value) VALUES ('test-cred','default','fixture')").run();
  await db.prepare(`INSERT INTO servers (id, user_id, name, host, username, auth_type, credential_ref)
    VALUES ('a','default','A','a.invalid','test','password','test-cred'),
           ('b','default','B','b.invalid','test','password','test-cred')`).run();
  const state = async () => (await request(manager + "/state", "GET", webHeaders)).json();
  const select = async (id) => {
    const { revision, availableServers } = await state();
    const { identityVersion } = availableServers.find((server) => server.id === id);
    return request(manager + "/authorization", "PUT", webHeaders, { revision, servers: [{ id, identityVersion }] });
  };
  assert.equal((await select("a")).status, 200);
  assert.deepEqual(await list(), [{ id: "a", name: "A" }]);
  assert.equal((await select("b")).status, 200);
  assert.deepEqual(await list(), [{ id: "b", name: "B" }]);
  assert.equal((await request(manager + "/authorization", "DELETE", webHeaders)).status, 200);
  assert.deepEqual(await list(), []);
  const afterEnd = await state();
  assert.equal(afterEnd.tokens.length, 1);
  assert.ok(!JSON.stringify(afterEnd).includes(pairing.token));
  assert.equal((await request(manager + "/tokens/" + pairing.id, "DELETE", webHeaders)).status, 200);
  assert.equal((await rpc("tools/list", {})).status, 401);
});
