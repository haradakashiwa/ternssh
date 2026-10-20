import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { TernsshServer, TerminalSession } from '../types';
import * as storage from '../storage/secureStorage';
import { createApiClient, type ApiClient } from '../api/client';

interface ServersContextValue {
  servers: TernsshServer[];
  loading: boolean;
  refreshServers: () => Promise<void>;
  addServer: (
    serverData: Omit<TernsshServer, 'id' | 'createdAt'>,
    password?: string
  ) => Promise<TernsshServer>;
  updateServer: (
    id: string,
    updates: Partial<Omit<TernsshServer, 'id' | 'createdAt'>>,
    password?: string
  ) => Promise<TernsshServer | null>;
  deleteServer: (id: string) => Promise<boolean>;
  getApiClient: (serverId: string) => ApiClient | null;
  
  // Active sessions
  sessions: TerminalSession[];
  addSession: (session: TerminalSession) => void;
  updateSession: (sessionId: string, updates: Partial<TerminalSession>) => void;
  removeSession: (sessionId: string) => void;
  getSessionsForServer: (serverId: string) => TerminalSession[];
}

const ServersContext = createContext<ServersContextValue | null>(null);

export function ServersProvider({ children }: { children: ReactNode }) {
  const [servers, setServers] = useState<TernsshServer[]>([]);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshServers = useCallback(async () => {
    setLoading(true);
    try {
      const loadedServers = await storage.getServers();
      setServers(loadedServers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshServers();
  }, [refreshServers]);

  const addServer = useCallback(async (
    serverData: Omit<TernsshServer, 'id' | 'createdAt'>,
    password?: string
  ) => {
    const newServer = await storage.addServer(serverData, password);
    setServers(prev => [...prev, newServer]);
    return newServer;
  }, []);

  const updateServer = useCallback(async (
    id: string,
    updates: Partial<Omit<TernsshServer, 'id' | 'createdAt'>>,
    password?: string
  ) => {
    const updated = await storage.updateServer(id, updates, password);
    if (updated) {
      setServers(prev => prev.map(s => s.id === id ? updated : s));
    }
    return updated;
  }, []);

  const deleteServer = useCallback(async (id: string) => {
    const success = await storage.deleteServer(id);
    if (success) {
      setServers(prev => prev.filter(s => s.id !== id));
      // Also remove any sessions for this server
      setSessions(prev => prev.filter(s => s.serverId !== id));
    }
    return success;
  }, []);

  const getApiClient = useCallback((serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return null;
    return createApiClient(server);
  }, [servers]);

  const addSession = useCallback((session: TerminalSession) => {
    setSessions(prev => [...prev, session]);
  }, []);

  const updateSession = useCallback((sessionId: string, updates: Partial<TerminalSession>) => {
    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, ...updates } : s
    ));
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  }, []);

  const getSessionsForServer = useCallback((serverId: string) => {
    return sessions.filter(s => s.serverId === serverId);
  }, [sessions]);

  return (
    <ServersContext.Provider
      value={{
        servers,
        loading,
        refreshServers,
        addServer,
        updateServer,
        deleteServer,
        getApiClient,
        sessions,
        addSession,
        updateSession,
        removeSession,
        getSessionsForServer,
      }}
    >
      {children}
    </ServersContext.Provider>
  );
}

export function useServers() {
  const context = useContext(ServersContext);
  if (!context) {
    throw new Error('useServers must be used within a ServersProvider');
  }
  return context;
}
