import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../lib/store';
import { colors } from '../lib/theme';
import { Icon, IconName } from './ui';

const TABS: { name: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: '(home)', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'history', label: 'History', icon: 'history', iconActive: 'history' },
  { name: 'analytics', label: 'Analytics', icon: 'chart-line-variant', iconActive: 'chart-line-variant' },
  { name: 'favorites', label: 'Favorites', icon: 'star', iconActive: 'star' },
  { name: 'chat', label: 'Chat', icon: 'message-text-outline', iconActive: 'message-text' },
];

export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { favoritesCount } = useStore();
  const current = state.routes[state.index]?.name ?? '(home)';

  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const active = current === t.name;
        const route = state.routes.find((r) => r.name === t.name);
        return (
          <Pressable
            key={t.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t.label}
            style={st.item}
            onPress={() => {
              if (!route) return;
              const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              const focused = state.routes[state.index]?.key === route.key;
              if (e.defaultPrevented) return;
              if (!focused) navigateToTab(route.key);
              else if (t.name === '(home)') router.navigate('/'); // pop a result screen back to Home
            }}
          >
            <View style={[st.iconWrap, active && st.iconWrapActive]}>
              <Icon name={active ? t.iconActive : t.icon} size={24} color={active ? colors.primaryDark : colors.faint} />
              {t.name === 'favorites' && favoritesCount > 0 && (
                <View style={st.badge}><Text style={st.badgeText}>{favoritesCount > 99 ? '99+' : favoritesCount}</Text></View>
              )}
            </View>
            <Text style={[st.label, active && { color: colors.primaryDark, fontWeight: '700' }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6, borderTopLeftRadius: 18, borderTopRightRadius: 18, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 12 },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  iconWrap: { width: 44, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: colors.primaryLight },
  label: { fontSize: 12, color: colors.faint },
  badge: { position: 'absolute', top: -2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
