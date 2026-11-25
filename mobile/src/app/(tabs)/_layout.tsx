import { Tabs } from 'expo-router/tabs';

import { TabBar } from '../../components/TabBar';
import { colors } from '../../lib/theme';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="(home)" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="analytics" />
      <Tabs.Screen name="favorites" />
      <Tabs.Screen name="chat" />
    </Tabs>
  );
}
