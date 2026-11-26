import { ShoppingBasket, Camera, HeartPulse, Leaf, LineChart, MessageCircleQuestion, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { api } from '../api.js'
import { errorText } from '../i18n/index.js'
import { useStore } from '../store.jsx'
import { Card, Empty, ErrorBox, fmtDate, PageHead, Spinner, STATUS } from '../ui.jsx'

export default function Analytics() {
  const { version, t } = useStore()
  const nav = useNavigate()
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(null)

  const load = useCallback(() => { setErr(''); api.stats().then(setS).catch((e) => setErr(errorText(t, e))) }, [t])
  useEffect(() => { load() }, [load, version])

  const maxCrop = Math.max(1, ...(s?.by_crop.map((c) => c.count) ?? [1]))
  const picked = sel !== null ? s?.trend[sel] : null

  return (
    <>
      <PageHead title={t('nav.analytics')} sub={t('analytics.sub')} />
      {err && <ErrorBox message={err} onRetry={load} />}
      {!s ? (!err && <Spinner />) : s.total === 0 ? (
        <Empty icon={LineChart} title={t('analytics.noData')} text={t('analytics.noDataText')}>
          <Link to="/" className="btn"><Camera size={17} /> {t('common.scanAPlant')}</Link>
        </Empty>
      ) : (
        <div className="stack">
          <div className="tiles">
            <Tile Icon={Leaf} label={t('analytics.totalScans')} value={s.total} />
            <Tile Icon={HeartPulse} label={t('analytics.avgHealth')} value={s.avg_health} suffix="/100" />
            <Tile Icon={ShieldCheck} label={t('analytics.healthyPlants')} value={s.healthy} suffix={t('analytics.ofTotal', { n: s.total })} />
            <Tile Icon={ShoppingBasket} label={t('analytics.readyToHarvest')} value={s.ready_to_harvest} />
          </div>
          <div className="grid-2">
            <Card title={t('analytics.trend')} right={<small className="muted">{s.trend.length === 1 ? t('analytics.lastScan') : t('analytics.lastScans', { n: s.trend.length })}</small>}>
              <p className="chart-tip">{picked ? <><b>{picked.score}/100</b> · {picked.crop} · {fmtDate(picked.date)}</> : <span className="muted">{t('analytics.hoverTip')}</span>}</p>
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
            <Card title={t('analytics.statusTitle')}>
              <div className="stackbar">{s.by_status.filter((b) => b.count).map((b) => <i key={b.status} className={STATUS[b.status].cls} style={{ flex: b.count }} title={`${t(STATUS[b.status].label)}: ${b.count}`} />)}</div>
              <ul className="legend">
                {s.by_status.map((b) => { const m = STATUS[b.status]; return <li key={b.status}><m.Icon size={16} className={`c-${m.cls}`} />{t(m.label)}<b>{b.count}</b></li> })}
              </ul>
            </Card>
            <Card title={t('analytics.byCrop')}>
              {s.by_crop.map((c) => (
                <div key={c.crop} className="hbar"><div className="between"><span>{c.crop}</span><b>{c.count}</b></div><div className="meter"><i style={{ width: `${(c.count / maxCrop) * 100}%` }} /></div></div>
              ))}
            </Card>
            <Card title={t('analytics.commonProblems')}>
              {s.top_issues.length ? s.top_issues.map((iss, i) => (
                <button type="button" key={iss.name} className="q-row" onClick={() => nav('/assistant', { state: { q: t('analytics.dealWith', { problem: iss.name.toLowerCase() }) } })}>
                  <span className="rank">{i + 1}</span>{iss.name}<small className="muted">{iss.count}×</small><MessageCircleQuestion size={16} />
                </button>
              )) : <p className="muted">{t('analytics.noProblemsYet')} 🌱</p>}
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
