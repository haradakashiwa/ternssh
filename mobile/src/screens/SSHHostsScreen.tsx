import React, { useCallback, useEffect, useState } from 'react';
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
import type { RootStackScreenProps } from '../navigation/types';
import type { TreeNode, SSHHost } from '../types';

interface FlattenedNode {
  type: 'group' | 'server';
  id: string;
  name: string;
  depth: number;
  host?: SSHHost;
  isExpanded?: boolean;
  hasChildren?: boolean;
}

function flattenTree(
  nodes: TreeNode[],
  depth = 0,
  expandedGroups: Set<string>
): FlattenedNode[] {
  const result: FlattenedNode[] = [];
  
  for (const node of nodes) {
    if (node.type === 'group') {
      const isExpanded = expandedGroups.has(node.id);
      result.push({
        type: 'group',
        id: node.id,
        name: node.name,
        depth,
        isExpanded,
        hasChildren: node.children.length > 0,
      });
      if (isExpanded) {
        result.push(...flattenTree(node.children, depth + 1, expandedGroups));
      }
    } else {
      result.push({
        type: 'server',
        id: node.id,
        name: node.name,
        depth,
        host: node,
      });
    }
  }
  
  return result;
}

export function SSHHostsScreen({ navigation, route }: RootStackScreenProps<'SSHHosts'>) {
  const { serverId } = route.params;
  const { servers, getApiClient } = useServers();
  
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const server = servers.find(s => s.id === serverId);
  const apiClient = getApiClient(serverId);

  const loadHosts = useCallback(async () => {
    if (!apiClient) return;
    
    try {
      const response = await apiClient.getServerTree();
      setTree(response.tree);
      setError(null);
      // Auto-expand all groups initially
      const allGroupIds = new Set<string>();
      const collectGroups = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.type === 'group') {
            allGroupIds.add(node.id);
            collectGroups(node.children);
          }
        }
      };
      collectGroups(response.tree);
      setExpandedGroups(allGroupIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hosts');
    }
  }, [apiClient]);

  useEffect(() => {
    navigation.setOptions({
      title: server?.name ?? 'SSH Hosts',
    });
  }, [navigation, server]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await loadHosts();
      setLoading(false);
    };
    load();
  }, [loadHosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHosts();
    setRefreshing(false);
  }, [loadHosts]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const handleHostPress = useCallback((host: SSHHost) => {
    navigation.navigate('Terminal', {
      serverId,
      sshHostId: host.id,
      sshHostName: host.name,
    });
  }, [navigation, serverId]);

  const handleHostLongPress = useCallback((host: SSHHost) => {
    Alert.alert(
      host.name,
      `${host.username}@${host.host}:${host.port}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Connect',
          onPress: () => handleHostPress(host),
        },
        {
          text: 'Edit',
          onPress: () => navigation.navigate('EditSSHHost', { serverId, hostId: host.id }),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Host',
              `Are you sure you want to delete "${host.name}"?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await apiClient?.deleteSSHHost(host.id);
                      await loadHosts();
                    } catch (err) {
                      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete host');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [apiClient, handleHostPress, loadHosts, navigation, serverId]);

  const flattenedTree = flattenTree(tree, 0, expandedGroups);

  const renderItem = ({ item }: { item: FlattenedNode }) => {
    const paddingLeft = 16 + item.depth * 20;

    if (item.type === 'group') {
      return (
        <TouchableOpacity
          style={[styles.groupRow, { paddingLeft }]}
          onPress={() => toggleGroup(item.id)}
        >
          <Text style={styles.groupIcon}>
            {item.isExpanded ? '📂' : '📁'}
          </Text>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.expandIcon}>
            {item.hasChildren ? (item.isExpanded ? '▼' : '▶') : ''}
          </Text>
        </TouchableOpacity>
      );
    }

    const host = item.host!;
    return (
      <TouchableOpacity
        style={[styles.hostRow, { paddingLeft }]}
        onPress={() => handleHostPress(host)}
        onLongPress={() => handleHostLongPress(host)}
      >
        <Text style={styles.hostIcon}>🖥️</Text>
        <View style={styles.hostInfo}>
          <Text style={styles.hostName}>{host.name}</Text>
          <Text style={styles.hostDetails}>
            {host.username}@{host.host}:{host.port}
          </Text>
        </View>
        <View style={[styles.authBadge, host.auth_type === 'password' ? styles.authPassword : styles.authKey]}>
          <Text style={styles.authBadgeText}>
            {host.auth_type === 'password' ? '🔑' : '🗝️'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!server) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Server not found</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading hosts...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadHosts}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={flattenedTree}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={renderItem}
        contentContainerStyle={flattenedTree.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📡</Text>
            <Text style={styles.emptyTitle}>No SSH Hosts</Text>
            <Text style={styles.emptyText}>
              Add an SSH host to connect to remote servers through this ternssh deployment.
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => navigation.navigate('AddSSHHost', { serverId })}
            >
              <Text style={styles.addButtonText}>Add SSH Host</Text>
            </TouchableOpacity>
          </View>
        }
      />
      {flattenedTree.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('AddSSHHost', { serverId })}
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
    padding: 32,
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 16,
    backgroundColor: '#f0f0f0',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  groupIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  groupName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#444',
  },
  expandIcon: {
    fontSize: 12,
    color: '#888',
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  hostIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  hostInfo: {
    flex: 1,
  },
  hostName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  hostDetails: {
    fontSize: 13,
    color: '#666',
  },
  authBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  authPassword: {
    backgroundColor: '#e3f2fd',
  },
  authKey: {
    backgroundColor: '#e8f5e9',
  },
  authBadgeText: {
    fontSize: 14,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
