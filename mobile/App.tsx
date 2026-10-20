import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ServersProvider } from './src/context/ServersContext';
import { AppNavigator } from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <ServersProvider>
        <AppNavigator />
        <StatusBar style="auto" />
      </ServersProvider>
    </SafeAreaProvider>
  );
}
