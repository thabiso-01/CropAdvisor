import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner, Icon, IconName, s, ScreenHeader } from '../../components/ui';
import { api, Guide } from '../../lib/api';
import { colors } from '../../lib/theme';

const CAT_ICON: Record<string, IconName> = {
  Diagnosis: 'stethoscope', Disease: 'bacteria-outline', Disorder: 'alert-outline', Watering: 'water-outline',
  Harvest: 'basket-outline', Yield: 'trending-up', Nutrition: 'flask-outline', Pest: 'bug-outline', Care: 'hand-heart-outline', Soil: 'shovel',
};

export default function Guides() {
  const [items, setItems] = useState<Guide[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.guides().then(setItems).catch((e) => setErr(e.message));
  }, []);
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <ScreenHeader back title="Crop Guides" subtitle="Trusted agricultural knowledge" />
        {err && <ErrorBanner message={err} />}
        {!items && !err && <ActivityIndicator color={colors.primary} />}
        <View style={{ paddingHorizontal: 18, gap: 10 }}>
          {items?.map((g) => (
            <Pressable key={g.id} style={[s.row, { padding: 14 }]} onPress={() => router.push(`/guide/${g.id}`)}>
              <View style={s.iconBubble}><Icon name={CAT_ICON[g.category] ?? 'book-open-variant'} size={20} color={colors.primaryDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{g.title}</Text>
                <Text style={s.small}>{g.category} · {g.crop === 'general' ? 'All crops' : g.crop}</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.faint} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
