// Screen-text translations. English (en.json) is the source; every other language may be partial,
// and any key it lacks falls back to English, so the screen never shows a blank or a raw key.
// The AI's own answers are translated by the AI itself (backend/app/ai.py LANGUAGES).
import af from './locales/af.json'
import en from './locales/en.json'
import nso from './locales/nso.json'
import st from './locales/st.json'
import tn from './locales/tn.json'
import xh from './locales/xh.json'
import zu from './locales/zu.json'

const DICTS = { en, af, zu, xh, nso, tn, st }

/** Languages that have translated screen text (the rest show English screens, with AI answers in their language). */
export const TRANSLATED = Object.keys(DICTS)

export function translate(lang, key, vars) {
  let text = DICTS[lang]?.[key] ?? en[key] ?? key
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
  return text
}

/** A friendly, translated message for an error thrown by api.js. */
export function errorText(t, e) {
  if (e?.code === 'network') return t('error.network')
  if (e?.status === 422 && /plant/i.test(e.message)) return t('error.notPlant')
  if (e?.status === 429) return t('error.tooMany')
  return e?.message ?? String(e)
}

export const english = en
