import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Root stack contains the main tabs and modal screens
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList>;
  AddServer: undefined;
  EditServer: { serverId: string };
  SSHHosts: { serverId: string };
  AddSSHHost: { serverId: string };
  EditSSHHost: { serverId: string; hostId: string };
  Terminal: { 
    serverId: string; 
    sshHostId: string;
    sshHostName: string;
  };
};

// Main tab navigator
export type MainTabParamList = {
  Servers: undefined;
  Sessions: undefined;
  Settings: undefined;
};

// Screen props types
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
