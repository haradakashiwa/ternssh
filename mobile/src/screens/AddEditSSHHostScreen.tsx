import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useServers } from '../context/ServersContext';
import type { RootStackScreenProps } from '../navigation/types';
import type { TreeNode, SSHHost } from '../types';

type AuthType = 'password' | 'private_key';

interface AddSSHHostScreenProps extends RootStackScreenProps<'AddSSHHost'> {}
interface EditSSHHostScreenProps extends RootStackScreenProps<'EditSSHHost'> {}

export function AddSSHHostScreen({ navigation, route }: AddSSHHostScreenProps) {
  const { serverId } = route.params;
  return <SSHHostForm mode="add" serverId={serverId} navigation={navigation} />;
}

export function EditSSHHostScreen({ navigation, route }: EditSSHHostScreenProps) {
  const { serverId, hostId } = route.params;
  return (
    <SSHHostForm 
      mode="edit" 
      serverId={serverId}
      hostId={hostId}
      navigation={navigation} 
    />
  );
}

interface SSHHostFormProps {
  mode: 'add' | 'edit';
  serverId: string;
  hostId?: string;
  navigation: AddSSHHostScreenProps['navigation'] | EditSSHHostScreenProps['navigation'];
}

function findHost(nodes: TreeNode[], hostId: string): SSHHost | null {
  for (const node of nodes) {
    if (node.type === 'server' && node.id === hostId) {
      return node;
    }
    if (node.type === 'group') {
      const found = findHost(node.children, hostId);
      if (found) return found;
    }
  }
  return null;
}

function SSHHostForm({ mode, serverId, hostId, navigation }: SSHHostFormProps) {
  const { getApiClient } = useServers();
  const apiClient = getApiClient(serverId);
  
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [authType, setAuthType] = useState<AuthType>('password');
  const [credential, setCredential] = useState('');
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);

  // Load existing host data in edit mode
  useEffect(() => {
    if (mode === 'edit' && hostId && apiClient) {
      apiClient.getServerTree().then(response => {
        const foundHost = findHost(response.tree, hostId);
        if (foundHost) {
          setName(foundHost.name);
          setHost(foundHost.host);
          setPort(String(foundHost.port));
          setUsername(foundHost.username);
          setAuthType(foundHost.auth_type);
        }
        setLoading(false);
      }).catch(() => {
        setLoading(false);
        Alert.alert('Error', 'Failed to load host details');
      });
    }
  }, [mode, hostId, apiClient]);

  const handleSave = useCallback(async () => {
    if (!apiClient) {
      Alert.alert('Error', 'API client not available');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }
    if (!host.trim()) {
      Alert.alert('Error', 'Please enter a host');
      return;
    }
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      Alert.alert('Error', 'Please enter a valid port (1-65535)');
      return;
    }
    if (mode === 'add' && !credential.trim()) {
      Alert.alert('Error', `Please enter a ${authType === 'password' ? 'password' : 'private key'}`);
      return;
    }

    setSaving(true);
    try {
      if (mode === 'add') {
        await apiClient.createSSHHost({
          name: name.trim(),
          host: host.trim(),
          port: portNum,
          username: username.trim(),
          auth_type: authType,
          credential: credential.trim(),
        });
      } else if (hostId) {
        await apiClient.updateSSHHost(hostId, {
          name: name.trim(),
          host: host.trim(),
          port: portNum,
          username: username.trim(),
          auth_type: authType,
          ...(credential.trim() ? { credential: credential.trim() } : {}),
        });
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save host');
    } finally {
      setSaving(false);
    }
  }, [mode, hostId, apiClient, name, host, port, username, authType, credential, navigation]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Production Server"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Host</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.100 or server.example.com"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.section, styles.portSection]}>
            <Text style={styles.label}>Port</Text>
            <TextInput
              style={styles.input}
              value={port}
              onChangeText={setPort}
              placeholder="22"
              placeholderTextColor="#999"
              keyboardType="number-pad"
            />
          </View>

          <View style={[styles.section, styles.usernameSection]}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="root"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Authentication</Text>
          <View style={styles.authOptions}>
            {(['password', 'private_key'] as AuthType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.authOption,
                  authType === type && styles.authOptionSelected,
                ]}
                onPress={() => setAuthType(type)}
              >
                <Text
                  style={[
                    styles.authOptionText,
                    authType === type && styles.authOptionTextSelected,
                  ]}
                >
                  {type === 'password' ? '🔑 Password' : '🗝️ Private Key'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>
            {authType === 'password' ? 'Password' : 'Private Key'}
          </Text>
          <TextInput
            style={[styles.input, authType === 'private_key' && styles.multilineInput]}
            value={credential}
            onChangeText={setCredential}
            placeholder={authType === 'password' ? '••••••••' : 'Paste your private key here...'}
            placeholderTextColor="#999"
            secureTextEntry={authType === 'password'}
            multiline={authType === 'private_key'}
            numberOfLines={authType === 'private_key' ? 6 : 1}
            textAlignVertical={authType === 'private_key' ? 'top' : 'center'}
          />
          {mode === 'edit' && (
            <Text style={styles.hint}>
              Leave empty to keep the existing {authType === 'password' ? 'password' : 'key'}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.button, styles.saveButton]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>
              {mode === 'add' ? 'Add SSH Host' : 'Save Changes'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  portSection: {
    flex: 1,
  },
  usernameSection: {
    flex: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  multilineInput: {
    minHeight: 120,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  hint: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
    lineHeight: 18,
  },
  authOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  authOption: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  authOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  authOptionText: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  authOptionTextSelected: {
    color: '#fff',
  },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
