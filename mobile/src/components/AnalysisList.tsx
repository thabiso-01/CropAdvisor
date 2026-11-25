import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, AnalysisSummary } from '../lib/api';
import { useStore } from '../lib/store';
import { colors, radius } from '../lib/theme';
import { AnalysisRow, EmptyState, ErrorBanner, Icon, PrimaryButton, ScreenHeader } from './ui';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'issues', label: 'Needs attention' },
  { key: 'ready', label: 'Ready to harvest' },
] as const;

export function AnalysisList({ favorites }: { favorites?: boolean }) {
  const { version, bump } = useStore();
  const [items, setItems] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    api
      .list(favorites ? true : undefined)
      .then(setItems)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [favorites]);

  useFocusEffect(useCallback(() => load(), [load, version]));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !`${i.crop} ${i.top_issue ?? ''} ${i.summary}`.toLowerCase().includes(q)) return false;
      if (filter === 'healthy') return i.health_status === 'healthy';
      if (filter === 'issues') return i.health_status !== 'healthy';
      if (filter === 'ready') return i.harvest_ready;
      return true;
    });
  }, [items, query, filter]);

  const toggle = async (item: AnalysisSummary) => {
    setItems((xs) => (favorites ? xs.filter((x) => x.id !== item.id) : xs.map((x) => (x.id === item.id ? { ...x, favorite: !x.favorite } : x))));
    try {
      await api.setFavorite(item.id, !item.favorite);
    } finally {
      bump();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScreenHeader title={favorites ? 'Favorites' : 'History'} subtitle={favorites ? 'Plants you are keeping an eye on' : 'All your plant analyses'} />
      {err && <ErrorBanner message={err} onRetry={load} />}
      <View style={st.search}>
        <Icon name="magnify" size={20} color={colors.faint} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search crop or problem" placeholderTextColor={colors.faint} style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 }} />
      </View>
      {!favorites && (
        <View style={st.filters}>
          {FILTERS.map((f) => (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[st.chip, filter === f.key && st.chipActive]}>
              <Text style={[st.chipText, filter === f.key && { color: '#fff' }]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        renderItem={({ item }) => <AnalysisRow item={item} onFavorite={() => toggle(item)} />}
        ListEmptyComponent={
          !loading && !err ? (
            <EmptyState
              icon={favorites ? 'star-outline' : 'history'}
              title={favorites ? 'No favorites yet' : items.length ? 'Nothing matches' : 'No analyses yet'}
              text={favorites ? 'Tap the star on any analysis to keep it here.' : 'Scan a plant to get your first health report.'}
              action={!items.length ? <PrimaryButton label="Scan a plant" icon="camera" onPress={() => router.navigate('/')} style={{ marginTop: 12, paddingHorizontal: 24 }} /> : undefined}
            />
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: radius.sm, marginHorizontal: 18, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, paddingVertical: 12 },
  chip: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.textSoft, fontSize: 13 },
});
