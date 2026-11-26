import { Camera, Clock3, Search, Star } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { api } from '../api.js'
import { errorText } from '../i18n/index.js'
import { useStore } from '../store.jsx'
import { Empty, ErrorBox, PageHead, ScanCard, Spinner } from '../ui.jsx'

const FILTERS = [['all', 'list.all'], ['healthy', 'list.healthy'], ['issues', 'list.needsAttention'], ['ready', 'list.readyToHarvest']]

export default function ScanList({ favorites }) {
  const { version, bump, t } = useStore()
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')

  const load = useCallback(() => {
    setErr('')
    api.list(favorites ? true : undefined).then(setItems).catch((e) => { setErr(errorText(t, e)); setItems([]) })
  }, [favorites, t])
  useEffect(() => { load() }, [load, version])

  const shown = useMemo(() => (items ?? []).filter((i) => {
    const s = q.trim().toLowerCase()
    if (s && !`${i.crop} ${i.top_issue ?? ''} ${i.summary}`.toLowerCase().includes(s)) return false
    if (filter === 'healthy') return i.health_status === 'healthy'
    if (filter === 'issues') return i.health_status !== 'healthy'
    if (filter === 'ready') return i.harvest_ready
    return true
  }), [items, q, filter])

  const toggle = async (item) => {
    setItems((xs) => (favorites ? xs.filter((x) => x.id !== item.id) : xs.map((x) => (x.id === item.id ? { ...x, favorite: !x.favorite } : x))))
    try { await api.setFavorite(item.id, !item.favorite) } finally { bump() }
  }

  return (
    <>
      <PageHead title={favorites ? t('list.favoritesTitle') : t('list.historyTitle')} sub={favorites ? t('list.favoritesSub') : t('list.historySub')} />
      {err && <ErrorBox message={err} onRetry={load} />}
      <div className="toolbar">
        <label className="search"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('list.searchPlaceholder')} aria-label={t('common.search')} /></label>
        {!favorites && (
          <div className="chips">{FILTERS.map(([k, l]) => <button type="button" key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{t(l)}</button>)}</div>
        )}
      </div>
      {items === null ? <Spinner /> : shown.length ? (
        <div className="scan-grid">{shown.map((i) => <ScanCard key={i.id} item={i} onFav={toggle} />)}</div>
      ) : (
        <Empty
          icon={favorites ? Star : Clock3}
          title={favorites ? t('list.noFavorites') : items.length ? t('list.nothingMatches') : t('list.noAnalyses')}
          text={favorites ? t('list.favoritesHint') : t('list.historyHint')}
        >
          {!items.length && <Link to="/" className="btn"><Camera size={17} /> {t('common.scanAPlant')}</Link>}
        </Empty>
      )}
    </>
  )
}
