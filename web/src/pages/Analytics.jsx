import { ShoppingBasket, Camera, HeartPulse, Leaf, LineChart, MessageCircleQuestion, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { api } from '../api.js'
import { useStore } from '../store.jsx'
import { Card, Empty, ErrorBox, fmtDate, PageHead, Spinner, STATUS } from '../ui.jsx'

export default function Analytics() {
  const { version } = useStore()
  const nav = useNavigate()
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)

  const load = useCallback(() => { setErr(''); api.stats().then(setS).catch((e) => setErr(e.message)) }, [])
  useEffect(() => { load() }, [load, version])

  const maxCrop = Math.max(1, ...(s?.by_crop.map((c) => c.count) ?? [1]))
  const picked = sel !== null ? s?.trend[sel] : null

  return (
    <>
      <PageHead title="Analytics" sub="Your farm health at a glance" />
      {err && <ErrorBox message={err} onRetry={load} />}
      {!s ? (!err && <Spinner />) : s.total === 0 ? (
        <Empty icon={LineChart} title="No data yet" text="Analyse a few plants and your farm's health trends will show up here.">
          <Link to="/" className="btn"><Camera size={17} /> Scan a plant</Link>
        </Empty>
      ) : (
        <div className="stack">
          <div className="tiles">
            <Tile Icon={Leaf} label="Total scans" value={s.total} />
            <Tile Icon={HeartPulse} label="Avg. health" value={s.avg_health} suffix="/100" />
            <Tile Icon={ShieldCheck} label="Healthy plants" value={s.healthy} suffix={` of ${s.total}`} />
            <Tile Icon={ShoppingBasket} label="Ready to harvest" value={s.ready_to_harvest} />
          </div>
          <div className="grid-2">
            <Card title="Health score trend" right={<small className="muted">last {s.trend.length} {s.trend.length === 1 ? 'scan' : 'scans'}</small>}>
              <p className="chart-tip">{picked ? <><b>{picked.score}/100</b> · {picked.crop} · {fmtDate(picked.date)}</> : <span className="muted">Hover or tap a bar to see the scan</span>}</p>
              <div className="trend">
                <div className="gridline" style={{ bottom: '100%' }}><span>100</span></div>
                <div className="gridline" style={{ bottom: '50%' }}><span>50</span></div>
                {s.trend.map((t, i) => (
                  <button type="button" key={i} className={`bar ${sel !== null && sel !== i ? 'dim' : ''}`} aria-label={`${t.crop}: ${t.score} of 100`}
                    onMouseEnter={() => setSel(i)} onMouseLeave={() => setSel(null)} onFocus={() => setSel(i)} onClick={() => setSel(i === sel ? null : i)}>
                    <i style={{ height: `${Math.max(3, t.score)}%` }} />
                  </button>
                ))}
              </div>
            </Card>
            <Card title="Plant health status">
              <div className="stackbar">{s.by_status.filter((b) => b.count).map((b) => <i key={b.status} className={STATUS[b.status].cls} style={{ flex: b.count }} title={`${STATUS[b.status].label}: ${b.count}`} />)}</div>
              <ul className="legend">
                {s.by_status.map((b) => { const m = STATUS[b.status]; return <li key={b.status}><m.Icon size={16} className={`c-${m.cls}`} />{m.label}<b>{b.count}</b></li> })}
              </ul>
            </Card>
            <Card title="Scans by crop">
              {s.by_crop.map((c) => (
                <div key={c.crop} className="hbar"><div className="between"><span>{c.crop}</span><b>{c.count}</b></div><div className="meter"><i style={{ width: `${(c.count / maxCrop) * 100}%` }} /></div></div>
              ))}
            </Card>
            <Card title="Most common problems">
              {s.top_issues.length ? s.top_issues.map((iss, i) => (
                <button type="button" key={iss.name} className="q-row" onClick={() => nav('/assistant', { state: { q: `How do I deal with ${iss.name.toLowerCase()}?` } })}>
                  <span className="rank">{i + 1}</span>{iss.name}<small className="muted">{iss.count}×</small><MessageCircleQuestion size={16} />
                </button>
              )) : <p className="muted">No problems detected so far. 🌱</p>}
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

const Tile = ({ Icon, label, value, suffix }) => (
  <div className="tile"><span className="icon-bubble"><Icon size={19} /></span><b>{value}<small>{suffix}</small></b><span className="muted">{label}</span></div>
)
