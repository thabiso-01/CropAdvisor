import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Bullet, Card, ErrorBanner, Fab, Icon, IconName, Inset, PrimaryButton, s, ScreenHeader, Segmented } from '../components/ui';
import { Analysis, api, FertilizerPlan, imageUrl } from '../lib/api';
import { cap } from '../lib/pickImage';
import { useStore } from '../lib/store';
import { colors, CROPS, radius, shadow } from '../lib/theme';

const STAGES = ['seedling', 'vegetative', 'flowering', 'fruiting', 'mature'];

export default function Fertilizer() {
  const { analysisId } = useLocalSearchParams<{ analysisId?: string }>();
  const { setChatAnalysisId } = useStore();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [crop, setCrop] = useState('tomato');
  const [stage, setStage] = useState<string | undefined>();
  const [plan, setPlan] = useState<FertilizerPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'details'>('overview');

  useEffect(() => {
    if (analysisId) api.get(analysisId).then(setAnalysis).catch((e) => setErr(e.message));
  }, [analysisId]);

  useEffect(() => {
    setErr(null);
    api
      .fertilizer(analysisId ? { analysis_id: analysisId, stage } : { crop, stage })
      .then((p) => {
        setPlan(p);
        if (!stage) setStage(p.stage);
      })
      .catch((e) => setErr(e.message));
  }, [analysisId, crop, stage]);

  const askAI = () => {
    if (analysisId) setChatAnalysisId(analysisId);
    router.push({ pathname: '/chat', params: { q: `What fertilizer should I use for my ${plan?.crop ?? crop} at the ${plan?.stage ?? 'current'} stage, and how much?` } });
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <ScreenHeader back title="Fertilizer Advisor" subtitle="AI-Powered Recommendations" />
        {err && <ErrorBanner message={err} />}
        <View style={{ paddingHorizontal: 18, gap: 16 }}>
          {analysis ? (
            <Image source={{ uri: imageUrl(analysis.image_url) }} style={st.img} contentFit="cover" />
          ) : (
            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={st.banner}>
              <Icon name="sprout" size={110} color="rgba(255,255,255,0.18)" style={{ position: 'absolute', right: -6, bottom: -12 }} />
              <Text style={st.bannerTitle}>{plan?.crop ?? 'Choose your crop'}</Text>
              <Text style={st.bannerText}>Stage-by-stage feeding plan from trusted agronomy guidance.</Text>
            </LinearGradient>
          )}

          {!analysisId && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CROPS.filter((c) => c.id).map((c) => (
                <Pressable key={c.id} onPress={() => setCrop(c.id)} style={[st.chip, crop === c.id && st.chipActive]}>
                  <Icon name={c.icon as IconName} size={16} color={crop === c.id ? '#fff' : colors.primaryDark} />
                  <Text style={[st.chipText, crop === c.id && { color: '#fff' }]}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <Segmented value={tab} onChange={setTab} options={[{ key: 'overview', label: 'Overview' }, { key: 'details', label: 'Details' }]} />

          {!plan ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          ) : tab === 'overview' ? (
            <>
              <Card title="Recommended Fertilizer">
                <Inset><Text style={s.muted}>{plan.recommended}</Text></Inset>
                {plan.note ? <Text style={[s.small, { marginTop: 8 }]}>{plan.note}</Text> : null}
              </Card>

              <Card title="NPK Ratio">
                <Inset style={{ flexDirection: 'row' }}>
                  {([['Nitrogen (N)', plan.npk.n], ['Phosphorus (P)', plan.npk.p], ['Potassium (K)', plan.npk.k]] as const).map(([l, v]) => (
                    <View key={l} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                      <Text style={s.small}>{l}</Text>
                      <Text style={st.npk}>{v}</Text>
                    </View>
                  ))}
                </Inset>
              </Card>

              <Card title="Application">
                <Row icon="hand-water" label="How" value={plan.application} />
                <Row icon="calendar-clock" label="When" value={plan.timing} />
                <Row icon="sprout-outline" label="Growth stage" value={cap(plan.stage)} />
              </Card>

              {plan.adjustments.length > 0 && (
                <Card title="Based on Your Plant's Condition">
                  {plan.adjustments.map((a) => <Bullet key={a} icon="information-outline">{a}</Bullet>)}
                </Card>
              )}
            </>
          ) : (
            <>
              <Card title="Growth Stage">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {STAGES.map((x) => (
                    <Pressable key={x} onPress={() => setStage(x)} style={[st.chip, stage === x && st.chipActive]}>
                      <Text style={[st.chipText, stage === x && { color: '#fff' }]}>{cap(x)}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
              <Card title="Season Schedule">
                {plan.schedule.map((x, i) => (
                  <View key={x.stage} style={[st.sched, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={[st.dot, x.stage === plan.stage && { backgroundColor: colors.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.stepTitle}>{cap(x.stage)} <Text style={s.small}>· NPK {x.npk}</Text></Text>
                      <Text style={s.muted}>{x.product}</Text>
                      <Text style={s.small}>{x.timing}</Text>
                    </View>
                  </View>
                ))}
              </Card>
              <Card style={{ flexDirection: 'row', gap: 10 }}>
                <Icon name="flask-outline" size={20} color={colors.serious} />
                <Text style={[s.muted, { flex: 1 }]}>{plan.safety}</Text>
              </Card>
            </>
          )}
        </View>
      </ScrollView>

      <Fab
        bottom={90}
        actions={[
          { label: 'Ask AI for exact rates', icon: 'robot-happy-outline', onPress: askAI },
          { label: 'Open crop guides', icon: 'book-open-variant', onPress: () => router.push('/guide') },
          ...(analysisId ? [{ label: 'Back to analysis', icon: 'clipboard-text-outline' as IconName, onPress: () => router.back() }] : []),
        ]}
      />
      <View style={st.bottomBar}>
        <PrimaryButton label="Analyze Again" icon="camera" onPress={() => router.navigate('/')} />
      </View>
    </SafeAreaView>
  );
}

const Row = ({ icon, label, value }: { icon: IconName; label: string; value: string }) => (
  <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 8 }}>
    <View style={s.iconBubble}><Icon name={icon} size={18} color={colors.primaryDark} /></View>
    <View style={{ flex: 1 }}>
      <Text style={s.small}>{label}</Text>
      <Text style={s.body}>{value}</Text>
    </View>
  </View>
);

const st = StyleSheet.create({
  img: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.inset },
  banner: { borderRadius: radius.md, padding: 20, minHeight: 140, justifyContent: 'flex-end', overflow: 'hidden', ...shadow },
  bannerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  bannerText: { color: 'rgba(255,255,255,0.92)', marginTop: 4 },
  npk: { fontSize: 30, fontWeight: '800', color: colors.primaryDark },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.textSoft },
  sched: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border, marginTop: 5 },
  bottomBar: { position: 'absolute', left: 18, right: 18, bottom: 24 },
});
