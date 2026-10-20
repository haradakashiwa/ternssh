import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useServers } from '../context/ServersContext';
import type { MainTabScreenProps } from '../navigation/types';
import type { TernsshServer } from '../types';

export function ServersScreen({ navigation }: MainTabScreenProps<'Servers'>) {
  const { servers, loading, refreshServers, deleteServer } = useServers();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshServers();
    setRefreshing(false);
  }, [refreshServers]);

  const handleDeleteServer = useCallback((server: TernsshServer) => {
    Alert.alert(
      'Delete Server',
      `Are you sure you want to remove "${server.name}"? This will not affect the remote ternssh deployment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteServer(server.id);
          },
        },
      ]
    );
  }, [deleteServer]);

  const renderServer = ({ item }: { item: TernsshServer }) => (
    <TouchableOpacity
      style={styles.serverCard}
      onPress={() => navigation.navigate('SSHHosts', { serverId: item.id })}
      onLongPress={() => {
        Alert.alert(
          item.name,
          'What would you like to do?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Edit',
              onPress: () => navigation.navigate('EditServer', { serverId: item.id }),
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => handleDeleteServer(item),
            },
          ]
        );
      }}
    >
      <View style={styles.serverInfo}>
        <Text style={styles.serverName}>{item.name}</Text>
        <Text style={styles.serverUrl}>{item.url}</Text>
        <View style={styles.serverMeta}>
          <View style={[styles.authBadge, styles[`auth_${item.authType}`]]}>
            <Text style={styles.authBadgeText}>
              {item.authType === 'basic' ? 'Basic Auth' : item.authType === 'access' ? 'Cloudflare Access' : 'No Auth'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.chevron}>
        <Text style={styles.chevronText}>›</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading && servers.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={servers}
        keyExtractor={(item) => item.id}
        renderItem={renderServer}
        contentContainerStyle={servers.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🖥️</Text>
            <Text style={styles.emptyTitle}>No Servers</Text>
            <Text style={styles.emptyText}>
              Add a ternssh server to get started. You can connect to multiple ternssh deployments.
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => navigation.navigate('AddServer')}
            >
              <Text style={styles.addButtonText}>Add Server</Text>
            </TouchableOpacity>
          </View>
        }
      />
      {servers.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('AddServer')}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
  },
  serverCard: {
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
  serverInfo: {
    flex: 1,
  },
  serverName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  serverUrl: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  serverMeta: {
    flexDirection: 'row',
  },
  authBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  auth_basic: {
    backgroundColor: '#e3f2fd',
  },
  auth_access: {
    backgroundColor: '#fff3e0',
  },
  auth_none: {
    backgroundColor: '#f5f5f5',
  },
  authBadgeText: {
    fontSize: 12,
    color: '#555',
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
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '400',
  },
});
