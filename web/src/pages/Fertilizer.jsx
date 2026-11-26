import { ArrowLeft, Bot, Camera } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { api, imageUrl } from '../api.js'
import seedling from '../assets/seedling.jpg'
import { useStore } from '../store.jsx'
import { errorText } from '../i18n/index.js'
import { Card, CROPS, ErrorBox, PageHead, Spinner, stageName } from '../ui.jsx'

const STAGES = ['seedling', 'vegetative', 'flowering', 'fruiting', 'mature']

export default function Fertilizer() {
  const [params] = useSearchParams()
  const analysisId = params.get('analysis')
  const nav = useNavigate()
  const { setChatScanId, t } = useStore()
  const [analysis, setAnalysis] = useState(null)
  const [crop, setCrop] = useState('tomato')
  const [stage, setStage] = useState()
  const [plan, setPlan] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('Overview')

  useEffect(() => { if (analysisId) api.get(analysisId).then(setAnalysis).catch((e) => setErr(errorText(t, e))) }, [analysisId, t])
  useEffect(() => {
    setErr('')
    api.fertilizer(analysisId ? { analysis_id: analysisId, stage } : { crop, stage })
      .then((p) => { setPlan(p); if (!stage) setStage(p.stage) })
      .catch((e) => setErr(errorText(t, e)))
  }, [analysisId, crop, stage, t])

  const askAI = () => {
    if (analysisId) setChatScanId(analysisId)
    nav('/assistant', { state: { q: t('fert.askQuestion', { crop: plan?.crop ?? t(`crop.${crop}`), stage: plan?.stage ? stageName(t, plan.stage) : t('fert.currentStage') }) } })
  }

  return (
    <>
      <PageHead title={t('nav.fertilizer')} sub={t('fert.sub')}>
        <button type="button" className="icon-btn" onClick={() => nav(-1)} aria-label={t('common.back')}><ArrowLeft size={18} /></button>
      </PageHead>
      {err && <ErrorBox message={err} />}
      <div className="analysis">
        <aside className="analysis-side stack">
          <div className="photo"><img src={analysis ? imageUrl(analysis.image_url) : seedling} alt="" />{plan && <span className="photo-tag">{plan.crop}</span>}</div>
          {!analysisId && (
            <Card title={t('fert.crop')}>
              <div className="chips">{CROPS.filter(([id]) => id).map(([id, n]) => <button type="button" key={id} className={`chip ${crop === id ? 'on' : ''}`} onClick={() => { setCrop(id); setStage(undefined) }}>{t(n)}</button>)}</div>
            </Card>
          )}
          <Card title={t('analysis.growthStage')}>
            <div className="chips">{STAGES.map((x) => <button type="button" key={x} className={`chip ${stage === x ? 'on' : ''}`} onClick={() => setStage(x)}>{stageName(t, x)}</button>)}</div>
          </Card>
          <button type="button" className="btn ghost no-print" onClick={askAI}><Bot size={17} /> {t('fert.askRates')}</button>
        </aside>

        <div className="analysis-main stack">
          <div className="tabs" role="tablist">
            {[['Overview', 'common.overview'], ['Details', 'common.details']].map(([id, label]) => <button type="button" role="tab" key={id} aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{t(label)}</button>)}
          </div>
          {!plan ? <Spinner /> : tab === 'Overview' ? <>
            <Card title={t('analysis.recommendedFertilizer')}><p className="pill">{plan.recommended}</p>{plan.note && <small className="muted">{plan.note}</small>}</Card>
            <Card title={t('analysis.npk')}>
              <div className="npk">{[[t('analysis.nitrogen'), plan.npk.n], [t('analysis.phosphorus'), plan.npk.p], [t('analysis.potassium'), plan.npk.k]].map(([l, v]) => <div key={l}><small>{l}</small><strong>{v}</strong></div>)}</div>
            </Card>
            <Card title={t('fert.application')}>
              <dl className="info"><dt>{t('fert.how')}</dt><dd>{plan.application}</dd><dt>{t('fert.when')}</dt><dd>{plan.timing}</dd><dt>{t('fert.stage')}</dt><dd>{stageName(t, plan.stage)}</dd></dl>
            </Card>
            {plan.adjustments.length > 0 && <Card title={t('fert.basedOnCondition')}><ul className="ticks">{plan.adjustments.map((a) => <li key={a}>{a}</li>)}</ul></Card>}
          </> : <>
            <Card title={t('fert.schedule')}>
              <ol className="timeline">
                {plan.schedule.map((x) => (
                  <li key={x.stage} className={x.stage === plan.stage ? 'now' : ''}>
                    <strong>{stageName(t, x.stage)} <small className="muted">· NPK {x.npk}</small></strong>
                    <span>{x.product}</span><small className="muted">{x.timing}</small>
                  </li>
                ))}
              </ol>
            </Card>
            <Card><p className="muted small">{plan.safety}</p></Card>
          </>}
          <Link to="/" className="btn analyze-again no-print"><Camera size={17} /> {t('common.analyzeAgain')}</Link>
        </div>
      </div>
    </>
  )
}
