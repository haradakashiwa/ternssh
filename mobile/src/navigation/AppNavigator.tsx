import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';

import { ServersScreen } from '../screens/ServersScreen';
import { SessionsScreen } from '../screens/SessionsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AddServerScreen, EditServerScreen } from '../screens/AddEditServerScreen';
import { SSHHostsScreen } from '../screens/SSHHostsScreen';
import { AddSSHHostScreen, EditSSHHostScreen } from '../screens/AddEditSSHHostScreen';
import { TerminalScreen } from '../screens/TerminalScreen';
import type { RootStackParamList, MainTabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Servers: '🖥️',
    Sessions: '📟',
    Settings: '⚙️',
  };
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.tabIconText, focused && styles.tabIconFocused]}>
        {icons[name] ?? '•'}
      </Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
      })}
    >
      <Tab.Screen
        name="Servers"
        component={ServersScreen}
        options={{ title: 'Servers' }}
      />
      <Tab.Screen
        name="Sessions"
        component={SessionsScreen}
        options={{ title: 'Sessions' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: styles.header,
          headerTitleStyle: styles.headerTitle,
        }}
      >
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AddServer"
          component={AddServerScreen}
          options={{ title: 'Add Server' }}
        />
        <Stack.Screen
          name="EditServer"
          component={EditServerScreen}
          options={{ title: 'Edit Server' }}
        />
        <Stack.Screen
          name="SSHHosts"
          component={SSHHostsScreen}
          options={{ title: 'SSH Hosts' }}
        />
        <Stack.Screen
          name="AddSSHHost"
          component={AddSSHHostScreen}
          options={{ title: 'Add SSH Host' }}
        />
        <Stack.Screen
          name="EditSSHHost"
          component={EditSSHHostScreen}
          options={{ title: 'Edit SSH Host' }}
        />
        <Stack.Screen
          name="Terminal"
          component={TerminalScreen}
          options={{
            title: 'Terminal',
            headerStyle: {
              ...styles.header,
              backgroundColor: '#1e1e1e',
            },
            headerTitleStyle: {
              ...styles.headerTitle,
              color: '#fff',
            },
            headerTintColor: '#fff',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    paddingTop: 4,
    height: 56,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconText: {
    fontSize: 20,
    opacity: 0.6,
  },
  tabIconFocused: {
    opacity: 1,
  },
  header: {
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
