import { Stack } from 'expo-router';

import { colors } from '../../../lib/theme';

export default function HomeStack() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="analysis/[id]" />
    </Stack>
  );
}
