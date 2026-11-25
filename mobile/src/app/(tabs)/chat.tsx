import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, IconName, Markdown, Pill, s, Sheet } from '../../components/ui';
import { api, Guide } from '../../lib/api';
import { fmtTime, pickImage } from '../../lib/pickImage';
import { UiMessage, useStore } from '../../lib/store';
import { colors, radius, shadow } from '../../lib/theme';

const EXAMPLES = [
  'Why are my tomato leaves turning yellow?',
  'How often should I water these plants?',
  'What can I do about these spots on my leaves?',
  'Are my tomatoes ready for harvesting?',
  'How can I improve my crop production?',
  'How do I treat tomato blight?',
];

export default function Chat() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { messages, setMessages, clearChat, lang, chatAnalysisId, setChatAnalysisId } = useStore();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<{ uri: string; base64: string } | null>(null);
  const [sheet, setSheet] = useState<'tools' | 'guides' | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [contextLabel, setContextLabel] = useState<string>();
  const list = useRef<FlatList<UiMessage>>(null);
  const handledQ = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!chatAnalysisId) return setContextLabel(undefined);
    api.get(chatAnalysisId).then((a) => setContextLabel(`${a.crop} scan · ${a.health_score}/100`)).catch(() => setContextLabel(undefined));
  }, [chatAnalysisId]);

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim() || (attachment ? 'Please look at this photo of my plant. What do you see and what should I do?' : '');
      if (!content || sending) return;
      const userMsg: UiMessage = { id: `u${Date.now()}`, role: 'user', content, at: Date.now(), image: attachment?.uri };
      const history = [...messages.filter((m) => m.id !== 'welcome'), userMsg].map(({ role, content }) => ({ role, content }));
      setMessages((m) => [...m, userMsg]);
      setText('');
      const img = attachment?.base64;
      setAttachment(null);
      setSending(true);
      try {
        const r = await api.chat({ messages: history, analysis_id: chatAnalysisId, image_base64: img, lang });
        setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', content: r.reply, at: Date.now(), sources: r.sources }]);
      } catch (e) {
        setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', content: `⚠️ ${(e as Error).message}`, at: Date.now() }]);
      } finally {
        setSending(false);
      }
    },
    [attachment, sending, messages, setMessages, chatAnalysisId, lang],
  );

  // questions handed over from other screens (analysis follow-ups, fertilizer advisor)
  useEffect(() => {
    if (q && handledQ.current !== q) {
      handledQ.current = q;
      send(q);
      router.setParams({ q: undefined });
    }
  }, [q, send]);

  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length, sending]);

  const attach = async (src: 'camera' | 'library') => {
    const p = await pickImage(src, true);
    if (!p) return;
    const b64 = p.base64 ?? (p.uri.startsWith('data:') ? p.uri : null);
    if (!b64) return Alert.alert('Could not read the image');
    setAttachment({ uri: p.uri, base64: b64 });
  };

  const openGuides = () => {
    setSheet('guides');
    if (!guides.length) api.guides().then(setGuides).catch(() => {});
  };

  const share = () =>
    Share.share({ message: messages.map((m) => `${m.role === 'user' ? 'Me' : 'Crop Advisor AI'}: ${m.content}`).join('\n\n') });

  const clear = () => {
    const go = () => { clearChat(); setChatAnalysisId(undefined); };
    if (Platform.OS === 'web') return go();
    Alert.alert('Clear conversation?', 'This deletes all messages in this chat.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: go }]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <SafeAreaView edges={['top']}>
          <View style={st.header}>
            <Pressable style={st.hBtn} onPress={() => router.navigate('/')} accessibilityLabel="Back"><Icon name="arrow-left" size={22} color="#fff" /></Pressable>
            <Text style={st.hTitle} numberOfLines={1}>Crop Advisor AI Assistant</Text>
            <Pressable style={st.hBtn} onPress={share} accessibilityLabel="Share conversation"><Icon name="share-variant" size={18} color="#fff" /></Pressable>
            <Pressable style={st.hBtn} onPress={clear} accessibilityLabel="Clear conversation"><Icon name="trash-can-outline" size={20} color="#fff" /></Pressable>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <View style={st.pills}>
        <Pill label="Tools" icon="toolbox" onPress={() => setSheet('tools')} />
        <Pill label="Guides" icon="book-open-page-variant" onPress={openGuides} />
        <Pill label="Scan" icon="camera" onPress={() => attach('camera')} />
      </View>

      {contextLabel && (
        <View style={st.context}>
          <Icon name="leaf" size={16} color={colors.primaryDark} />
          <Text style={[s.small, { color: colors.primaryDeep, flex: 1 }]}>Discussing: {contextLabel}</Text>
          <Pressable onPress={() => setChatAnalysisId(undefined)} hitSlop={8}><Icon name="close" size={16} color={colors.primaryDeep} /></Pressable>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          renderItem={({ item }) => <Bubble m={item} />}
          ListFooterComponent={
            <>
              {sending && (
                <View style={[st.row, { justifyContent: 'flex-start' }]}>
                  <Avatar bot />
                  <View style={[st.bubble, st.botBubble, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={s.muted}>Thinking…</Text>
                  </View>
                </View>
              )}
              {messages.length <= 1 && !sending && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text style={[s.small, { marginLeft: 4 }]}>Try asking</Text>
                  {EXAMPLES.slice(0, 5).map((e) => (
                    <Pressable key={e} style={st.suggest} onPress={() => send(e)}>
                      <Text style={{ color: colors.primaryDeep, fontWeight: '600' }}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          }
        />

        {attachment && (
          <View style={st.attachPreview}>
            <Image source={{ uri: attachment.uri }} style={{ width: 52, height: 52, borderRadius: 8 }} />
            <Text style={[s.muted, { flex: 1 }]}>Photo attached — ask a question or just send.</Text>
            <Pressable onPress={() => setAttachment(null)} hitSlop={8}><Icon name="close-circle" size={22} color={colors.faint} /></Pressable>
          </View>
        )}

        <View style={st.inputBar}>
          <Pressable onPress={() => attach('library')} hitSlop={8} accessibilityLabel="Attach photo">
            <Icon name="paperclip" size={22} color={colors.primary} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask about crop care..."
            placeholderTextColor={colors.faint}
            style={st.input}
            multiline
            onSubmitEditing={() => send(text)}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => send(text)}
            disabled={sending || (!text.trim() && !attachment)}
            style={[st.send, (text.trim() || attachment) && !sending ? { backgroundColor: colors.primary } : null]}
            accessibilityLabel="Send"
          >
            <Icon name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={sheet === 'tools'} onClose={() => setSheet(null)} title="Tools">
        <ToolRow icon="camera-iris" label="New plant analysis" onPress={() => { setSheet(null); router.navigate('/'); }} />
        <ToolRow icon="sprout" label="Fertilizer advisor" onPress={() => { setSheet(null); router.push(chatAnalysisId ? { pathname: '/fertilizer', params: { analysisId: chatAnalysisId } } : '/fertilizer'); }} />
        <ToolRow icon="image-plus" label="Attach a photo from gallery" onPress={() => { setSheet(null); attach('library'); }} />
        <Text style={[s.small, { marginTop: 16, marginBottom: 4 }]}>QUICK QUESTIONS</Text>
        {EXAMPLES.map((e) => <ToolRow key={e} icon="chat-question-outline" label={e} onPress={() => { setSheet(null); send(e); }} />)}
      </Sheet>

      <Sheet visible={sheet === 'guides'} onClose={() => setSheet(null)} title="Crop Guides">
        {!guides.length && <ActivityIndicator color={colors.primary} />}
        {guides.map((g) => (
          <ToolRow key={g.id} icon="book-open-variant" label={g.title} sub={`${g.category} · ${g.crop === 'general' ? 'All crops' : g.crop}`} onPress={() => { setSheet(null); router.push(`/guide/${g.id}`); }} />
        ))}
      </Sheet>
    </View>
  );
}

function ToolRow({ icon, label, sub, onPress }: { icon: IconName; label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable style={s.sheetRow} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        <View style={s.iconBubble}><Icon name={icon} size={18} color={colors.primaryDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.body}>{label}</Text>
          {sub ? <Text style={s.small}>{sub}</Text> : null}
        </View>
      </View>
      <Icon name="chevron-right" size={20} color={colors.faint} />
    </Pressable>
  );
}

const Avatar = ({ bot }: { bot?: boolean }) => (
  <View style={[st.avatar, bot ? { backgroundColor: colors.primaryLight } : { backgroundColor: colors.primary }]}>
    <Icon name={bot ? 'tractor-variant' : 'account'} size={bot ? 18 : 20} color={bot ? colors.primaryDark : '#fff'} />
  </View>
);

function Bubble({ m }: { m: UiMessage }) {
  const me = m.role === 'user';
  return (
    <View style={[st.row, { justifyContent: me ? 'flex-end' : 'flex-start' }]}>
      {!me && <Avatar bot />}
      <View style={[st.bubble, me ? st.meBubble : st.botBubble]}>
        {m.image && <Image source={{ uri: m.image }} style={st.msgImg} contentFit="cover" />}
        {me ? <Text style={[s.msgText, { color: '#fff' }]}>{m.content}</Text> : <Markdown text={m.content} />}
        {!me && !!m.sources?.length && (
          <View style={st.sources}>
            {m.sources.slice(0, 3).map((src) => (
              <Pressable key={src.id} onPress={() => router.push(`/guide/${src.id}`)} style={st.sourceChip}>
                <Icon name="book-open-variant" size={12} color={colors.primaryDark} />
                <Text style={st.sourceText} numberOfLines={1}>{src.title}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={[st.time, me && { color: 'rgba(255,255,255,0.8)' }]}>{fmtTime(m.at)}</Text>
      </View>
      {me && <Avatar />}
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  hBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  hTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  pills: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 10 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 4, backgroundColor: colors.primaryLight, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '78%', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  botBubble: { backgroundColor: '#EEF0F1', borderBottomLeftRadius: 4 },
  meBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  msgImg: { width: 200, height: 150, borderRadius: 10, marginBottom: 8 },
  time: { fontSize: 11, color: colors.faint, alignSelf: 'flex-end', marginTop: 4 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  sourceChip: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 200 },
  sourceText: { fontSize: 11, color: colors.primaryDeep, fontWeight: '600' },
  suggest: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#C8E6C9', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  attachPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 6, backgroundColor: '#fff', borderRadius: radius.md, padding: 8, ...shadow },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 10, backgroundColor: '#fff', borderRadius: radius.lg, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, ...shadow },
  input: { flex: 1, fontSize: 15, color: colors.text, maxHeight: 110, paddingVertical: 8 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#B0B6BB', alignItems: 'center', justifyContent: 'center' },
});
