import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { AnalysisSummary, imageUrl } from '../lib/api';
import { fmtDate } from '../lib/pickImage';
import { useStore } from '../lib/store';
import { colors, LANGUAGES, radius, shadow, statusMeta } from '../lib/theme';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export const Icon = MaterialCommunityIcons;

/* ---------------- header (Home / Analysis / Fertilizer screens) ---------------- */
export function ScreenHeader({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const [langOpen, setLangOpen] = useState(false);
  return (
    <View style={s.header}>
      {back && (
        <Pressable accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.circleBtn}>
          <Icon name="arrow-left" size={22} color={colors.primaryDark} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.headerTitle, back && { fontSize: 24 }]} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
        {subtitle ? <Text style={s.headerSub}>{subtitle}</Text> : null}
      </View>
      {right}
      <Pressable accessibilityLabel="Change language" onPress={() => setLangOpen(true)} style={s.circleBtn}>
        <Icon name="translate" size={20} color={colors.primaryDark} />
      </Pressable>
      <LanguageModal visible={langOpen} onClose={() => setLangOpen(false)} />
    </View>
  );
}

export function LanguageModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { lang, setLang } = useStore();
  return (
    <Sheet visible={visible} onClose={onClose} title="Advice language">
      <Text style={[s.muted, { marginBottom: 10 }]}>AI answers and analyses will be written in this language.</Text>
      {LANGUAGES.map((l) => (
        <Pressable key={l.code} style={s.sheetRow} onPress={() => { setLang(l.code); onClose(); }}>
          <Text style={[s.body, lang === l.code && { color: colors.primaryDark, fontWeight: '700' }]}>{l.name}</Text>
          {lang === l.code && <Icon name="check" size={20} color={colors.primaryDark} />}
        </Pressable>
      ))}
    </Sheet>
  );
}

/* ---------------- bottom sheet ---------------- */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>{title}</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close"><Icon name="close" size={22} color={colors.muted} /></Pressable>
        </View>
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

/* ---------------- building blocks ---------------- */
export const Card = ({ children, style, title, right }: { children?: ReactNode; style?: StyleProp<ViewStyle>; title?: string; right?: ReactNode }) => (
  <View style={[s.card, style]}>
    {title ? (
      <View style={[s.rowBetween, { marginBottom: 12 }]}>
        <Text style={s.cardTitle}>{title}</Text>
        {right}
      </View>
    ) : null}
    {children}
  </View>
);

export const Inset = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[s.inset, style]}>{children}</View>;

export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.segmentItem, active && s.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <Text style={[s.segmentText, active && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress, loading, style, variant = 'solid' }: { label: string; icon?: IconName; onPress: () => void; loading?: boolean; style?: StyleProp<ViewStyle>; variant?: 'solid' | 'outline' }) {
  const outline = variant === 'outline';
  return (
    <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [s.primaryBtn, outline && s.outlineBtn, pressed && { opacity: 0.85 }, style]}>
      {loading ? <ActivityIndicator color={outline ? colors.primary : '#fff'} /> : icon ? <Icon name={icon} size={20} color={outline ? colors.primaryDark : '#fff'} /> : null}
      <Text style={[s.primaryBtnText, outline && { color: colors.primaryDark }]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, icon, onPress, active }: { label: string; icon?: IconName; onPress?: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[s.pill, !active && active !== undefined && s.pillIdle]}>
      {icon && <Icon name={icon} size={16} color={active === false ? colors.textSoft : '#fff'} />}
      <Text style={[s.pillText, active === false && { color: colors.textSoft }]}>{label}</Text>
    </Pressable>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const m = statusMeta[status] ?? statusMeta.mild;
  return (
    <View style={[s.badge, { backgroundColor: m.bg }]}>
      <Icon name={m.icon as IconName} size={13} color={m.color} />
      <Text style={[s.badgeText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

export const Progress = ({ value, color = colors.primary, height = 8 }: { value: number; color?: string; height?: number }) => (
  <View style={[s.track, { height }]}>
    <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color, height, borderRadius: height }} />
  </View>
);

export const scoreColor = (n: number) => (n >= 80 ? colors.good : n >= 60 ? colors.warning : n >= 40 ? colors.serious : colors.critical);

export function NumberedStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <View style={s.step}>
      <View style={s.stepNum}><Text style={s.stepNumText}>{n}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepBody}>{children}</Text>
      </View>
    </View>
  );
}

