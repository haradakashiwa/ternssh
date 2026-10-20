import { getCredential } from '../storage/secureStorage';
import type {
  TernsshServer,
  MeResponse,
  TreeNode,
  SSHHost,
  CreateSSHHostInput,
  UpdateSSHHostInput,
  CreateSessionResponse,
} from '../types';

export class TernsshApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public authMode?: string
  ) {
    super(message);
    this.name = 'TernsshApiError';
  }
}

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  return normalized.replace(/\/+$/, '');
}

async function getAuthHeader(server: TernsshServer): Promise<Record<string, string>> {
  if (server.authType === 'basic' && server.username) {
    const password = await getCredential(server.id);
    if (password) {
      const encoded = btoa(`${server.username}:${password}`);
      return { Authorization: `Basic ${encoded}` };
    }
  }
  return {};
}

async function request<T>(
  server: TernsshServer,
  path: string,
  init?: RequestInit
): Promise<T> {
  const baseUrl = normalizeUrl(server.url);
  const authHeaders = await getAuthHeader(server);
  
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { 
      error?: string;
      authMode?: string;
    } | null;
    throw new TernsshApiError(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
      body?.authMode
    );
  }

  return response.json() as Promise<T>;
}

// Create an API client bound to a specific ternssh server
export function createApiClient(server: TernsshServer) {
  return {
    // Health check
    healthCheck: async (): Promise<boolean> => {
      try {
        const baseUrl = normalizeUrl(server.url);
        const response = await fetch(`${baseUrl}/api/health`);
        const data = await response.json() as { ok?: boolean };
        return data.ok === true;
      } catch {
        return false;
      }
    },

    // Get current user info
    getMe: () => request<MeResponse>(server, '/api/v1/me'),

    // SSH Hosts
    getServerTree: () =>
      request<{ tree: TreeNode[] }>(server, '/api/v1/servers/tree'),

    createSSHHost: (input: CreateSSHHostInput) =>
      request<{ server: SSHHost }>(server, '/api/v1/servers', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    updateSSHHost: (id: string, input: UpdateSSHHostInput) =>
      request<{ server: SSHHost }>(server, `/api/v1/servers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),

    deleteSSHHost: (id: string) =>
      request<{ ok: boolean }>(server, `/api/v1/servers/${id}`, {
        method: 'DELETE',
      }),

    // Server groups
    createGroup: (input: { name: string; parent_id?: string | null }) =>
      request<{ group: { id: string; name: string } }>(server, '/api/v1/servers/groups', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    deleteGroup: (id: string) =>
      request<{ ok: boolean }>(server, `/api/v1/servers/groups/${id}`, {
        method: 'DELETE',
      }),

    // Sessions
    createSession: (sshHostId: string) =>
      request<CreateSessionResponse>(server, '/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({ serverId: sshHostId }),
      }),

    // Get WebSocket URL for a session
    getTerminalWsUrl: (sessionId: string): string => {
      const baseUrl = normalizeUrl(server.url);
      const protocol = baseUrl.startsWith('https://') ? 'wss:' : 'ws:';
      const host = baseUrl.replace(/^https?:\/\//, '');
      return `${protocol}//${host}/api/v1/sessions/${sessionId}/ws`;
    },

    getSftpWsUrl: (sessionId: string): string => {
      const baseUrl = normalizeUrl(server.url);
      const protocol = baseUrl.startsWith('https://') ? 'wss:' : 'ws:';
      const host = baseUrl.replace(/^https?:\/\//, '');
      return `${protocol}//${host}/api/v1/sessions/${sessionId}/sftp/ws`;
    },

    // Get auth headers for WebSocket connections
    getAuthHeaders: async (): Promise<Record<string, string>> => {
      return getAuthHeader(server);
    },

    // Get base URL
    getBaseUrl: (): string => normalizeUrl(server.url),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

// Test connection to a server
export async function testConnection(
  url: string,
  authType: 'basic' | 'access' | 'none',
  username?: string,
  password?: string
): Promise<{ success: boolean; error?: string; authMode?: string }> {
  const baseUrl = normalizeUrl(url);
  
  try {
    // First check health endpoint
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    if (!healthResponse.ok) {
      return { success: false, error: 'Server not reachable' };
    }

    // Then try to get user info with auth
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (authType === 'basic' && username && password) {
      headers.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
    }

    const meResponse = await fetch(`${baseUrl}/api/v1/me`, { headers });
    
    if (!meResponse.ok) {
      const body = await meResponse.json().catch(() => null) as {
        error?: string;
        authMode?: string;
      } | null;
      
      return { 
        success: false, 
        error: body?.error ?? `Authentication failed (${meResponse.status})`,
        authMode: body?.authMode,
      };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}
