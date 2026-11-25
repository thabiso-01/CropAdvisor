import { ArrowLeft, Bot, Camera } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { api, imageUrl } from '../api.js'
import seedling from '../assets/seedling.jpg'
import { useStore } from '../store.jsx'
import { cap, Card, CROPS, ErrorBox, PageHead, Spinner } from '../ui.jsx'

const STAGES = ['seedling', 'vegetative', 'flowering', 'fruiting', 'mature']

export default function Fertilizer() {
  const [params] = useSearchParams()
  const analysisId = params.get('analysis')
  const nav = useNavigate()
  const { setChatScanId } = useStore()
  const [analysis, setAnalysis] = useState(null)
  const [crop, setCrop] = useState('tomato')
  const [stage, setStage] = useState()
  const [plan, setPlan] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('Overview')

  useEffect(() => { if (analysisId) api.get(analysisId).then(setAnalysis).catch((e) => setErr(e.message)) }, [analysisId])
  useEffect(() => {
    setErr('')
    api.fertilizer(analysisId ? { analysis_id: analysisId, stage } : { crop, stage })
      .then((p) => { setPlan(p); if (!stage) setStage(p.stage) })
      .catch((e) => setErr(e.message))
  }, [analysisId, crop, stage])

  const askAI = () => {
    if (analysisId) setChatScanId(analysisId)
    nav('/assistant', { state: { q: `What fertilizer should I use for my ${plan?.crop ?? crop} at the ${plan?.stage ?? 'current'} stage, and how much per plant or per square metre?` } })
  }

  return (
    <>
      <PageHead title="Fertilizer Advisor" sub="AI-Powered Recommendations">
        <button type="button" className="icon-btn" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
      </PageHead>
      {err && <ErrorBox message={err} />}
      <div className="analysis">
        <aside className="analysis-side stack">
          <div className="photo"><img src={analysis ? imageUrl(analysis.image_url) : seedling} alt="" />{plan && <span className="photo-tag">{plan.crop}</span>}</div>
          {!analysisId && (
            <Card title="Crop">
              <div className="chips">{CROPS.filter(([id]) => id).map(([id, n]) => <button type="button" key={id} className={`chip ${crop === id ? 'on' : ''}`} onClick={() => { setCrop(id); setStage(undefined) }}>{n}</button>)}</div>
            </Card>
          )}
          <Card title="Growth stage">
            <div className="chips">{STAGES.map((x) => <button type="button" key={x} className={`chip ${stage === x ? 'on' : ''}`} onClick={() => setStage(x)}>{cap(x)}</button>)}</div>
          </Card>
          <button type="button" className="btn ghost no-print" onClick={askAI}><Bot size={17} /> Ask AI for exact rates</button>
        </aside>

        <div className="analysis-main stack">
          <div className="tabs" role="tablist">
            {['Overview', 'Details'].map((t) => <button type="button" role="tab" key={t} aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
          </div>
          {!plan ? <Spinner /> : tab === 'Overview' ? <>
            <Card title="Recommended Fertilizer"><p className="pill">{plan.recommended}</p>{plan.note && <small className="muted">{plan.note}</small>}</Card>
            <Card title="NPK Ratio">
              <div className="npk">{[['Nitrogen (N)', plan.npk.n], ['Phosphorus (P)', plan.npk.p], ['Potassium (K)', plan.npk.k]].map(([l, v]) => <div key={l}><small>{l}</small><strong>{v}</strong></div>)}</div>
            </Card>
            <Card title="Application">
              <dl className="info"><dt>How</dt><dd>{plan.application}</dd><dt>When</dt><dd>{plan.timing}</dd><dt>Stage</dt><dd>{cap(plan.stage)}</dd></dl>
            </Card>
            {plan.adjustments.length > 0 && <Card title="Based on your plant's condition"><ul className="ticks">{plan.adjustments.map((a) => <li key={a}>{a}</li>)}</ul></Card>}
          </> : <>
            <Card title="Season schedule">
              <ol className="timeline">
                {plan.schedule.map((x) => (
                  <li key={x.stage} className={x.stage === plan.stage ? 'now' : ''}>
                    <strong>{cap(x.stage)} <small className="muted">· NPK {x.npk}</small></strong>
                    <span>{x.product}</span><small className="muted">{x.timing}</small>
                  </li>
                ))}
              </ol>
            </Card>
            <Card><p className="muted small">{plan.safety}</p></Card>
          </>}
          <Link to="/" className="btn analyze-again no-print"><Camera size={17} /> Analyze Again</Link>
        </div>
      </div>
    </>
  )
}
