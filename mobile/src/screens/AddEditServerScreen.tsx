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
import { testConnection } from '../api/client';
import { getCredential } from '../storage/secureStorage';
import type { RootStackScreenProps } from '../navigation/types';
import type { TernsshServer } from '../types';

type AuthType = TernsshServer['authType'];

interface AddServerScreenProps extends RootStackScreenProps<'AddServer'> {}
interface EditServerScreenProps extends RootStackScreenProps<'EditServer'> {}

export function AddServerScreen({ navigation }: AddServerScreenProps) {
  return <ServerForm mode="add" navigation={navigation} />;
}

export function EditServerScreen({ navigation, route }: EditServerScreenProps) {
  return (
    <ServerForm 
      mode="edit" 
      serverId={route.params.serverId} 
      navigation={navigation} 
    />
  );
}

interface ServerFormProps {
  mode: 'add' | 'edit';
  serverId?: string;
  navigation: AddServerScreenProps['navigation'] | EditServerScreenProps['navigation'];
}

function ServerForm({ mode, serverId, navigation }: ServerFormProps) {
  const { servers, addServer, updateServer } = useServers();
  
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authType, setAuthType] = useState<AuthType>('basic');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing server data in edit mode
  useEffect(() => {
    if (mode === 'edit' && serverId) {
      const server = servers.find(s => s.id === serverId);
      if (server) {
        setName(server.name);
        setUrl(server.url);
        setAuthType(server.authType);
        setUsername(server.username ?? '');
        // Load password from secure storage
        getCredential(serverId).then(pwd => {
          if (pwd) setPassword(pwd);
        });
      }
    }
  }, [mode, serverId, servers]);

  const handleTest = useCallback(async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a server URL');
      return;
    }

    setTesting(true);
    try {
      const result = await testConnection(
        url,
        authType,
        authType === 'basic' ? username : undefined,
        authType === 'basic' ? password : undefined
      );

      if (result.success) {
        Alert.alert('Success', 'Connection successful!');
      } else {
        let message = result.error ?? 'Connection failed';
        if (result.authMode === 'onboarding') {
          message = 'This server needs initial setup. Please complete setup in a web browser first.';
        } else if (result.authMode === 'basic' && authType !== 'basic') {
          message = 'This server requires Basic Authentication. Please select "Basic Auth" and provide credentials.';
        }
        Alert.alert('Connection Failed', message);
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setTesting(false);
    }
  }, [url, authType, username, password]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a server name');
      return;
    }
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a server URL');
      return;
    }
    if (authType === 'basic' && !username.trim()) {
      Alert.alert('Error', 'Please enter a username for Basic Auth');
      return;
    }

    setSaving(true);
    try {
      const serverData = {
        name: name.trim(),
        url: url.trim(),
        authType,
        username: authType === 'basic' ? username.trim() : undefined,
      };

      if (mode === 'add') {
        await addServer(serverData, authType === 'basic' ? password : undefined);
      } else if (serverId) {
        await updateServer(serverId, serverData, authType === 'basic' ? password : undefined);
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save server');
    } finally {
      setSaving(false);
    }
  }, [mode, serverId, name, url, authType, username, password, addServer, updateServer, navigation]);

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
          <Text style={styles.label}>Server Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="My ternssh Server"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://ternssh.example.com"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>
            The URL of your ternssh deployment
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Authentication</Text>
          <View style={styles.authOptions}>
            {(['basic', 'access', 'none'] as AuthType[]).map((type) => (
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
                  {type === 'basic' ? 'Basic Auth' : type === 'access' ? 'Cloudflare Access' : 'None'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            {authType === 'basic' && 'Enter the username and password for your ternssh deployment.'}
            {authType === 'access' && 'Cloudflare Access authentication will be handled by the system.'}
            {authType === 'none' && 'No authentication required (not recommended for production).'}
          </Text>
        </View>

        {authType === 'basic' && (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="admin"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#999"
                secureTextEntry
              />
              <Text style={styles.hint}>
                Password is stored securely on device
              </Text>
            </View>
          </>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.testButton]}
            onPress={handleTest}
            disabled={testing || saving}
          >
            {testing ? (
              <ActivityIndicator color="#007AFF" />
            ) : (
              <Text style={styles.testButtonText}>Test Connection</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={handleSave}
            disabled={testing || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>
                {mode === 'add' ? 'Add Server' : 'Save Changes'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
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
  buttonContainer: {
    gap: 12,
    marginTop: 8,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  testButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
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
