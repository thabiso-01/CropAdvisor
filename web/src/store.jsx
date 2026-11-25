import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api, setDeviceId } from './api.js'

export const LANGUAGES = [
  ['en', 'English'], ['af', 'Afrikaans'], ['zu', 'isiZulu'], ['xh', 'isiXhosa'], ['st', 'Sesotho'],
  ['sw', 'Kiswahili'], ['hi', 'हिन्दी (Hindi)'], ['fr', 'Français'], ['pt', 'Português'], ['es', 'Español'],
]

export const WELCOME = {
  id: 'welcome', role: 'assistant', at: Date.now(),
  content: "Hello! I'm your Crop Advisor AI Assistant. I can help with plant disease identification, nutrient management, watering advice, and crop care recommendations. How can I assist you today?",
}

const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback } catch { return fallback } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode / full */ } }

function initDevice() {
  let id = read('ca.device', null)
  if (!id) {
    id = `web-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
    write('ca.device', id)
  }
  setDeviceId(id)
  return id
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [deviceId] = useState(initDevice)
  const [lang, setLangState] = useState(() => read('ca.lang', 'en'))
  const [messages, setMessagesState] = useState(() => read('ca.chat', [WELCOME]))
  const [chatScanId, setChatScanId] = useState(null)
  const [version, setVersion] = useState(0)
  const [favCount, setFavCount] = useState(0)
  const [health, setHealth] = useState(null)

  const refreshHealth = useCallback(() => api.health().then(setHealth).catch(() => setHealth({ status: 'down' })), [])

  useEffect(() => {
    refreshHealth()
    // poll faster while the model is downloading
    const t = setInterval(refreshHealth, health?.model_status === 'downloading' ? 5000 : 30000)
    return () => clearInterval(t)
  }, [refreshHealth, health?.model_status])

  useEffect(() => { api.list(true).then((r) => setFavCount(r.length)).catch(() => {}) }, [version])

  const setMessages = useCallback((fn) => {
    setMessagesState((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn
      write('ca.chat', next.slice(-80).map(({ image: _img, ...m }) => m)) // don't persist image data
      return next
    })
  }, [])

  const value = useMemo(() => ({
    deviceId, lang, health, refreshHealth, favCount, version, messages, setMessages, chatScanId, setChatScanId,
    setLang: (l) => { setLangState(l); write('ca.lang', l) },
    bump: () => setVersion((v) => v + 1),
    clearChat: () => setMessages([{ ...WELCOME, at: Date.now() }]),
  }), [deviceId, lang, health, refreshHealth, favCount, version, messages, setMessages, chatScanId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react/only-export-components
export const useStore = () => useContext(Ctx)
