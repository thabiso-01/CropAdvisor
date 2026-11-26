import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { errorText, translate } from './index.js'

const dir = join(import.meta.dirname, 'locales')
const load = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))
const en = load('en.json')
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const others = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')

describe('translations', () => {
  it.each(others)('%s only uses keys that exist in English, with the same {placeholders}', (file) => {
    const dict = load(file)
    for (const [key, text] of Object.entries(dict)) {
      expect(en, `${file}: unknown key ${key}`).toHaveProperty([key])
      expect(placeholders(text), `${file}: ${key}`).toEqual(placeholders(en[key]))
      expect(text.trim(), `${file}: ${key} is empty`).not.toBe('')
    }
  })

  it('falls back to English for a missing key, and to the key itself as a last resort', () => {
    expect(translate('ve', 'nav.history')).toBe(en['nav.history'])
    expect(translate('zu', 'no.such.key')).toBe('no.such.key')
  })

  it('fills in {placeholders}', () => {
    expect(translate('en', 'analysis.found', { n: 3 })).toBe('3 found')
  })

  it('turns API errors into translated messages', () => {
    const t = (k) => translate('en', k)
    expect(errorText(t, Object.assign(new Error('x'), { code: 'network' }))).toBe(en['error.network'])
    expect(errorText(t, Object.assign(new Error("This photo doesn't show a plant"), { status: 422 }))).toBe(en['error.notPlant'])
    expect(errorText(t, Object.assign(new Error('slow down'), { status: 429 }))).toBe(en['error.tooMany'])
    expect(errorText(t, new Error('Something else'))).toBe('Something else')
  })
})
