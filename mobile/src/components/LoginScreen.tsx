import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, api } from '../lib/api';
import { useStore } from '../lib/store';
import { colors, radius } from '../lib/theme';
import { T } from '../i18n';
import { ErrorBanner, Icon, IconName, LanguageModal, PrimaryButton, s, Segmented } from './ui';

const MIN_PASSWORD = 8;

/** Sign in, or create an account, with a phone number or email address and a password. */
export function LoginScreen() {
  const { signIn, t } = useStore();
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const creating = mode === 'create';

  const switchMode = (m: 'signin' | 'create') => {
    setMode(m);
    setErr('');
    setPassword('');
    setConfirm('');
  };

  const submit = async () => {
    setErr('');
    if (!identifier.trim() || !password || (creating && !name.trim())) return;
    if (creating && password.length < MIN_PASSWORD) return setErr(t('auth.tooShort'));
    if (creating && password !== confirm) return setErr(t('auth.mismatch'));
    setBusy(true);
    try {
      signIn(creating ? await api.register(name.trim(), identifier.trim(), password) : await api.login(identifier.trim(), password));
    } catch (e) {
      setErr(authError(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
          <View style={st.top}>
            <Pressable accessibilityLabel={t('common.language')} onPress={() => setLangOpen(true)} style={s.circleBtn}>
              <Icon name="translate" size={20} color={colors.primaryDark} />
            </Pressable>
          </View>

          <View style={st.brand}>
            <View style={st.mark}><Icon name="sprout" size={26} color="#fff" /></View>
            <Text style={st.brandName}>{t('app.name')}</Text>
          </View>
          <Text style={st.title}>{creating ? t('auth.createTitle') : t('auth.welcome')}</Text>
          <Text style={[s.muted, { marginBottom: 20 }]}>{t('auth.tagline')}</Text>

          <Segmented
            options={[{ key: 'signin', label: t('auth.signIn') }, { key: 'create', label: t('auth.createAccount') }]}
            value={mode}
            onChange={switchMode}
          />

          <View style={{ marginTop: 18, gap: 14 }}>
            {creating && (
              <Field label={t('auth.name')} icon="account-outline">
                <TextInput style={st.input} value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={80} />
              </Field>
            )}
            <Field label={t('auth.identifier')} icon="phone-outline">
              <TextInput style={st.input} value={identifier} onChangeText={setIdentifier} placeholder={t('auth.identifierHint')}
                placeholderTextColor={colors.faint} autoCapitalize="none" autoCorrect={false} autoComplete="username"
                textContentType="username" keyboardType="email-address" maxLength={254} />
            </Field>
            <Field label={t('auth.password')} hint={creating ? t('auth.passwordHint') : undefined} icon="lock-outline">
              <TextInput style={st.input} value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none"
                autoComplete={creating ? 'new-password' : 'current-password'} textContentType={creating ? 'newPassword' : 'password'}
                maxLength={128} onSubmitEditing={creating ? undefined : submit} />
              <Pressable onPress={() => setShow((v) => !v)} accessibilityLabel={show ? t('auth.hidePassword') : t('auth.showPassword')} hitSlop={10}>
                <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.faint} />
              </Pressable>
            </Field>
            {creating && (
              <Field label={t('auth.confirmPassword')} icon="lock-check-outline">
                <TextInput style={st.input} value={confirm} onChangeText={setConfirm} secureTextEntry={!show} autoCapitalize="none"
                  autoComplete="new-password" textContentType="newPassword" maxLength={128} onSubmitEditing={submit} />
              </Field>
            )}
          </View>

          {err ? <View style={{ marginTop: 14 }}><ErrorBanner message={err} /></View> : null}

          <PrimaryButton label={busy ? t('auth.working') : creating ? t('auth.createAccount') : t('auth.signIn')} onPress={submit}
            loading={busy} style={{ marginTop: 20 }} />

          <View style={st.switchRow}>
            <Text style={s.body}>{creating ? t('auth.haveAccount') : t('auth.noAccount')} </Text>
            <Pressable onPress={() => switchMode(creating ? 'signin' : 'create')} accessibilityRole="button">
              <Text style={st.switchLink}>{creating ? t('auth.signIn') : t('auth.createAccount')}</Text>
            </Pressable>
          </View>
          <Text style={[s.small, { textAlign: 'center', marginTop: 6 }]}>{t('auth.privacy')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <LanguageModal visible={langOpen} onClose={() => setLangOpen(false)} />
    </SafeAreaView>
  );
}

function Field({ label, hint, icon, children }: { label: string; hint?: string; icon: IconName; children: React.ReactNode }) {
  return (
    <View>
      <Text style={st.label}>{label}{hint ? <Text style={s.small}> {hint}</Text> : null}</Text>
      <View style={st.inputRow}>
        <Icon name={icon} size={20} color={colors.faint} />
        {children}
      </View>
    </View>
  );
}

/** Translated messages for the errors the account endpoints return. */
function authError(t: T, e: unknown): string {
  const err = e as ApiError;
  if (err?.code === 'network') return t('error.network');
  if (err?.status === 401) return t('auth.wrong');
  if (err?.status === 409) return t('auth.exists');
  if (err?.status === 429) return t('error.tooMany');
  if (err?.status === 400 && /phone|email/i.test(err.message)) return t('auth.badIdentifier');
  if (err?.status === 422) return t('auth.tooShort');
  return err?.message ?? String(e);
}

const st = StyleSheet.create({
  page: { flexGrow: 1, padding: 22, paddingBottom: 40, maxWidth: 480, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'flex-end' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 22 },
  mark: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 18, fontWeight: '700', color: colors.text },
  title: { fontSize: 27, fontWeight: '800', color: colors.text, marginBottom: 6 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.sm, backgroundColor: '#fff',
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 16, color: colors.text },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, flexWrap: 'wrap' },
  switchLink: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
});
