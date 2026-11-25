import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, ErrorBanner, Markdown, PrimaryButton, s, ScreenHeader } from '../../components/ui';
import { api, Guide } from '../../lib/api';
import { colors } from '../../lib/theme';

export default function GuideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [g, setG] = useState<Guide | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.guide(id).then(setG).catch((e) => setErr(e.message));
  }, [id]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <ScreenHeader back title="Guide" subtitle={g ? `${g.category} · ${g.crop === 'general' ? 'All crops' : g.crop}` : undefined} />
        {err && <ErrorBanner message={err} />}
        {!g && !err && <ActivityIndicator color={colors.primary} />}
        {g && (
          <View style={{ paddingHorizontal: 18, gap: 16 }}>
            <Card>
              <Text style={[s.cardTitle, { fontSize: 22, marginBottom: 12 }]}>{g.title}</Text>
              <Markdown text={g.content ?? ''} color={colors.textSoft} />
            </Card>
            <PrimaryButton
              label="Ask the assistant about this"
              icon="robot-happy-outline"
              onPress={() => router.push({ pathname: '/chat', params: { q: `Tell me more about: ${g.title}. What should I do on my farm?` } })}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
