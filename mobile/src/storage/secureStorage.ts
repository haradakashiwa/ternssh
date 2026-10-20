import * as SecureStore from 'expo-secure-store';
import type { TernsshServer } from '../types';

const SERVERS_KEY = 'ternssh_servers';
const CREDENTIALS_PREFIX = 'ternssh_cred_';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Store credential securely and return a reference key
export async function storeCredential(serverId: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(`${CREDENTIALS_PREFIX}${serverId}`, password);
}

// Retrieve credential by server ID
export async function getCredential(serverId: string): Promise<string | null> {
  return SecureStore.getItemAsync(`${CREDENTIALS_PREFIX}${serverId}`);
}

// Delete credential by server ID
export async function deleteCredential(serverId: string): Promise<void> {
  await SecureStore.deleteItemAsync(`${CREDENTIALS_PREFIX}${serverId}`);
}

// Get all stored servers (metadata only, not credentials)
export async function getServers(): Promise<TernsshServer[]> {
  const data = await SecureStore.getItemAsync(SERVERS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data) as TernsshServer[];
  } catch {
    return [];
  }
}

// Save all servers (metadata only)
export async function saveServers(servers: TernsshServer[]): Promise<void> {
  await SecureStore.setItemAsync(SERVERS_KEY, JSON.stringify(servers));
}

// Add a new server
export async function addServer(
  serverData: Omit<TernsshServer, 'id' | 'createdAt'>,
  password?: string
): Promise<TernsshServer> {
  const servers = await getServers();
  const newServer: TernsshServer = {
    ...serverData,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  servers.push(newServer);
  await saveServers(servers);
  
  if (password && serverData.authType === 'basic') {
    await storeCredential(newServer.id, password);
  }
  
  return newServer;
}

// Update a server
export async function updateServer(
  id: string,
  updates: Partial<Omit<TernsshServer, 'id' | 'createdAt'>>,
  password?: string
): Promise<TernsshServer | null> {
  const servers = await getServers();
  const index = servers.findIndex(s => s.id === id);
  if (index === -1) return null;
  
  servers[index] = { ...servers[index], ...updates };
  await saveServers(servers);
  
  if (password !== undefined) {
    if (password) {
      await storeCredential(id, password);
    } else {
      await deleteCredential(id);
    }
  }
  
  return servers[index];
}

// Delete a server
export async function deleteServer(id: string): Promise<boolean> {
  const servers = await getServers();
  const filtered = servers.filter(s => s.id !== id);
  if (filtered.length === servers.length) return false;
  
  await saveServers(filtered);
  await deleteCredential(id);
  return true;
}

// Get a single server by ID
export async function getServer(id: string): Promise<TernsshServer | null> {
  const servers = await getServers();
  return servers.find(s => s.id === id) ?? null;
}
