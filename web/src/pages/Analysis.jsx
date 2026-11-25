import { Bot, Camera, Droplets, FlaskConical, MessageCircleQuestion, Printer, ShieldCheck, Star, Trash2, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { api, imageUrl } from '../api.js'
import { useStore } from '../store.jsx'
import { cap, Card, ErrorBox, fmtDate, Meter, PageHead, ScoreRing, scoreClass, Spinner, StatusBadge, Steps } from '../ui.jsx'

const TABS = ['Overview', 'Treatment', 'Fertilizer', 'Harvest', 'Details']
const SEV = { low: 'warn', medium: 'serious', high: 'critical' }

const engineLabel = (p) => {
  if (!p) return ''
  if (p.startsWith('ollama:')) return `${p.slice(7)} (open-source, Ollama)`
  if (p.startsWith('claude:')) return 'Claude'
  return 'Offline knowledge base'
}

export default function Analysis() {
  const { id } = useParams()
  const nav = useNavigate()
  const { bump, setChatScanId } = useStore()
  const [a, setA] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('Overview')

  const load = useCallback(() => { setErr(''); api.get(id).then(setA).catch((e) => setErr(e.message)) }, [id])
  useEffect(() => { setA(null); setTab('Overview'); load() }, [load])

  if (err) return <><PageHead title="Crop Advisor AI" sub="Digital Kisan Advisor" /><ErrorBox message={err} onRetry={load} /></>
  if (!a) return <Spinner label="Loading analysis…" />

  const r = a.result
  const ask = (q) => { setChatScanId(a.id); nav('/assistant', { state: q ? { q } : null }) }
  const fav = async () => { const u = await api.setFavorite(a.id, !a.favorite); setA({ ...a, favorite: u.favorite }); bump() }
  const del = async () => {
    if (!window.confirm('Delete this analysis and its photo?')) return
    await api.remove(a.id); bump(); nav('/history')
  }

  return (
    <>
      <PageHead title="Crop Advisor AI" sub={`${r.crop} · ${fmtDate(a.created_at)}`}>
        <button type="button" className={`icon-btn ${a.favorite ? 'fav' : ''}`} onClick={fav} aria-label={a.favorite ? 'Remove favourite' : 'Add favourite'} title="Favourite">
          <Star size={18} fill={a.favorite ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="icon-btn hide-mobile" onClick={() => window.print()} aria-label="Print report" title="Print / save as PDF"><Printer size={18} /></button>
        <button type="button" className="icon-btn" onClick={del} aria-label="Delete analysis" title="Delete"><Trash2 size={18} /></button>
      </PageHead>

      <div className="analysis">
        <aside className="analysis-side stack">
          <div className="photo"><img src={imageUrl(a.image_url)} alt={`${r.crop} plant`} /><span className="photo-tag">{r.crop}</span></div>
          <Card>
            <div className="health">
              <ScoreRing score={r.health_score} />
              <div><small className="muted">Plant health</small><h2>{r.crop}</h2><StatusBadge status={r.health_status} /></div>
            </div>
            <div className="mini-stats">
              <div><small>Growth stage</small><b>{cap(r.growth_stage)}</b></div>
              <div><small>Harvest</small><b>{r.harvest.ready ? 'Ready' : `${r.harvest.readiness_percent}%`}</b></div>
              <div><small>Market grade</small><b>{r.market.quality_grade}</b></div>
            </div>
          </Card>
          <div className="side-actions no-print">
            <button type="button" className="btn" onClick={() => ask()}><Bot size={17} /> Ask AI about this plant</button>
            <Link to={`/fertilizer?analysis=${a.id}`} className="btn ghost"><FlaskConical size={17} /> Fertilizer plan</Link>
          </div>
        </aside>

        <div className="analysis-main stack">
          <div className="tabs no-print" role="tablist">
            {TABS.map((t) => <button type="button" role="tab" key={t} aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
          </div>

          {(tab === 'Overview') && <>
            <Card title="Summary"><p>{r.summary}</p></Card>
            <Card title="Problems found" right={<small className="muted">{r.issues.length} found</small>}>
              {r.issues.length === 0 ? (
                <div className="inset ok"><ShieldCheck size={20} /> No diseases, pests or deficiencies detected. Keep up the good work!</div>
              ) : r.issues.map((i, k) => (
                <div className="issue" key={k}>
                  <div className="between"><strong>{i.name}</strong><span className={`sev ${SEV[i.severity]}`}>{i.severity}</span></div>
                  <p className="muted">{i.description}</p>
                  {i.evidence && <small className="muted">Seen in photo: {i.evidence}</small>}
                  <div className="conf"><Meter value={i.confidence * 100} /><small>{Math.round(i.confidence * 100)}% confidence</small></div>
                </div>
              ))}
            </Card>
            {r.follow_up_questions?.length > 0 && (
              <Card title="Ask the assistant">
                {r.follow_up_questions.map((q) => (
                  <button type="button" key={q} className="q-row" onClick={() => ask(q)}><MessageCircleQuestion size={17} />{q}</button>
                ))}
              </Card>
            )}
          </>}

          {(tab === 'Treatment') && <>
            <Card title="Treatment Guide">
              <div className="inset">
                <p className="muted">{r.treatment.length ? "Based on the identified issue, here's a guide to help you treat your crop:" : 'Your plant looks healthy — no treatment needed. Follow the prevention tips to keep it that way.'}</p>
                {r.treatment.length > 0 && <Steps items={r.treatment} />}
              </div>
            </Card>
            {r.prevention.length > 0 && <Card title="Prevention"><ul className="ticks">{r.prevention.map((p) => <li key={p}>{p}</li>)}</ul></Card>}
            <Card><p className="muted small">Use only crop-protection products registered for your crop in your country. Follow the label, wear protective gear and respect the pre-harvest interval. Confirm serious cases with your local extension officer.</p></Card>
          </>}

          {(tab === 'Fertilizer') && <>
            <Card title="Recommended Fertilizer"><p className="pill">{r.fertilizer.recommended}</p>{r.fertilizer.note && <small className="muted">{r.fertilizer.note}</small>}</Card>
            <Card title="NPK Ratio">
              <div className="npk">{[['Nitrogen (N)', r.fertilizer.npk.n], ['Phosphorus (P)', r.fertilizer.npk.p], ['Potassium (K)', r.fertilizer.npk.k]].map(([l, v]) => <div key={l}><small>{l}</small><strong>{v}</strong></div>)}</div>
            </Card>
            <Card title="How and when">
              <p><strong>Application:</strong> {r.fertilizer.application}</p>
              <p><strong>Timing:</strong> {r.fertilizer.timing}</p>
              {r.fertilizer.adjustments.length > 0 && <ul className="ticks">{r.fertilizer.adjustments.map((x) => <li key={x}>{x}</li>)}</ul>}
              <Link to={`/fertilizer?analysis=${a.id}`} className="link">Open the full season plan →</Link>
            </Card>
          </>}

          {(tab === 'Harvest') && <>
            <Card title="Harvest Readiness">
              <div className="between"><span>{r.harvest.estimated_days}</span><b className="big-pct">{r.harvest.readiness_percent}%</b></div>
              <Meter value={r.harvest.readiness_percent} />
              <p>{r.harvest.advice}</p>
              {r.harvest.signs && <div className="inset"><p className="muted">{r.harvest.signs}</p></div>}
            </Card>
            <Card>
              <div className="health"><div className="grade">{r.market.quality_grade}</div><div><h2>Selling Advice</h2><small className="muted">Expected quality grade</small></div></div>
              <p>{r.market.advice}</p>
            </Card>
          </>}

          {(tab === 'Details') && <>
            <Card title="Watering" right={<Droplets size={18} className="green" />}>
              <div className="two"><div className="inset"><small className="muted">Frequency</small><b>{r.watering.frequency}</b></div><div className="inset"><small className="muted">Amount</small><b>{r.watering.amount}</b></div></div>
              <p className="muted">{r.watering.advice}</p>
            </Card>
            {r.yield_tips.length > 0 && <Card title="Improve your yield" right={<TrendingUp size={18} className="green" />}><ul className="ticks">{r.yield_tips.map((t) => <li key={t}>{t}</li>)}</ul></Card>}
            {r.sources?.length > 0 && <Card title="Knowledge sources">{r.sources.map((g) => <Link key={g.id} className="q-row" to={`/guides/${g.id}`}>{g.title}</Link>)}</Card>}
            <Card title="Scan info">
              <dl className="info">
                <dt>Date</dt><dd>{fmtDate(a.created_at)}</dd>
                <dt>Crop</dt><dd>{r.crop}{r.crop_confidence ? ` (${Math.round(r.crop_confidence * 100)}% sure)` : ''}</dd>
                {a.notes && <><dt>Your notes</dt><dd>{a.notes}</dd></>}
                <dt>Analysed by</dt><dd>{engineLabel(r.engine || a.provider)}</dd>
              </dl>
            </Card>
          </>}

          <Link to="/" className="btn analyze-again no-print"><Camera size={17} /> Analyze Again</Link>
          <p className={`muted small health-note ${scoreClass(r.health_score)}`}>AI suggestions support, but don't replace, advice from your local extension officer.</p>
        </div>
      </div>
    </>
  )
}
