import { ArrowLeft, Bot, BookOpen, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { api } from '../api.js'
import { errorText } from '../i18n/index.js'
import { useT } from '../store.jsx'
import { Card, ErrorBox, Markdown, PageHead, Spinner } from '../ui.jsx'

export function Guides() {
  const t = useT()
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => { api.guides().then(setItems).catch((e) => setErr(errorText(t, e))) }, [t])
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = {}
    for (const g of items ?? []) {
      if (s && !`${g.title} ${g.crop} ${g.category}`.toLowerCase().includes(s)) continue
      ;(out[g.category] ??= []).push(g)
    }
    return out
  }, [items, q])

  return (
    <>
      <PageHead title={t('nav.guides')} sub={t('guides.sub')} />
      {err && <ErrorBox message={err} />}
      <div className="toolbar"><label className="search"><BookOpen size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('guides.search')} aria-label={t('guides.search')} /></label></div>
      {!items ? (!err && <Spinner />) : (
        <div className="guide-grid">
          {Object.entries(groups).map(([cat, gs]) => (
            <Card key={cat} title={cat}>
              {gs.map((g) => (
                <Link key={g.id} to={`/guides/${g.id}`} className="q-row">
                  <span className="grow">{g.title}<small className="muted block">{g.crop === 'general' ? t('common.allCrops') : g.crop}</small></span><ChevronRight size={16} />
                </Link>
              ))}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

export function GuideDetail() {
  const t = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const [g, setG] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { setG(null); api.guide(id).then(setG).catch((e) => setErr(errorText(t, e))) }, [id, t])
  return (
    <>
      <PageHead title={t('guides.guide')} sub={g ? `${g.category} · ${g.crop === 'general' ? t('common.allCrops') : g.crop}` : ''}>
        <button type="button" className="icon-btn" onClick={() => nav(-1)} aria-label={t('common.back')}><ArrowLeft size={18} /></button>
      </PageHead>
      {err && <ErrorBox message={err} />}
      {!g ? (!err && <Spinner />) : (
        <div className="reading stack">
          <Card><h2 className="guide-title">{g.title}</h2><Markdown text={g.content} /></Card>
          <button type="button" className="btn" onClick={() => nav('/assistant', { state: { q: t('guides.tellMore', { title: g.title }) } })}>
            <Bot size={17} /> {t('guides.askAbout')}
          </button>
        </div>
      )}
    </>
  )
}
