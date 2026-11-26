// Screen-text translations, shared with the website. Don't edit locales/ here: edit
// web/src/i18n/locales/ and run `python scripts/sync_translations.py`.
// Any key a language lacks falls back to English, so the screen never shows a blank.
import af from './locales/af.json';
import en from './locales/en.json';
import nso from './locales/nso.json';
import st from './locales/st.json';
import tn from './locales/tn.json';
import xh from './locales/xh.json';
import zu from './locales/zu.json';

type Dict = Record<string, string>;
const DICTS: Record<string, Dict> = { en, af, zu, xh, nso, tn, st };

export type T = (key: string, vars?: Record<string, string | number>) => string;

export function translate(lang: string, key: string, vars?: Record<string, string | number>): string {
  let text = DICTS[lang]?.[key] ?? (en as Dict)[key] ?? key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return text;
}

/** A friendly, translated message for an error thrown by lib/api. */
export function errorText(t: T, e: unknown): string {
  const err = e as { code?: string; status?: number; message?: string };
  if (err?.code === 'network') return t('error.network');
  if (err?.status === 422 && /plant/i.test(err.message ?? '')) return t('error.notPlant');
  if (err?.status === 429) return t('error.tooMany');
  return err?.message ?? String(e);
}