export function Bullet({ children, icon = 'check-circle-outline' }: { children: ReactNode; icon?: IconName }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
      <Icon name={icon} size={18} color={colors.primary} style={{ marginTop: 1 }} />
      <Text style={[s.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

export type FabAction = { label: string; icon: IconName; onPress: () => void; danger?: boolean };
export function Fab({ actions, bottom = 96 }: { actions: FabAction[]; bottom?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityLabel="More actions" onPress={() => setOpen(true)} style={[s.fab, { bottom }]}>
        <Icon name="plus" size={28} color="#fff" />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Quick actions">
        {actions.map((a) => (
          <Pressable key={a.label} style={s.sheetRow} onPress={() => { setOpen(false); a.onPress(); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[s.iconBubble, a.danger && { backgroundColor: '#FFEBEE' }]}>
                <Icon name={a.icon} size={20} color={a.danger ? colors.danger : colors.primaryDark} />
              </View>
              <Text style={[s.body, a.danger && { color: colors.danger }]}>{a.label}</Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.faint} />
          </Pressable>
        ))}
      </Sheet>
    </>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <View style={[s.iconBubble, { width: 72, height: 72, borderRadius: 36 }]}><Icon name={icon} size={36} color={colors.primary} /></View>
      <Text style={[s.cardTitle, { marginTop: 8 }]}>{title}</Text>
      <Text style={[s.muted, { textAlign: 'center' }]}>{text}</Text>
      {action}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.error}>
      <Icon name="wifi-alert" size={20} color={colors.critical} />
      <Text style={[s.body, { flex: 1, color: '#8E2424' }]}>{message}</Text>
      {onRetry && <Pressable onPress={onRetry}><Text style={{ color: colors.primaryDark, fontWeight: '700' }}>Retry</Text></Pressable>}
    </View>
  );
}

export function AnalysisRow({ item, onFavorite }: { item: AnalysisSummary; onFavorite?: () => void }) {
  return (
    <Pressable onPress={() => router.push(`/analysis/${item.id}`)} style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}>
      <Image source={{ uri: imageUrl(item.image_url) }} style={s.thumb} contentFit="cover" transition={150} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.rowBetween}>
          <Text style={s.rowTitle} numberOfLines={1}>{item.crop}</Text>
          <Text style={[s.score, { color: scoreColor(item.health_score) }]}>{item.health_score}<Text style={s.scoreOf}>/100</Text></Text>
        </View>
        <Text style={s.muted} numberOfLines={1}>{item.top_issue?.split(' (')[0] || 'No problems detected'}</Text>
        <View style={s.rowBetween}>
          <StatusBadge status={item.health_status} />
          <Text style={s.small}>{fmtDate(item.created_at)}</Text>
        </View>
      </View>
      {onFavorite && (
        <Pressable hitSlop={10} onPress={onFavorite} accessibilityLabel={item.favorite ? 'Remove favourite' : 'Add favourite'}>
          <Icon name={item.favorite ? 'star' : 'star-outline'} size={22} color={item.favorite ? '#F9A825' : colors.faint} />
        </Pressable>
      )}
    </Pressable>
  );
}

/* ---------------- tiny markdown (bold, bullets, numbered, headings) ---------------- */
export function Markdown({ text, color = colors.text }: { text: string; color?: string }) {
  const inline = (t: string, key: string) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <Text key={`${key}-${i}`} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text>
      ) : (
        <Text key={`${key}-${i}`}>{part}</Text>
      ),
    );
  const lines = text.split('\n');
  return (
    <View style={{ gap: 4 }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={{ height: 4 }} />;
        const bullet = line.match(/^\s*[-*•]\s+(.*)/);
        const num = line.match(/^\s*(\d+)[.)]\s+(.*)/);
        const head = line.match(/^#{1,4}\s+(.*)/);
        if (head) return <Text key={i} style={[s.msgText, { color, fontWeight: '700' }]}>{inline(head[1], `${i}`)}</Text>;
        if (bullet || num)
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 6, paddingLeft: 2 }}>
              <Text style={[s.msgText, { color }]}>{bullet ? '•' : `${num![1]}.`}</Text>
              <Text style={[s.msgText, { color, flex: 1 }]}>{inline((bullet ? bullet[1] : num![2]) ?? '', `${i}`)}</Text>
            </View>
          );
        return <Text key={i} style={[s.msgText, { color }]}>{inline(line, `${i}`)}</Text>;
      })}
    </View>
  );
}

export const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 14 },
  headerTitle: { fontSize: 30, fontWeight: '800', color: colors.primary, letterSpacing: -0.3 },
  headerSub: { fontSize: 15, color: colors.muted, marginTop: 2 },
  circleBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 18, ...shadow },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  inset: { backgroundColor: colors.inset, borderRadius: radius.sm, padding: 14 },
  body: { fontSize: 15, color: colors.textSoft, lineHeight: 22 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  small: { fontSize: 12, color: colors.faint },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  segment: { flexDirection: 'row', backgroundColor: colors.segmentBg, borderRadius: radius.sm, padding: 4, ...shadow, elevation: 1 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontSize: 15, fontWeight: '600', color: colors.textSoft },
  primaryBtn: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: 15 },
  outlineBtn: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.primary },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 10, ...shadow },
  pillIdle: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, shadowOpacity: 0 },
  pillText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  track: { backgroundColor: colors.segmentBg, borderRadius: 8, overflow: 'hidden' },
  step: { flexDirection: 'row', gap: 14, marginTop: 16 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '700' },
  stepTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  stepBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  fab: { position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow, shadowOpacity: 0.2, elevation: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 12 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  iconBubble: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  error: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: radius.sm, padding: 12, marginHorizontal: 18, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: radius.md, padding: 10, ...shadow },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.inset },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  score: { fontSize: 16, fontWeight: '800' },
  scoreOf: { fontSize: 11, color: colors.faint, fontWeight: '500' },
  msgText: { fontSize: 15, lineHeight: 22 },
});
