import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { translate, T } from '../i18n';
import { api, AuthResult, ChatMsg, setDeviceId, setOnSignedOut, setToken, User } from './api';
import { LANGUAGES } from './theme';

export type UiMessage = ChatMsg & { id: string; at: number; image?: string; sources?: { id: string; title: string }[] };

export const WELCOME: UiMessage = {
  id: 'welcome',
  role: 'assistant',
  at: Date.now(),
  content:
    "Hello! I'm your Crop Advisor AI Assistant. I can help with plant disease identification, nutrient management, watering advice, and crop care recommendations. How can I assist you today?",
};

type Store = {
  ready: boolean;
  /** the signed-in farmer, or null: the app shows the sign-in screen until someone signs in */
  user: User | null;
  signIn: (r: AuthResult) => void;
  signOut: () => void;
  /** screen text in the chosen language */
  t: T;
  lang: string;
  setLang: (l: string) => void;
  favoritesCount: number;
  refreshFavorites: () => void;
  messages: UiMessage[];
  setMessages: (fn: (m: UiMessage[]) => UiMessage[]) => void;
  clearChat: () => void;
  chatAnalysisId?: string;
  setChatAnalysisId: (id?: string) => void;
  /** bump to tell list screens to reload */
  version: number;
  bump: () => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState('en');
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [messages, setMessagesState] = useState<UiMessage[]>([WELCOME]);
  const [chatAnalysisId, setChatAnalysisId] = useState<string>();
  const [version, setVersion] = useState(0);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      // The server only shows a device its own scans, so the id must be random and never 'anonymous'.
      const newId = () =>
        `dev-${globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`}`;
      setDeviceId(newId()); // used for this session if phone storage is unavailable
      try {
        let id = await AsyncStorage.getItem('deviceId');
        if (!id) {
          id = newId();
          await AsyncStorage.setItem('deviceId', id);
        }
        setDeviceId(id);
        const [l, chat, saved] = await Promise.all([AsyncStorage.getItem('lang'), AsyncStorage.getItem('chat'), AsyncStorage.getItem('auth')]);
        if (saved) {
          const auth = JSON.parse(saved) as AuthResult;
          setToken(auth.token);
          setUser(auth.user);
          api.me().then(setUser).catch(() => {}); // a 401 here signs out via setOnSignedOut
        }
        if (l && LANGUAGES.some((x) => x.code === l)) setLangState(l); // older saved languages fall back to English
        if (chat) setMessagesState(JSON.parse(chat));
      } catch {}
      setReady(true);
    })();
  }, []);

  const signOut = useCallback((callServer = true) => {
    if (callServer) api.logout().catch(() => {});
    setToken(null);
    setUser(null);
    setMessagesState([WELCOME]); // don't show one farmer's chat to the next
    setChatAnalysisId(undefined);
    AsyncStorage.multiRemove(['auth', 'chat']).catch(() => {});
  }, []);

  const signIn = useCallback((r: AuthResult) => {
    setToken(r.token);
    setUser(r.user);
    AsyncStorage.setItem('auth', JSON.stringify(r)).catch(() => {});
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    setOnSignedOut(() => signOut(false));
  }, [signOut]);

  const t = useCallback<T>((key, vars) => translate(lang, key, vars), [lang]);

  const refreshFavorites = useCallback(() => {
    api.list(true).then((r) => setFavoritesCount(r.length)).catch(() => {});
  }, []);

  useEffect(() => {
    if (ready && user) refreshFavorites();
  }, [ready, user, version, refreshFavorites]);

  const setMessages = useCallback((fn: (m: UiMessage[]) => UiMessage[]) => {
    setMessagesState((prev) => {
      const next = fn(prev);
      AsyncStorage.setItem('chat', JSON.stringify(next.slice(-80).map(({ image, ...m }) => m))).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready,
      user,
      signIn,
      signOut: () => signOut(true),
      t,
      lang,
      setLang: (l) => {
        setLangState(l);
        AsyncStorage.setItem('lang', l).catch(() => {});
      },
      favoritesCount,
      refreshFavorites,
      messages,
      setMessages,
      clearChat: () => setMessages(() => [{ ...WELCOME, at: Date.now() }]),
      chatAnalysisId,
      setChatAnalysisId,
      version,
      bump: () => setVersion((v) => v + 1),
    }),
    [ready, user, signIn, signOut, t, lang, favoritesCount, refreshFavorites, messages, setMessages, chatAnalysisId, version],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
