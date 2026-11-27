import type { SessionStatusResponse } from "./server-status";
import type { AiSettings } from "./ai-settings";

export interface User {
  id: string;
  email: string | null;
  display_name: string | null;
  site_name: string | null;
  created_at: string;
  updated_at: string;
}

export type ServerConnectionType = "direct" | "cloudflare_tunnel";

/** A Cloudflare Access service token; null removes a stored one, leaving it out keeps it. */
export interface TunnelTokenInput {
  client_id: string;
  client_secret: string;
}

export interface ServerConnectionInput {
  connection_type?: ServerConnectionType;
  tunnel_token?: TunnelTokenInput | null;
}

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "private_key";
  connection_type: ServerConnectionType;
  has_tunnel_token: boolean;
  group_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ServerGroup {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type TreeNode =
  | {
      type: "group";
      id: string;
      name: string;
      parent_id: string | null;
      sort_order: number;
      children: TreeNode[];
    }
  | ({
      type: "server";
    } & Server);

export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  type: string;
  config_json: string | null;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
}

export interface Dashboard {
  dashboard: {
    id: string;
    user_id: string;
    name: string;
    is_default: number;
    layout_json: string | null;
    created_at: string;
    updated_at: string;
  };
  widgets: DashboardWidget[];
}

export interface MeResponse {
  user: User;
  authMode: "access" | "basic" | "onboarding";
}

export interface CreateServerInput extends ServerConnectionInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "private_key";
  credential: string;
  group_id?: string | null;
}

export interface CopyServerInput extends ServerConnectionInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: "password" | "private_key";
  credential?: string;
  group_id?: string | null;
}

export interface UpdateServerInput extends ServerConnectionInput {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  auth_type?: "password" | "private_key";
  credential?: string;
  passphrase?: string;
  group_id?: string | null;
}

export interface SavedPasswordRecord {
  id: string;
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface SavedPrivateKeyRecord {
  id: string;
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateAuthCredentialsInput {
  currentPassword: string;
  username?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export interface McpServerChoice {
  id: string;
  name: string;
  identityVersion: string;
}

export interface McpTokenInfo {
  id: string;
  createdAt: string;
}

export interface McpAccessState {
  revision: number;
  availableServers: McpServerChoice[];
  authorizedServerIds: string[];
  tokens: McpTokenInfo[];
  recentCalls: Array<{ at: string; target: string | null; result: "listed" }>;
}

export class ApiResponseError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiResponseError(response.status, body?.error ?? `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getMcpAccess: (signal: AbortSignal) =>
    request<McpAccessState>("/api/v1/mcp-access/state", { signal, cache: "no-store" }),
  replaceMcpAuthorization: (revision: number, servers: Pick<McpServerChoice, "id" | "identityVersion">[]) =>
    request<{ ok: true }>("/api/v1/mcp-access/authorization", {
      method: "PUT",
      body: JSON.stringify({ revision, servers }),
    }),
  endMcpAuthorization: () =>
    request<{ ok: true }>("/api/v1/mcp-access/authorization", { method: "DELETE" }),
  issueMcpToken: () =>
    request<McpTokenInfo & { token: string }>("/api/v1/mcp-access/tokens", {
      method: "POST",
      body: "{}",
    }),
  revokeMcpToken: (id: string) =>
    request<{ ok: true }>(`/api/v1/mcp-access/tokens/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getMe: () => request<MeResponse>("/api/v1/me"),
  getAiSettings: () =>
    request<{ settings: AiSettings }>("/api/v1/me/ai-settings"),
  updateAiSettings: (input: AiSettings) =>
    request<{ settings: AiSettings }>("/api/v1/me/ai-settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  updateSiteName: (siteName: string) =>
    request<{ user: User }>("/api/v1/me/site-name", {
      method: "PUT",
      body: JSON.stringify({ siteName }),
    }),
  getAuthCredentials: () =>
    request<{ username: string }>("/api/v1/auth/credentials"),
  updateAuthCredentials: (input: UpdateAuthCredentialsInput) =>
    request<{ username: string }>("/api/v1/auth/credentials", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  getServerTree: () => request<{ tree: TreeNode[] }>("/api/v1/servers/tree"),
  listServers: () => request<{ tree: TreeNode[] }>("/api/v1/servers"),
  createServer: (input: CreateServerInput) =>
    request<{ server: Server }>("/api/v1/servers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  copyServer: (sourceId: string, input: CopyServerInput) =>
    request<{ server: Server }>(`/api/v1/servers/${sourceId}/copy`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateServer: (id: string, input: UpdateServerInput) =>
    request<{ server: Server }>(`/api/v1/servers/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  createGroup: (input: { name: string; parent_id?: string | null }) =>
    request<{ group: ServerGroup }>("/api/v1/servers/groups", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteGroup: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/servers/groups/${id}`, {
      method: "DELETE",
    }),
  updateGroup: (id: string, input: { name?: string; parent_id?: string | null }) =>
    request<{ group: ServerGroup }>(`/api/v1/servers/groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  moveTreeItem: (input: {
    type: "server" | "group";
    id: string;
    parentId: string | null;
    index: number;
  }) =>
    request<{ tree: TreeNode[] }>("/api/v1/servers/move", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteServer: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/servers/${id}`, { method: "DELETE" }),
  listSavedPasswords: () =>
    request<{ passwords: SavedPasswordRecord[] }>("/api/v1/saved-passwords"),
  savePassword: (input: { name: string; value: string }) =>
    request<{ password: SavedPasswordRecord }>("/api/v1/saved-passwords", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteSavedPassword: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/saved-passwords/${id}`, {
      method: "DELETE",
    }),
  listSavedPrivateKeys: () =>
    request<{ keys: SavedPrivateKeyRecord[] }>("/api/v1/saved-private-keys"),
  savePrivateKey: (input: { name: string; value: string }) =>
    request<{ key: SavedPrivateKeyRecord }>("/api/v1/saved-private-keys", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteSavedPrivateKey: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/saved-private-keys/${id}`, {
      method: "DELETE",
    }),
  getDashboard: () => request<Dashboard>("/api/v1/dashboards"),
  updateDashboard: (body: {
    name?: string;
    layout_json?: string;
    widgets?: Array<{
      id?: string;
      type: string;
      config_json?: string | null;
      grid_x: number;
      grid_y: number;
      grid_w: number;
      grid_h: number;
    }>;
  }) =>
    request<Dashboard>("/api/v1/dashboards", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  resetDashboard: () =>
    request<Dashboard>("/api/v1/me/reset", {
      method: "POST",
    }).then((response) => response.dashboard),
  createSession: (serverId: string) =>
    request<{
      sessionId: string;
      wsUrl: string;
      sftpWsUrl: string;
      status: string;
    }>("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ serverId }),
    }),
  getSessionStatus: (
    sessionId: string,
    options?: { processLimit?: number },
  ) => {
    const params = new URLSearchParams();
    if (options?.processLimit !== undefined) {
      params.set("processLimit", String(options.processLimit));
    }
    const query = params.toString();
    return request<SessionStatusResponse>(
      `/api/v1/sessions/${sessionId}/status${query ? `?${query}` : ""}`,
    );
  },
  generateAiCommand: (
    input: {
      prompt: string;
      history?: string[];
    },
    options?: { signal?: AbortSignal },
  ) =>
    request<{ command: string }>("/api/v1/ai/generate-command", {
      method: "POST",
      body: JSON.stringify(input),
      signal: options?.signal,
    }),
};
