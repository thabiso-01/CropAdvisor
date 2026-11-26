import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Bullet, Card, ErrorBanner, Fab, Icon, Inset, NumberedStep, PrimaryButton, Progress, s, scoreColor, ScreenHeader, Segmented, StatusBadge,
} from '../../../../components/ui';
import { Analysis, api, imageUrl } from '../../../../lib/api';
import { cap, fmtDate } from '../../../../lib/pickImage';
import { useStore } from '../../../../lib/store';
import { colors, radius, shadow } from '../../../../lib/theme';

type Tab = 'overview' | 'treatment' | 'details';
const sevColor = { low: colors.warning, medium: colors.serious, high: colors.critical } as const;

export default function AnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bump, setChatAnalysisId } = useStore();
  const [a, setA] = useState<Analysis | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(() => {
    setErr(null);
    api.get(id).then(setA).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => {
    setA(null);
    setTab('overview');
    load();
  }, [load]);

  if (err) return <SafeAreaView style={{ flex: 1 }}><ScreenHeader title="Crop Advisor AI" /><ErrorBanner message={err} onRetry={load} /></SafeAreaView>;
  if (!a) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} size="large" /></View>;

  const r = a.result;
  const ask = (q?: string) => {
    setChatAnalysisId(a.id);
    router.push({ pathname: '/chat', params: q ? { q } : {} });
  };
  const toggleFav = async () => {
    const u = await api.setFavorite(a.id, !a.favorite);
    setA({ ...a, favorite: u.favorite });
    bump();
  };
  const remove = () => {
    const go = async () => {
      await api.remove(a.id);
      bump();
      router.replace('/history');
    };
    if (Platform.OS === 'web') return go();
    Alert.alert('Delete analysis?', 'This removes the photo and results.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };
  const share = () =>
    Share.share({
      message: `Crop Advisor AI — ${r.crop}\nHealth: ${r.health_score}/100 (${r.health_status})\n${r.summary}\n\n${r.issues.map((i) => `• ${i.name}`).join('\n')}\n\nTreatment:\n${r.treatment.map((t, i) => `${i + 1}. ${t.title}: ${t.description}`).join('\n')}`,
    });

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <ScreenHeader title="Crop Advisor AI" />
        <View style={{ paddingHorizontal: 18, gap: 16 }}>
          <View style={st.imgWrap}>
            <Image source={{ uri: imageUrl(a.image_url) }} style={st.img} contentFit="cover" transition={200} />
            <View style={st.imgTag}><Icon name="sprout" size={14} color="#fff" /><Text style={st.imgTagText}>{r.crop}</Text></View>
          </View>

          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[{ key: 'overview', label: 'Overview' }, { key: 'treatment', label: 'Treatment' }, { key: 'details', label: 'Details' }]}
          />

          {tab === 'overview' && (
            <>
              <Card>
                <View style={s.rowBetween}>
                  <View>
                    <Text style={s.muted}>Plant health</Text>
                    <Text style={[st.big, { color: scoreColor(r.health_score) }]}>{r.health_score}<Text style={st.bigOf}>/100</Text></Text>
                  </View>
                  <StatusBadge status={r.health_status} />
                </View>
                <Progress value={r.health_score} color={scoreColor(r.health_score)} />
                <Text style={[s.body, { marginTop: 12 }]}>{r.summary}</Text>
              </Card>

              {r.expert_check?.recommended && (
                <View style={st.expert} accessibilityRole="alert">
                  <Text style={st.expertTitle}>Confirm with an expert before you spray or buy anything</Text>
                  {r.expert_check.reasons.map((x) => (
                    <Text key={x} style={st.expertText}>{`• ${x}`}</Text>
                  ))}
                  <Text style={[st.expertText, { marginTop: 6 }]}>Show this report to your local extension officer or an agronomist. Use Share to send it.</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Stat icon="sprout-outline" label="Growth stage" value={cap(r.growth_stage)} />
                <Stat icon="basket-outline" label="Harvest" value={r.harvest.ready ? 'Ready' : `${r.harvest.readiness_percent}%`} />
                <Stat icon="tag-outline" label="Market grade" value={r.market.quality_grade} />
              </View>

              <Card title="Detected Issues" right={<Text style={s.small}>{r.issues.length} found</Text>}>
                {r.issues.length === 0 ? (
                  <Inset style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <Icon name="check-decagram" size={22} color={colors.good} />
                    <Text style={[s.body, { flex: 1 }]}>No diseases, pests or deficiencies detected. Keep up the good work!</Text>
                  </Inset>
                ) : (
                  r.issues.map((i, idx) => (
                    <View key={idx} style={[st.issue, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={s.rowBetween}>
                        <Text style={[s.stepTitle, { flex: 1 }]}>{i.name}</Text>
                        <View style={[s.badge, { backgroundColor: colors.inset }]}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sevColor[i.severity] }} />
                          <Text style={[s.badgeText, { color: colors.textSoft }]}>{cap(i.severity)}</Text>
                        </View>
                      </View>
                      <Text style={s.muted}>{i.description}</Text>
                      {i.evidence ? <Text style={[s.small, { marginTop: 4 }]}>Seen: {i.evidence}</Text> : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <View style={{ flex: 1 }}><Progress value={i.confidence * 100} height={6} /></View>
                        <Text style={s.small}>{Math.round(i.confidence * 100)}% confidence</Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>

              <Card title="Harvest Readiness">
                <View style={[s.rowBetween, { marginBottom: 8 }]}>
                  <Text style={s.body}>{r.harvest.estimated_days}</Text>
                  <Text style={[st.pct]}>{r.harvest.readiness_percent}%</Text>
                </View>
                <Progress value={r.harvest.readiness_percent} />
                <Text style={[s.muted, { marginTop: 10 }]}>{r.harvest.advice}</Text>
                {r.harvest.signs ? <Inset style={{ marginTop: 10 }}><Text style={s.muted}>{r.harvest.signs}</Text></Inset> : null}
              </Card>

              {!!r.follow_up_questions?.length && (
                <Card title="Ask the Assistant">
                  {r.follow_up_questions.map((q) => (
                    <Pressable key={q} style={st.qRow} onPress={() => ask(q)}>
                      <Icon name="chat-question-outline" size={18} color={colors.primaryDark} />
                      <Text style={[s.body, { flex: 1 }]}>{q}</Text>
                      <Icon name="chevron-right" size={18} color={colors.faint} />
                    </Pressable>
                  ))}
                </Card>
              )}
            </>
          )}

          {tab === 'treatment' && (
            <>
              <Card title="Treatment Guide">
                <Inset>
                  <Text style={s.muted}>
                    {r.treatment.length
                      ? "Based on the identified issue, here's a general guide to help you treat your crops:"
                      : 'Your plant looks healthy — no treatment needed. Follow the prevention tips below to keep it that way.'}
                  </Text>
                  {r.treatment.map((t, i) => (
                    <NumberedStep key={i} n={i + 1} title={t.title}>{t.description}</NumberedStep>
                  ))}
                </Inset>
              </Card>
              {r.prevention.length > 0 && (
                <Card title="Prevention">
                  {r.prevention.map((p) => <Bullet key={p} icon="shield-check-outline">{p}</Bullet>)}
                </Card>
              )}
              <Card style={{ flexDirection: 'row', gap: 10 }}>
                <Icon name="alert-circle-outline" size={20} color={colors.serious} />
                <Text style={[s.muted, { flex: 1 }]}>
                  Use only crop-protection products registered for your crop in your country. Follow the label, wear protective gear and respect the pre-harvest interval. Confirm serious cases with your local extension officer.
                </Text>
              </Card>
            </>
          )}

          {tab === 'details' && (
            <>
              <Card title="Watering">
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <Mini icon="calendar-sync" label="Frequency" value={r.watering.frequency} />
                  <Mini icon="water" label="Amount" value={r.watering.amount} />
                </View>
                <Text style={s.muted}>{r.watering.advice}</Text>
              </Card>

              <Card title="Fertilizer" right={<Pressable onPress={() => router.push({ pathname: '/fertilizer', params: { analysisId: a.id } })}><Text style={st.link}>Open advisor</Text></Pressable>}>
                <Inset><Text style={s.body}>{r.fertilizer.recommended}</Text></Inset>
                <Text style={[s.muted, { marginTop: 10 }]}>NPK {r.fertilizer.npk.n}-{r.fertilizer.npk.p}-{r.fertilizer.npk.k} · {r.fertilizer.timing}</Text>
              </Card>

              <Card title="Market & Selling">
                <Text style={s.body}><Text style={{ fontWeight: '700' }}>Quality grade {r.market.quality_grade}. </Text>{r.market.advice}</Text>
              </Card>

              {r.yield_tips.length > 0 && (
                <Card title="Improve Your Yield">
                  {r.yield_tips.map((t) => <Bullet key={t} icon="trending-up">{t}</Bullet>)}
                </Card>
              )}

              {!!r.sources?.length && (
                <Card title="Knowledge Sources">
                  {r.sources.map((g) => (
                    <Pressable key={g.id} style={st.qRow} onPress={() => router.push(`/guide/${g.id}`)}>
                      <Icon name="book-open-variant" size={18} color={colors.primaryDark} />
                      <Text style={[s.body, { flex: 1 }]}>{g.title}</Text>
                      <Icon name="chevron-right" size={18} color={colors.faint} />
                    </Pressable>
                  ))}
                </Card>
              )}

              <Card title="Scan Info">
                <Info k="Date" v={fmtDate(a.created_at)} />
                <Info k="Crop" v={`${r.crop}${r.crop_confidence ? ` (${Math.round(r.crop_confidence * 100)}% sure)` : ''}`} />
                {a.notes ? <Info k="Your notes" v={a.notes} /> : null}
                <Info k="Analysed by" v={a.provider.startsWith('gemini:') ? `Google ${a.provider.slice(7)}` : a.provider.startsWith('claude') ? 'Claude AI vision' : 'Offline knowledge base'} />
              </Card>
            </>
          )}
        </View>
      </ScrollView>

      <Fab
        bottom={84}
        actions={[
          { label: 'Ask AI about this plant', icon: 'robot-happy-outline', onPress: () => ask() },
          { label: 'Fertilizer advisor', icon: 'sprout', onPress: () => router.push({ pathname: '/fertilizer', params: { analysisId: a.id } }) },
          { label: a.favorite ? 'Remove from favorites' : 'Add to favorites', icon: a.favorite ? 'star-off-outline' : 'star-outline', onPress: toggleFav },
          { label: 'Share report', icon: 'share-variant', onPress: share },
          { label: 'Delete analysis', icon: 'trash-can-outline', onPress: remove, danger: true },
        ]}
      />
      <View style={st.bottomBar}>
        <PrimaryButton label="Analyze Again" icon="camera" onPress={() => router.navigate('/')} />
      </View>
    </SafeAreaView>
  );
}

function Stat({ icon, label, value }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; value: string }) {
  return (
    <View style={st.stat}>
      <Icon name={icon} size={20} color={colors.primaryDark} />
      <Text style={st.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.small}>{label}</Text>
    </View>
  );
}

function Mini({ icon, label, value }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; value: string }) {
  return (
    <View style={[s.inset, { flex: 1, gap: 4 }]}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name={icon} size={16} color={colors.primaryDark} /><Text style={s.small}>{label}</Text></View>
      <Text style={[s.body, { fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const Info = ({ k, v }: { k: string; v: string }) => (
  <View style={[s.rowBetween, { paddingVertical: 6, alignItems: 'flex-start' }]}>
    <Text style={s.muted}>{k}</Text>
    <Text style={[s.body, { flex: 1, textAlign: 'right' }]}>{v}</Text>
  </View>
);

const st = StyleSheet.create({
  expert: { backgroundColor: '#FFF8E1', borderColor: '#F5D77A', borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 2 },
  expertTitle: { color: '#5D4300', fontWeight: '700', marginBottom: 4 },
  expertText: { color: '#6D5000', lineHeight: 20 },
  imgWrap: { borderRadius: radius.md, overflow: 'hidden', ...shadow },
  img: { width: '100%', height: 200, backgroundColor: colors.inset },
  imgTag: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(46,125,50,0.85)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  imgTagText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  big: { fontSize: 40, fontWeight: '800', marginBottom: 8 },
  bigOf: { fontSize: 16, color: colors.faint, fontWeight: '600' },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: radius.md, padding: 12, gap: 4, ...shadow },
  statValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  issue: { paddingVertical: 12, gap: 4 },
  pct: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
  qRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10 },
  link: { color: colors.primaryDark, fontWeight: '700' },
  bottomBar: { position: 'absolute', left: 18, right: 18, bottom: 12 },
});
