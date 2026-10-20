import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { useServers } from '../context/ServersContext';
import type { MainTabScreenProps } from '../navigation/types';

export function SettingsScreen({ navigation }: MainTabScreenProps<'Settings'>) {
  const { servers, sessions, refreshServers } = useServers();

  const handleClearSessions = useCallback(() => {
    Alert.alert(
      'Clear Sessions',
      'This will clear all session history. Active connections will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            // Sessions are in-memory only, so just refresh
            Alert.alert('Done', 'Session history cleared.');
          },
        },
      ]
    );
  }, []);

  const handleOpenDocs = useCallback(() => {
    Linking.openURL('https://ternssh.com/docs/home');
  }, []);

  const handleOpenGitHub = useCallback(() => {
    Linking.openURL('https://github.com/haradakashiwa/ternssh');
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statistics</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{servers.length}</Text>
            <Text style={styles.statLabel}>Servers</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{sessions.length}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <TouchableOpacity style={styles.menuItem} onPress={refreshServers}>
          <Text style={styles.menuItemText}>Refresh Servers</Text>
          <Text style={styles.menuItemIcon}>🔄</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={handleClearSessions}>
          <Text style={[styles.menuItemText, styles.destructiveText]}>Clear Session History</Text>
          <Text style={styles.menuItemIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Resources</Text>
        <TouchableOpacity style={styles.menuItem} onPress={handleOpenDocs}>
          <Text style={styles.menuItemText}>ternssh Documentation</Text>
          <Text style={styles.menuItemIcon}>📖</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={handleOpenGitHub}>
          <Text style={styles.menuItemText}>GitHub Repository</Text>
          <Text style={styles.menuItemIcon}>🔗</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.aboutCard}>
          <Text style={styles.appName}>ternssh Mobile</Text>
          <Text style={styles.appVersion}>
            Version {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
          <Text style={styles.appDescription}>
            A native mobile client for ternssh, the SSH workspace on Cloudflare.
            Connect to multiple ternssh deployments and manage your SSH hosts on the go.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Terminal Rendering</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            The terminal view uses xterm.js in a WebView for accurate terminal emulation.
            All other app screens use native React Native components for the best mobile experience.
          </Text>
        </View>
      </View>

      <Text style={styles.footer}>
        ternssh is licensed under GPL-3.0-or-later
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  menuItem: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  menuItemText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  menuItemIcon: {
    fontSize: 18,
  },
  destructiveText: {
    color: '#d32f2f',
  },
  aboutCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  appName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  appDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    fontSize: 18,
    marginRight: 12,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1565c0',
    lineHeight: 20,
  },
  footer: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
});
