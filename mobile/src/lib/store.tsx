import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, ChatMsg, setDeviceId } from './api';

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

  useEffect(() => {
    (async () => {
      try {
        let id = await AsyncStorage.getItem('deviceId');
        if (!id) {
          id = `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
          await AsyncStorage.setItem('deviceId', id);
        }
        setDeviceId(id);
        const [l, chat] = await Promise.all([AsyncStorage.getItem('lang'), AsyncStorage.getItem('chat')]);
        if (l) setLangState(l);
        if (chat) setMessagesState(JSON.parse(chat));
      } catch {}
      setReady(true);
    })();
  }, []);

  const refreshFavorites = useCallback(() => {
    api.list(true).then((r) => setFavoritesCount(r.length)).catch(() => {});
  }, []);

  useEffect(() => {
    if (ready) refreshFavorites();
  }, [ready, version, refreshFavorites]);

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
    [ready, lang, favoritesCount, refreshFavorites, messages, setMessages, chatAnalysisId, version],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
