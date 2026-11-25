import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnalysisRow, Card, Icon, IconName, PrimaryButton, s, ScreenHeader } from '../../../components/ui';
import { api, AnalysisSummary } from '../../../lib/api';
import { pickImage } from '../../../lib/pickImage';
import { useStore } from '../../../lib/store';
import { colors, CROPS, radius, shadow } from '../../../lib/theme';

const QUICK: { label: string; icon: IconName; go: () => void }[] = [
  { label: 'Fertilizer\nAdvisor', icon: 'sprout', go: () => router.push('/fertilizer') },
  { label: 'AI\nAssistant', icon: 'robot-happy-outline', go: () => router.push('/chat') },
  { label: 'Crop\nGuides', icon: 'book-open-page-variant-outline', go: () => router.push('/guide') },
  { label: 'Farm\nAnalytics', icon: 'chart-box-outline', go: () => router.push('/analytics') },
];

const STEPS = ['Checking leaf colour…', 'Looking for disease signs…', 'Estimating harvest readiness…', 'Preparing recommendations…'];

export default function Home() {
  const { lang, version, bump } = useStore();
  const [photo, setPhoto] = useState<string | null>(null);
  const [crop, setCrop] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [recent, setRecent] = useState<AnalysisSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      api.list().then((r) => setRecent(r.slice(0, 3))).catch(() => setRecent([]));
    }, [version]),
  );

  const choose = async (src: 'camera' | 'library') => {
    const p = await pickImage(src);
    if (p) setPhoto(p.uri);
  };

  const analyze = async () => {
    if (!photo) return;
    setBusy(true);
    setStep(0);
    const timer = setInterval(() => setStep((x) => Math.min(x + 1, STEPS.length - 1)), 1800);
    try {
      const a = await api.analyze(photo, { crop: crop || undefined, notes: notes.trim() || undefined, lang });
      bump();
      setPhoto(null);
      setNotes('');
      router.push(`/analysis/${a.id}`);
    } catch (e) {
      Alert.alert('Analysis failed', (e as Error).message);
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <ScreenHeader title="Crop Advisor AI" subtitle="Digital Kisan Advisor" />

        <View style={{ paddingHorizontal: 18, gap: 16 }}>
          {/* hero / photo */}
          {photo ? (
            <View style={st.heroWrap}>
              <Image source={{ uri: photo }} style={st.hero} contentFit="cover" />
              <Pressable style={st.removePhoto} onPress={() => setPhoto(null)} accessibilityLabel="Remove photo">
                <Icon name="close" size={18} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.heroEmpty}>
              <Icon name="leaf" size={120} color="rgba(255,255,255,0.15)" style={{ position: 'absolute', right: -10, bottom: -14 }} />
              <View style={st.heroIcon}><Icon name="line-scan" size={30} color={colors.primaryDark} /></View>
              <Text style={st.heroTitle}>Scan your crop</Text>
              <Text style={st.heroText}>Take or upload a clear photo of the leaves, fruit or whole plant. AI checks its health, problems and harvest readiness.</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable style={st.heroBtn} onPress={() => choose('camera')}>
                  <Icon name="camera" size={18} color={colors.primaryDark} />
                  <Text style={st.heroBtnText}>Take Photo</Text>
                </Pressable>
                <Pressable style={[st.heroBtn, st.heroBtnGhost]} onPress={() => choose('library')}>
                  <Icon name="image-multiple" size={18} color="#fff" />
                  <Text style={[st.heroBtnText, { color: '#fff' }]}>Upload</Text>
                </Pressable>
              </View>
            </LinearGradient>
          )}

          {/* crop chips */}
          <View>
            <Text style={st.label}>Which crop is this?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {CROPS.map((c) => {
                const active = crop === c.id;
                return (
                  <Pressable key={c.id || 'auto'} onPress={() => setCrop(c.id)} style={[st.chip, active && st.chipActive]}>
                    <Icon name={c.icon as IconName} size={16} color={active ? '#fff' : colors.primaryDark} />
                    <Text style={[st.chipText, active && { color: '#fff' }]}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {photo && (
            <>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="What are you seeing? e.g. yellow spots after rain (optional)"
                placeholderTextColor={colors.faint}
                multiline
                style={st.notes}
              />
              <PrimaryButton label="Analyze Plant" icon="leaf-maple" onPress={analyze} loading={busy} />
              <PrimaryButton label="Choose another photo" icon="image-edit-outline" variant="outline" onPress={() => choose('library')} />
            </>
          )}

          {/* quick tools */}
          <View style={st.quickRow}>
            {QUICK.map((q) => (
              <Pressable key={q.label} style={st.quick} onPress={q.go}>
                <View style={s.iconBubble}><Icon name={q.icon} size={22} color={colors.primaryDark} /></View>
                <Text style={st.quickText}>{q.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* recent */}
          <View style={s.rowBetween}>
            <Text style={s.cardTitle}>Recent scans</Text>
            {recent.length > 0 && <Pressable onPress={() => router.push('/history')}><Text style={{ color: colors.primaryDark, fontWeight: '700' }}>See all</Text></Pressable>}
          </View>
          {recent.length ? (
            recent.map((r) => <AnalysisRow key={r.id} item={r} />)
          ) : (
            <Card style={{ alignItems: 'center', gap: 6 }}>
              <Icon name="sprout-outline" size={34} color={colors.primary} />
              <Text style={s.muted}>Your plant analyses will appear here.</Text>
            </Card>
          )}

          <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={s.iconBubble}><Icon name="lightbulb-on-outline" size={20} color={colors.primaryDark} /></View>
            <Text style={[s.muted, { flex: 1 }]}>Photo tip: shoot in daylight, fill the frame with the affected leaves, and include both sides of a leaf if you can.</Text>
          </Card>
        </View>
      </ScrollView>

      <Modal visible={busy} transparent animationType="fade">
        <View style={st.overlay}>
          <View style={st.overlayCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[s.cardTitle, { marginTop: 14 }]}>Analyzing your plant</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>{STEPS[step]}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  heroWrap: { borderRadius: radius.md, overflow: 'hidden', ...shadow },
  hero: { width: '100%', height: 220, backgroundColor: colors.inset },
  removePhoto: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  heroEmpty: { borderRadius: radius.md, padding: 20, overflow: 'hidden', minHeight: 220 },
  heroIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroText: { fontSize: 14, color: 'rgba(255,255,255,0.92)', marginTop: 6, lineHeight: 20, maxWidth: 300 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.pill },
  heroBtnGhost: { backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  heroBtnText: { fontWeight: '700', color: colors.primaryDark },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.textSoft },
  notes: { backgroundColor: '#fff', borderRadius: radius.sm, padding: 14, minHeight: 70, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' },
  quickRow: { flexDirection: 'row', gap: 10 },
  quick: { flex: 1, backgroundColor: '#fff', borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', gap: 8, ...shadow },
  quickText: { fontSize: 12, fontWeight: '600', color: colors.textSoft, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  overlayCard: { backgroundColor: '#fff', borderRadius: radius.lg, padding: 28, alignItems: 'center', width: 280 },
});
