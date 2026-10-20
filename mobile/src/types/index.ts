// ternssh server deployment (a ternssh instance the user can connect to)
export interface TernsshServer {
  id: string;
  name: string;
  url: string;
  authType: 'basic' | 'access' | 'none';
  username?: string;
  createdAt: string;
}

// User info from a ternssh server
export interface User {
  id: string;
  email: string | null;
  display_name: string | null;
  site_name: string | null;
  created_at: string;
  updated_at: string;
}

// SSH host/server stored in a ternssh deployment
export interface SSHHost {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'private_key';
  group_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SSHHostGroup {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type TreeNode =
  | {
      type: 'group';
      id: string;
      name: string;
      parent_id: string | null;
      sort_order: number;
      children: TreeNode[];
    }
  | ({
      type: 'server';
    } & SSHHost);

export interface MeResponse {
  user: User;
  authMode: 'access' | 'basic' | 'onboarding';
}

export interface CreateSSHHostInput {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'private_key';
  credential: string;
  group_id?: string | null;
}

export interface UpdateSSHHostInput {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  auth_type?: 'password' | 'private_key';
  credential?: string;
  passphrase?: string;
  group_id?: string | null;
}

export interface CreateSessionResponse {
  sessionId: string;
  wsUrl: string;
  sftpWsUrl: string;
  status: string;
}

// Active terminal session
export interface TerminalSession {
  id: string;
  serverId: string;          // ternssh deployment id
  sshHostId: string;         // SSH host on that deployment
  sessionId: string;         // Session ID from the API
  wsUrl: string;
  sftpWsUrl: string;
  status: 'connecting' | 'open' | 'closed' | 'error';
  createdAt: string;
}
