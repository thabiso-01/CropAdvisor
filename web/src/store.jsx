import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api, setDeviceId, setOnSignedOut, setToken } from './api.js'
import { translate } from './i18n/index.js'

// South Africa's 11 official spoken languages, each named in its own language.
export const LANGUAGES = [
  ['en', 'English'], ['af', 'Afrikaans'], ['zu', 'isiZulu'], ['xh', 'isiXhosa'], ['nr', 'isiNdebele'],
  ['nso', 'Sepedi'], ['st', 'Sesotho'], ['tn', 'Setswana'], ['ss', 'siSwati'], ['ve', 'Tshivenḓa'], ['ts', 'Xitsonga'],
]
const LANG_CODES = new Set(LANGUAGES.map(([c]) => c))

// The welcome message is shown in the chosen language when rendered (key chat.welcome).
export const WELCOME = { id: 'welcome', role: 'assistant', at: Date.now(), content: '' }

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

// Signed-in account, restored on reload. The token is checked with /api/auth/me on start.
function initAuth() {
  const token = read('ca.token', null)
  setToken(token)
  return { token, user: token ? read('ca.user', null) : null }
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [deviceId] = useState(initDevice)
  const [auth, setAuth] = useState(initAuth)
  const user = auth.user
  // a language saved before the list changed (e.g. Hindi) falls back to English
  const [lang, setLangState] = useState(() => { const l = read('ca.lang', 'en'); return LANG_CODES.has(l) ? l : 'en' })
  const [messages, setMessagesState] = useState(() => read('ca.chat', [WELCOME]))
  const [chatScanId, setChatScanId] = useState(null)
  const [version, setVersion] = useState(0)
  const [favCount, setFavCount] = useState(0)
  const [health, setHealth] = useState(null)

  const refreshHealth = useCallback(() => api.health().then(setHealth).catch(() => setHealth({ status: 'down' })), [])

  useEffect(() => {
    refreshHealth()
    const timer = setInterval(refreshHealth, 30000)
    return () => clearInterval(timer)
  }, [refreshHealth])

  const signIn = useCallback(({ token, user: u }) => {
    setToken(token); write('ca.token', token); write('ca.user', u)
    setAuth({ token, user: u })
    setVersion((v) => v + 1)
  }, [])
  const signOut = useCallback((callServer = true) => {
    if (callServer) api.logout().catch(() => {})
    setToken(null); write('ca.token', null); write('ca.user', null)
    setAuth({ token: null, user: null })
    setMessagesState([WELCOME]); write('ca.chat', [WELCOME]) // don't show one farmer's chat to the next
    setChatScanId(null)
  }, [])

  useEffect(() => {
    setOnSignedOut(() => signOut(false))
    if (auth.token) api.me().then((u) => { write('ca.user', u); setAuth((a) => ({ ...a, user: u })) }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (user) api.list(true).then((r) => setFavCount(r.length)).catch(() => {}) }, [version, user])
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang])

  const setMessages = useCallback((fn) => {
    setMessagesState((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn
      write('ca.chat', next.slice(-80).map(({ image: _img, ...m }) => m)) // don't persist image data
      return next
    })
  }, [])

  const value = useMemo(() => ({
    deviceId, user, signIn, signOut, lang, t, health, refreshHealth, favCount, version, messages, setMessages, chatScanId, setChatScanId,
    setLang: (l) => { setLangState(l); write('ca.lang', l) },
    bump: () => setVersion((v) => v + 1),
    clearChat: () => setMessages([{ ...WELCOME, at: Date.now() }]),
  }), [deviceId, user, signIn, signOut, lang, t, health, refreshHealth, favCount, version, messages, setMessages, chatScanId])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react/only-export-components
export const useStore = () => useContext(Ctx)

/** Translate screen text into the chosen language: const t = useT(); t('nav.history') */
// eslint-disable-next-line react/only-export-components
export const useT = () => useContext(Ctx).t
