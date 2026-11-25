import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, EmptyState, ErrorBanner, Icon, IconName, PrimaryButton, s, ScreenHeader } from '../../components/ui';
import { api, Stats } from '../../lib/api';
import { fmtDate } from '../../lib/pickImage';
import { useStore } from '../../lib/store';
import { colors, radius, shadow, statusMeta } from '../../lib/theme';

const CHART_H = 120;

export default function Analytics() {
  const { version } = useStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    api.stats().then(setStats).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => load(), [load, version]));

  const maxCrop = Math.max(1, ...(stats?.by_crop.map((c) => c.count) ?? [1]));
  const sel = selected !== null ? stats?.trend[selected] : undefined;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        <ScreenHeader title="Analytics" subtitle="Your farm health at a glance" />
        {err && <ErrorBanner message={err} onRetry={load} />}
        {stats && stats.total === 0 ? (
          <EmptyState icon="chart-line-variant" title="No data yet" text="Analyse a few plants and your farm's health trends will show up here."
            action={<PrimaryButton label="Scan a plant" icon="camera" onPress={() => router.navigate('/')} style={{ marginTop: 12, paddingHorizontal: 24 }} />} />
        ) : stats ? (
          <View style={{ paddingHorizontal: 18, gap: 16 }}>
            <View style={st.grid}>
              <Tile icon="leaf" label="Total scans" value={stats.total} />
              <Tile icon="heart-pulse" label="Avg. health" value={`${stats.avg_health}`} suffix="/100" />
              <Tile icon="check-decagram" label="Healthy plants" value={stats.healthy} suffix={` of ${stats.total}`} />
              <Tile icon="basket" label="Ready to harvest" value={stats.ready_to_harvest} />
            </View>

            <Card title="Health Score Trend" right={<Text style={s.small}>last {stats.trend.length} {stats.trend.length === 1 ? 'scan' : 'scans'}</Text>}>
              <View style={st.tooltipRow}>
                {sel ? (
                  <Text style={s.body}><Text style={{ fontWeight: '800' }}>{sel.score}/100</Text> · {sel.crop} · {fmtDate(sel.date)}</Text>
                ) : (
                  <Text style={s.small}>Tap a bar to see the scan</Text>
                )}
              </View>
              <View style={st.chart}>
                {[100, 50].map((g) => (
                  <View key={g} style={[st.grid50, { bottom: (g / 100) * CHART_H }]}><Text style={st.gridLabel}>{g}</Text></View>
                ))}
                <View style={st.bars}>
                  {stats.trend.map((t, i) => (
                    <Pressable key={i} onPress={() => setSelected(i === selected ? null : i)} style={st.barHit} accessibilityLabel={`${t.crop} ${t.score} out of 100`}>
                      <View style={[st.bar, { height: Math.max(4, (t.score / 100) * CHART_H), opacity: selected === null || selected === i ? 1 : 0.4 }]} />
                    </Pressable>
                  ))}
                </View>
              </View>
            </Card>

            <Card title="Plant Health Status">
              <View style={st.stack}>
                {stats.by_status.filter((b) => b.count).map((b) => (
                  <View key={b.status} style={{ flex: b.count, backgroundColor: statusMeta[b.status].color, height: 14 }} />
                ))}
              </View>
              <View style={{ marginTop: 12, gap: 8 }}>
                {stats.by_status.map((b) => (
                  <View key={b.status} style={s.rowBetween}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Icon name={statusMeta[b.status].icon as IconName} size={16} color={statusMeta[b.status].color} />
                      <Text style={s.body}>{statusMeta[b.status].label}</Text>
                    </View>
                    <Text style={[s.body, { fontWeight: '700' }]}>{b.count}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <Card title="Scans by Crop">
              {stats.by_crop.map((c) => (
                <View key={c.crop} style={{ marginBottom: 10 }}>
                  <View style={[s.rowBetween, { marginBottom: 4 }]}>
                    <Text style={s.body}>{c.crop}</Text>
                    <Text style={[s.body, { fontWeight: '700' }]}>{c.count}</Text>
                  </View>
                  <View style={st.hTrack}><View style={[st.hBar, { width: `${(c.count / maxCrop) * 100}%` }]} /></View>
                </View>
              ))}
            </Card>

            <Card title="Most Common Problems">
              {stats.top_issues.length ? (
                stats.top_issues.map((iss, i) => (
                  <Pressable key={iss.name} style={st.issueRow} onPress={() => router.push({ pathname: '/chat', params: { q: `How do I deal with ${iss.name.toLowerCase()}?` } })}>
                    <Text style={st.rank}>{i + 1}</Text>
                    <Text style={[s.body, { flex: 1 }]}>{iss.name}</Text>
                    <Text style={s.small}>{iss.count}×</Text>
                    <Icon name="chat-question-outline" size={18} color={colors.primaryDark} />
                  </Pressable>
                ))
              ) : (
                <Text style={s.muted}>No problems detected so far. 🌱</Text>
              )}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ icon, label, value, suffix }: { icon: IconName; label: string; value: number | string; suffix?: string }) {
  return (
    <View style={st.tile}>
      <View style={s.iconBubble}><Icon name={icon} size={20} color={colors.primaryDark} /></View>
      <Text style={st.tileValue}>{value}<Text style={st.tileSuffix}>{suffix}</Text></Text>
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: '47.5%', flexGrow: 1, backgroundColor: '#fff', borderRadius: radius.md, padding: 14, gap: 6, ...shadow },
  tileValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  tileSuffix: { fontSize: 13, color: colors.faint, fontWeight: '600' },
  tooltipRow: { minHeight: 24, marginBottom: 6 },
  chart: { height: CHART_H, marginLeft: 24 },
  grid50: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  gridLabel: { position: 'absolute', left: -24, top: -8, fontSize: 10, color: colors.faint },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
  barHit: { flex: 1, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', maxWidth: 22, backgroundColor: colors.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  stack: { flexDirection: 'row', gap: 2, borderRadius: 7, overflow: 'hidden' },
  hTrack: { height: 10, backgroundColor: colors.segmentBg, borderRadius: 5, overflow: 'hidden' },
  hBar: { height: 10, backgroundColor: colors.primary, borderRadius: 5 },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rank: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primaryLight, color: colors.primaryDark, textAlign: 'center', lineHeight: 24, fontWeight: '800', overflow: 'hidden' },
});
