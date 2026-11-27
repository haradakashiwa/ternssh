import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiResponseError } from "../src/lib/api.ts";
import { ADDABLE_WIDGETS } from "../src/dashboard/widgets.ts";
import {
  buildDashboardLayoutExport,
  layoutImportToDashboardWidgets,
  parseDashboardLayoutImport,
  serializeDashboardLayoutExport,
} from "../src/lib/dashboard-layout-io.ts";

const oldTypes = [
  "server_list", "terminal", "file_manager", "status", "network",
  "process", "container", "quick_commands", "ai_command",
];

function widget(type, config_json = null, index = 0) {
  return { type, config_json, grid_x: index, grid_y: index * 3, grid_w: 3, grid_h: 6 };
}

test("the optional MCP card preserves all nine old widgets and their layout round trip", () => {
  assert.deepEqual(ADDABLE_WIDGETS.map((item) => item.type), [...oldTypes, "mcp_access"]);
  const widgets = oldTypes.map((type, index) => widget(type, null, index));
  widgets[1].config_json = '{"fontSize":14}';
  widgets[7].config_json = '{"customCommands":[{"label":"Path","command":"pwd"}]}';
  const file = buildDashboardLayoutExport({ dashboard: { name: "Sample" }, widgets });
  const imported = parseDashboardLayoutImport(serializeDashboardLayoutExport(file));
  const saved = layoutImportToDashboardWidgets(imported).map(({ id, ...item }) => {
    assert.ok(id);
    return item;
  });
  assert.deepEqual(saved, widgets);
});

test("MCP layout round trips only its type and geometry, including forged imported widgets", () => {
  const fake = '{"authorizedServerIds":["forged"],"token":"example-secret"}';
  const record = widget("mcp_access", fake);
  const file = buildDashboardLayoutExport({ dashboard: { name: "Sample" }, widgets: [record] });
  assert.deepEqual(file.widgets, [widget("mcp_access")]);
  const forged = { ...file, widgets: [{ ...record, tokens: ["wrong"] }] };
  const imported = parseDashboardLayoutImport(JSON.stringify(forged));
  const [{ id, ...saved }] = layoutImportToDashboardWidgets(imported);
  assert.ok(id);
  assert.deepEqual(saved, widget("mcp_access"));
  assert.equal(record.config_json, fake);
});

test("management requests use the website routes, send whole selections, and never retry a write", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (path, options) => {
    requests.push({ path, method: options.method ?? "GET", body: options.body });
    if (options.method === "PUT") return Response.json({ error: "Changed" }, { status: 409 });
    return Response.json({ ok: true });
  });
  await api.getMcpAccess(new AbortController().signal);
  const choice = { id: "test-A", identityVersion: "version-A" };
  await assert.rejects(api.replaceMcpAuthorization(11, [choice]),
    (error) => error instanceof ApiResponseError && error.status === 409);
  await api.endMcpAuthorization();
  await api.issueMcpToken();
  await api.revokeMcpToken("token/id");
  assert.deepEqual(requests, [
    { path: "/api/v1/mcp-access/state", method: "GET", body: undefined },
    { path: "/api/v1/mcp-access/authorization", method: "PUT", body: JSON.stringify({ revision: 11, servers: [choice] }) },
    { path: "/api/v1/mcp-access/authorization", method: "DELETE", body: undefined },
    { path: "/api/v1/mcp-access/tokens", method: "POST", body: "{}" },
    { path: "/api/v1/mcp-access/tokens/token%2Fid", method: "DELETE", body: undefined },
  ]);
});
