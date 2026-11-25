import { Camera, Clock3, Search, Star } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { api } from '../api.js'
import { useStore } from '../store.jsx'
import { Empty, ErrorBox, PageHead, ScanCard, Spinner } from '../ui.jsx'

const FILTERS = [['all', 'All'], ['healthy', 'Healthy'], ['issues', 'Needs attention'], ['ready', 'Ready to harvest']]

export default function ScanList({ favorites }) {
  const { version, bump } = useStore()
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')

  const load = useCallback(() => {
    setErr('')
    api.list(favorites ? true : undefined).then(setItems).catch((e) => { setErr(e.message); setItems([]) })
  }, [favorites])
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
      <PageHead title={favorites ? 'Favorites' : 'History'} sub={favorites ? "Plants you're keeping an eye on" : 'All your plant analyses'} />
      {err && <ErrorBox message={err} onRetry={load} />}
      <div className="toolbar">
        <label className="search"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search crop or problem" aria-label="Search" /></label>
        {!favorites && (
          <div className="chips">{FILTERS.map(([k, l]) => <button type="button" key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}</div>
        )}
      </div>
      {items === null ? <Spinner /> : shown.length ? (
        <div className="scan-grid">{shown.map((i) => <ScanCard key={i.id} item={i} onFav={toggle} />)}</div>
      ) : (
        <Empty
          icon={favorites ? Star : Clock3}
          title={favorites ? 'No favorites yet' : items.length ? 'Nothing matches' : 'No analyses yet'}
          text={favorites ? 'Tap the star on any analysis to keep it here.' : 'Scan a plant to get your first health report.'}
        >
          {!items.length && <Link to="/" className="btn"><Camera size={17} /> Scan a plant</Link>}
        </Empty>
      )}
    </>
  )
}
