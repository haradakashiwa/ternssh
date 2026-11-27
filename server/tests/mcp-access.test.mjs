import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { Hono } from "hono";
import { authenticateMcpToken, listMcpAuthorizedServers } from "../src/db/mcp-access.ts";
import { resetUserData } from "../src/db/reset-user-data.ts";
import { mcpAccessRoutes } from "../src/routes/mcp-access.ts";

const origin = "https://test.example";
const migrations = new URL("../migrations/", import.meta.url);

function fixture(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec("PRAGMA foreign_keys = ON");
  const scripts = readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort();
  for (const name of scripts.filter((name) => name < "0010")) {
    sqlite.exec(readFileSync(new URL(name, migrations), "utf8"));
  }
  sqlite.exec("INSERT INTO users (id) VALUES ('other')");
  function insertServer(id, owner = "default") {
    sqlite.prepare(`INSERT OR IGNORE INTO credentials (id,user_id,value) VALUES (?,?,?)`)
      .run(id, owner, "test-fixture-credential");
    sqlite.prepare(`INSERT INTO servers (id,user_id,name,host,username,auth_type,credential_ref)
      VALUES (?,?,?,'server.example','tester','password',?)`).run(id, owner, id, id);
  }
  insertServer("A");
  for (const name of scripts.filter((name) => name >= "0010")) {
    sqlite.exec(readFileSync(new URL(name, migrations), "utf8"));
  }
  insertServer("B");
  insertServer("C", "other");

  // Run the production queries and migrations against SQLite, with D1 batch transaction semantics.
  const db = {
    withSession(constraint) {
      assert.equal(constraint, "first-primary");
      return this;
    },
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = (args) => ({
        bind: (...values) => bound(values),
        first: () => statement.get(...args) ?? null,
        run: () => ({ meta: { changes: statement.run(...args).changes } }),
        all: () => ({ results: statement.all(...args) }),
      });
      return bound([]);
    },
    batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((statement) => statement.all());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", { id: "default" });
    await next();
  });
  app.route("/api/v1/mcp-access", mcpAccessRoutes);
  function request(path, method = "GET", data, headers = {}) {
    return app.request(origin + "/api/v1/mcp-access" + path, {
      method,
      headers: { Origin: origin, "Content-Type": "application/json", ...headers },
      body: data === undefined ? undefined : JSON.stringify(data),
    }, { DB: db });
  }
  const state = async () => (await request("/state")).json();
  const confirm = (revision, servers) => request("/authorization", "PUT", { revision, servers });
  const pair = async () => {
    const response = await request("/tokens", "POST", {});
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    return response.json();
  };
  return { sqlite, db, insertServer, request, state, confirm, pair };
}

test("confirm replaces the complete valid selection, rejects stale or foreign records, and preserves pairings on end", async (t) => {
  const { db, sqlite, state, confirm, pair, request } = fixture(t);
  const first = await state();
  const [a, b] = first.availableServers;
  assert.deepEqual(first.authorizedServerIds, []);
  assert.deepEqual(first.tokens, []);
  assert.deepEqual(first.availableServers.map(({ id }) => id), ["A", "B"]);
  const { token } = await pair();
  assert.deepEqual(await listMcpAuthorizedServers(db, token), []);
  assert.equal((await confirm(0, [a, b])).status, 200);
  assert.equal((await confirm(0, [a])).status, 409);
  const foreign = sqlite.prepare("SELECT server_id AS id, version AS identityVersion FROM mcp_target_identities WHERE server_id='C'").get();
  assert.equal((await confirm(1, [b, foreign])).status, 409);
  assert.deepEqual((await state()).authorizedServerIds, ["A", "B"]);
  assert.equal((await confirm(1, [b])).status, 200);
  assert.deepEqual(await listMcpAuthorizedServers(db, token), [{ id: "B", name: "B" }]);
  assert.equal((await request("/authorization", "DELETE")).status, 200);
  assert.deepEqual(await listMcpAuthorizedServers(db, token), []);
  assert.equal((await confirm(2, [a])).status, 409);
  assert.equal(await authenticateMcpToken(db, token), true);
});

