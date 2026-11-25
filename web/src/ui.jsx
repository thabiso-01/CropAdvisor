import { AlertCircle, AlertOctagon, AlertTriangle, CheckCircle2, Languages, Star, X } from 'lucide-react'
import { Fragment, useEffect } from 'react'
import { Link } from 'react-router'

import { imageUrl } from './api.js'
import { LANGUAGES, useStore } from './store.jsx'

export const STATUS = {
  healthy: { label: 'Healthy', cls: 'good', Icon: CheckCircle2 },
  mild: { label: 'Mild issue', cls: 'warn', Icon: AlertCircle },
  moderate: { label: 'Moderate', cls: 'serious', Icon: AlertTriangle },
  severe: { label: 'Severe', cls: 'critical', Icon: AlertOctagon },
}

export const CROPS = [
  ['', 'Auto-detect'], ['tomato', 'Tomato'], ['maize', 'Maize'], ['potato', 'Potato'], ['pepper', 'Pepper'],
  ['beans', 'Beans'], ['cabbage', 'Cabbage'], ['wheat', 'Wheat'], ['spinach', 'Spinach'],
]

export const scoreClass = (n) => (n >= 80 ? 'good' : n >= 60 ? 'warn' : n >= 40 ? 'serious' : 'critical')
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '')
export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
export const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function PageHead({ title, sub, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="page-actions">
        {children}
        <LanguagePicker />
      </div>
    </header>
  )
}

export function LanguagePicker() {
  const { lang, setLang } = useStore()
  return (
    <label className="lang" title="Language for AI answers">
      <Languages size={18} />
      <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Advice language">
        {LANGUAGES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
      </select>
    </label>
  )
}

export const Card = ({ title, right, children, className = '' }) => (
  <section className={`card ${className}`}>
    {title && <div className="card-head"><h2>{title}</h2>{right}</div>}
    {children}
  </section>
)

export function StatusBadge({ status }) {
  const m = STATUS[status] ?? STATUS.mild
  return <span className={`badge ${m.cls}`}><m.Icon size={13} />{m.label}</span>
}

export const Meter = ({ value, cls = '' }) => (
  <div className="meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <i className={cls} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </div>
)

export function ScoreRing({ score, size = 84 }) {
  const cls = scoreClass(score)
  return (
    <div className={`ring ${cls}`} style={{ '--p': score, width: size, height: size }} aria-label={`Health ${score} of 100`}>
      <span><b>{score}</b><small>/100</small></span>
    </div>
  )
}

export function Steps({ items }) {
  return (
    <ol className="steps">
      {items.map((s, i) => (
        <li key={i}><span>{i + 1}</span><div><strong>{s.title}</strong><small>{s.description}</small></div></li>
      ))}
    </ol>
  )
}

export function ScanCard({ item, onFav }) {
  return (
    <Link to={`/analysis/${item.id}`} className="scan-card">
      <img src={imageUrl(item.image_url)} alt="" loading="lazy" />
      <div className="scan-body">
        <div className="between">
          <strong>{item.crop}</strong>
          <b className={`score ${scoreClass(item.health_score)}`}>{item.health_score}<small>/100</small></b>
        </div>
        <p className="muted clamp">{item.top_issue?.split(' (')[0] || 'No problems detected'}</p>
        <div className="between">
          <StatusBadge status={item.health_status} />
          <small className="muted">{fmtDate(item.created_at)}</small>
        </div>
      </div>
      {onFav && (
        <button type="button" className={`star ${item.favorite ? 'on' : ''}`} aria-label={item.favorite ? 'Remove favourite' : 'Add favourite'}
          onClick={(e) => { e.preventDefault(); onFav(item) }}>
          <Star size={18} fill={item.favorite ? 'currentColor' : 'none'} />
        </button>
      )}
    </Link>
  )
}

export const Empty = ({ icon: Icon, title, text, children }) => (
  <div className="empty">
    <div className="empty-icon"><Icon size={34} /></div>
    <h3>{title}</h3>
    <p>{text}</p>
    {children}
  </div>
)

export const ErrorBox = ({ message, onRetry }) => (
  <div className="error" role="alert">
    <AlertTriangle size={18} /><span>{message}</span>
    {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
  </div>
)

export const Spinner = ({ label }) => <div className="spinner-wrap"><div className="spin" />{label && <p>{label}</p>}</div>

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><h2>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

/** Minimal markdown: headings, **bold**, bullets, numbered lists, paragraphs. */
export function Markdown({ text }) {
  const inline = (t) => t.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\b_[^_\s][^_]*_\b|_\([^_]+\)_)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.length > 2 && ((p[0] === '*' && p.at(-1) === '*') || (p[0] === '_' && p.at(-1) === '_'))) return <em key={i}>{p.slice(1, -1)}</em>
    return <Fragment key={i}>{p}</Fragment>
  })
  const out = []
  let list = null
  const flush = () => { if (list) { out.push(list.ordered ? <ol key={out.length}>{list.items}</ol> : <ul key={out.length}>{list.items}</ul>); list = null } }
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    const b = line.match(/^\s*[-*•]\s+(.*)/)
    const n = line.match(/^\s*\d+[.)]\s+(.*)/)
    const h = line.match(/^#{1,4}\s+(.*)/)
    if (b || n) {
      const ordered = !!n
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push(<li key={i}>{inline((b || n)[1])}</li>)
      return
    }
    flush()
    if (!line.trim()) return
    out.push(h ? <h4 key={i}>{inline(h[1])}</h4> : <p key={i}>{inline(line)}</p>)
  })
  flush()
  return <div className="md">{out}</div>
}
