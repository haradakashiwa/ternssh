import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useServers } from '../context/ServersContext';
import type { MainTabScreenProps } from '../navigation/types';
import type { TerminalSession } from '../types';

function getStatusColor(status: TerminalSession['status']): string {
  switch (status) {
    case 'open': return '#4caf50';
    case 'connecting': return '#ff9800';
    case 'error': return '#f44336';
    case 'closed': return '#9e9e9e';
    default: return '#9e9e9e';
  }
}

function getStatusText(status: TerminalSession['status']): string {
  switch (status) {
    case 'open': return 'Connected';
    case 'connecting': return 'Connecting...';
    case 'error': return 'Error';
    case 'closed': return 'Closed';
    default: return 'Unknown';
  }
}

export function SessionsScreen({ navigation }: MainTabScreenProps<'Sessions'>) {
  const { sessions, servers, removeSession } = useServers();

  const handleSessionPress = useCallback((session: TerminalSession) => {
    const server = servers.find(s => s.id === session.serverId);
    if (!server) {
      Alert.alert('Error', 'Server not found');
      return;
    }
    
    // TODO: Resume existing session - for now just show info
    Alert.alert(
      'Session Info',
      `Server: ${server.name}\nStatus: ${getStatusText(session.status)}\nSession ID: ${session.sessionId}`,
      [
        { text: 'OK' },
        session.status === 'closed' || session.status === 'error'
          ? { text: 'Remove', style: 'destructive', onPress: () => removeSession(session.id) }
          : null,
      ].filter(Boolean) as { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]
    );
  }, [servers, removeSession]);

  const renderSession = ({ item }: { item: TerminalSession }) => {
    const server = servers.find(s => s.id === item.serverId);
    
    return (
      <TouchableOpacity
        style={styles.sessionCard}
        onPress={() => handleSessionPress(item)}
      >
        <View style={styles.statusIndicator}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
        </View>
        <View style={styles.sessionInfo}>
          <Text style={styles.serverName}>{server?.name ?? 'Unknown Server'}</Text>
          <Text style={styles.sessionStatus}>{getStatusText(item.status)}</Text>
          <Text style={styles.sessionTime}>
            Started: {new Date(item.createdAt).toLocaleTimeString()}
          </Text>
        </View>
        <View style={styles.chevron}>
          <Text style={styles.chevronText}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSession}
        contentContainerStyle={sessions.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📟</Text>
            <Text style={styles.emptyTitle}>No Active Sessions</Text>
            <Text style={styles.emptyText}>
              Connect to an SSH host to start a terminal session. Sessions will appear here.
            </Text>
            <TouchableOpacity
              style={styles.goButton}
              onPress={() => navigation.navigate('Servers')}
            >
              <Text style={styles.goButtonText}>Go to Servers</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
  },
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  statusIndicator: {
    marginRight: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sessionInfo: {
    flex: 1,
  },
  serverName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  sessionStatus: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  sessionTime: {
    fontSize: 12,
    color: '#999',
  },
  chevron: {
    marginLeft: 12,
  },
  chevronText: {
    fontSize: 24,
    color: '#ccc',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  goButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  goButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
