import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoginScreen } from '../components/LoginScreen';
import { StoreProvider, useStore } from '../lib/store';
import { colors } from '../lib/theme';

function Gate() {
  const { ready, user } = useStore();
  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  if (!user) return <LoginScreen />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="fertilizer" />
      <Stack.Screen name="guide/index" />
      <Stack.Screen name="guide/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Gate />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