test("rename preserves access, endpoint changes and deletion invalidate even old or restored identifiers", async (t) => {
  const { db, sqlite, state, confirm, pair, insertServer } = fixture(t);
  const { token } = await pair();
  let revision = 0;
  const selectA = async () => {
    const [a] = (await state()).availableServers;
    assert.equal((await confirm(revision++, [a])).status, 200);
    return a;
  };
  let old = await selectA();
  sqlite.exec("UPDATE servers SET name = 'A renamed', host=host WHERE id='A'");
  assert.deepEqual(await listMcpAuthorizedServers(db, token), [{ id: "A", name: "A renamed" }]);
  for (const edit of [
    "UPDATE servers SET host='changed.example' WHERE id='A'; UPDATE servers SET host='server.example' WHERE id='A'",
    "UPDATE servers SET port=2200 WHERE id='A'",
    "UPDATE servers SET username='another-user' WHERE id='A'",
  ]) {
    sqlite.exec(edit);
    assert.deepEqual(await listMcpAuthorizedServers(db, token), []);
    assert.equal((await confirm(revision, [old])).status, 409);
    old = await selectA();
  }
  sqlite.exec("DELETE FROM servers WHERE id='A'");
  insertServer("A");
  assert.deepEqual(await listMcpAuthorizedServers(db, token), []);
  assert.equal((await confirm(revision, [old])).status, 409);
});

test("dedicated tokens are stored as digests, independently revocable, and audits are bounded metadata", async (t) => {
  const { db, sqlite, state, pair, request } = fixture(t);
  const first = await pair();
  const second = await pair();
  const stored = sqlite.prepare("SELECT id, digest FROM mcp_tokens WHERE id=?").get(first.id);
  assert.match(stored.digest, /^[a-f\d]{64}$/);
  assert.notEqual(stored.digest, first.token);
  assert.notEqual(first.token, second.token);
  assert.equal(await authenticateMcpToken(db, first.id), false);
  assert.equal(await authenticateMcpToken(db, stored.digest), false);
  assert.equal(await listMcpAuthorizedServers(db, ""), null);
  assert.equal((await request("/tokens/" + first.id, "DELETE")).status, 200);
  assert.equal(await authenticateMcpToken(db, first.token), false);
  assert.equal(await listMcpAuthorizedServers(db, first.token), null);
  for (let i = 0; i < 23; i++) assert.deepEqual(await listMcpAuthorizedServers(db, second.token), []);
  const current = await state();
  assert.equal(current.recentCalls.length, 20);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM mcp_recent_calls").get().n, 20);
  assert.deepEqual(current.tokens, [{ id: second.id, createdAt: second.createdAt }]);
  assert.deepEqual(Object.keys(current.recentCalls[0]).sort(), ["at", "result", "target"]);
  for (const secret of [first.token, second.token, stored.digest, "test-fixture-credential", "server.example"]) {
    assert.ok(!JSON.stringify(current).includes(secret));
  }
});

test("management rejects cross-origin requests, forged selections, and non-JSON changes", async (t) => {
  const { request, confirm, state } = fixture(t);
  const [a] = (await state()).availableServers;
  assert.equal((await request("/tokens", "POST", {}, { Origin: "https://foreign.example" })).status, 403);
  assert.equal((await request("/authorization", "DELETE", undefined, { Origin: "" })).status, 403);
  assert.equal((await request("/state", "GET", undefined, { Origin: "https://foreign.example" })).status, 403);
  assert.equal((await request("/tokens", "POST", {}, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await confirm(0, [a, a])).status, 400);
  assert.equal((await confirm(0, [{ id: a.id, identityVersion: "0".repeat(32) }])).status, 409);
  assert.equal((await confirm(-1, [a])).status, 400);
  assert.deepEqual((await state()).tokens, []);
  assert.equal((await state()).revision, 0);
});

test("concurrent confirmations have one winner; an ended or reset workspace cannot reuse a stale choice", async (t) => {
  const { db, request, state, confirm, pair } = fixture(t);
  const { token } = await pair();
  const { availableServers: [a, b] } = await state();
  const confirmations = await Promise.all([confirm(0, [a]), confirm(0, [b])]);
  assert.deepEqual(confirmations.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await state()).authorizedServerIds.length, 1);
  await request("/authorization", "DELETE");
  assert.equal((await confirm(1, [a])).status, 409);
  assert.deepEqual(await listMcpAuthorizedServers(db, token), []);
  await resetUserData(db, "default");
  assert.equal(await authenticateMcpToken(db, token), false);
  assert.equal(await listMcpAuthorizedServers(db, token), null);
  assert.deepEqual(await state(), {
    revision: 0, availableServers: [], authorizedServerIds: [], tokens: [], recentCalls: [],
  });
  assert.equal((await confirm(0, [a])).status, 409);
});
