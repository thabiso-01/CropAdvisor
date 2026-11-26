import { Bot, Camera, Droplets, FlaskConical, MessageCircleQuestion, Printer, ShieldCheck, Star, Trash2, TrendingUp, UserRoundCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { api, imageUrl } from '../api.js'
import { useStore } from '../store.jsx'
import { errorText } from '../i18n/index.js'
import { Card, ErrorBox, fmtDate, Meter, PageHead, ScoreRing, scoreClass, Spinner, stageName, StatusBadge, Steps } from '../ui.jsx'

// [tab id, translation key]
const TABS = [['Overview', 'common.overview'], ['Treatment', 'analysis.tabTreatment'], ['Fertilizer', 'analysis.tabFertilizer'], ['Harvest', 'analysis.tabHarvest'], ['Details', 'common.details']]
const SEV = { low: 'warn', medium: 'serious', high: 'critical' }

const engineLabel = (t, p) => {
  if (!p) return ''
  if (p.startsWith('gemini:')) return `Google ${p.slice(7)}`
  if (p.startsWith('claude:')) return 'Claude'
  return t('analysis.offlineEngine')
}

export default function Analysis() {
  const { id } = useParams()
  const nav = useNavigate()
  const { bump, setChatScanId, t } = useStore()
  const [a, setA] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('Overview')

  const load = useCallback(() => { setErr(''); api.get(id).then(setA).catch((e) => setErr(errorText(t, e))) }, [id, t])
  useEffect(() => { setA(null); setTab('Overview'); load() }, [load])

  if (err) return <><PageHead title={t('app.name')} /><ErrorBox message={err} onRetry={load} /></>
  if (!a) return <Spinner label={t('analysis.loading')} />

  const r = a.result
  const ask = (q) => { setChatScanId(a.id); nav('/assistant', { state: q ? { q } : null }) }
  const fav = async () => { const u = await api.setFavorite(a.id, !a.favorite); setA({ ...a, favorite: u.favorite }); bump() }
  const del = async () => {
    if (!window.confirm(t('analysis.deleteConfirm'))) return
    await api.remove(a.id); bump(); nav('/history')
  }

  return (
    <>
      <PageHead title={t('app.name')} sub={`${r.crop} · ${fmtDate(a.created_at)}`}>
        <button type="button" className={`icon-btn ${a.favorite ? 'fav' : ''}`} onClick={fav} aria-label={a.favorite ? t('common.removeFavourite') : t('common.addFavourite')} title={t('common.favourite')}>
          <Star size={18} fill={a.favorite ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="icon-btn hide-mobile" onClick={() => window.print()} aria-label={t('analysis.print')} title={t('analysis.print')}><Printer size={18} /></button>
        <button type="button" className="icon-btn" onClick={del} aria-label={t('analysis.delete')} title={t('analysis.delete')}><Trash2 size={18} /></button>
      </PageHead>

      <div className="analysis">
        <aside className="analysis-side stack">
          <div className="photo"><img src={imageUrl(a.image_url)} alt={t('analysis.plantPhoto', { crop: r.crop })} /><span className="photo-tag">{r.crop}</span></div>
          <Card>
            <div className="health">
              <ScoreRing score={r.health_score} />
              <div><small className="muted">{t('analysis.plantHealth')}</small><h2>{r.crop}</h2><StatusBadge status={r.health_status} /></div>
            </div>
            <div className="mini-stats">
              <div><small>{t('analysis.growthStage')}</small><b>{stageName(t, r.growth_stage)}</b></div>
              <div><small>{t('analysis.harvest')}</small><b>{r.harvest.ready ? t('analysis.ready') : `${r.harvest.readiness_percent}%`}</b></div>
              <div><small>{t('analysis.marketGrade')}</small><b>{r.market.quality_grade}</b></div>
            </div>
          </Card>
          <div className="side-actions no-print">
            <button type="button" className="btn" onClick={() => ask()}><Bot size={17} /> {t('analysis.askAI')}</button>
            <Link to={`/fertilizer?analysis=${a.id}`} className="btn ghost"><FlaskConical size={17} /> {t('analysis.fertilizerPlan')}</Link>
          </div>
        </aside>

        <div className="analysis-main stack">
          <div className="tabs no-print" role="tablist">
            {TABS.map(([id, label]) => <button type="button" role="tab" key={id} aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{t(label)}</button>)}
          </div>

          {r.expert_check?.recommended && (
            <div className="expert-note" role="note">
              <UserRoundCheck size={22} aria-hidden="true" />
              <div>
                <strong>{t('analysis.expertTitle')}</strong>
                <ul>{(r.expert_check.codes ?? []).length
                  ? r.expert_check.codes.map((c, i) => <li key={c}>{t(`expert.${c}`) === `expert.${c}` ? r.expert_check.reasons[i] : t(`expert.${c}`)}</li>)
                  : r.expert_check.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                <small>{t('analysis.expertNote')}</small>
              </div>
            </div>
          )}

          {(tab === 'Overview') && <>
            <Card title={t('analysis.summary')}><p>{r.summary}</p></Card>
            <Card title={t('analysis.problems')} right={<small className="muted">{t('analysis.found', { n: r.issues.length })}</small>}>
              {r.issues.length === 0 ? (
                <div className="inset ok"><ShieldCheck size={20} /> {t('analysis.noIssues')}</div>
              ) : r.issues.map((i, k) => (
                <div className="issue" key={k}>
                  <div className="between"><strong>{i.name}</strong><span className={`sev ${SEV[i.severity]}`}>{t(`severity.${i.severity}`)}</span></div>
                  <p className="muted">{i.description}</p>
                  {i.evidence && <small className="muted">{t('analysis.seenInPhoto', { text: i.evidence })}</small>}
                  <div className="conf"><Meter value={i.confidence * 100} /><small>{t('analysis.confidence', { n: Math.round(i.confidence * 100) })}</small></div>
                </div>
              ))}
            </Card>
            {r.follow_up_questions?.length > 0 && (
              <Card title={t('analysis.askAssistant')}>
                {r.follow_up_questions.map((q) => (
                  <button type="button" key={q} className="q-row" onClick={() => ask(q)}><MessageCircleQuestion size={17} />{q}</button>
                ))}
              </Card>
            )}
          </>}

          {(tab === 'Treatment') && <>
            <Card title={t('analysis.treatmentGuide')}>
              <div className="inset">
                <p className="muted">{r.treatment.length ? t('analysis.treatmentIntro') : t('analysis.noTreatment')}</p>
                {r.treatment.length > 0 && <Steps items={r.treatment} />}
              </div>
            </Card>
            {r.prevention.length > 0 && <Card title={t('analysis.prevention')}><ul className="ticks">{r.prevention.map((p) => <li key={p}>{p}</li>)}</ul></Card>}
            <Card><p className="muted small">{t('analysis.safety')}</p></Card>
          </>}

          {(tab === 'Fertilizer') && <>
            <Card title={t('analysis.recommendedFertilizer')}><p className="pill">{r.fertilizer.recommended}</p>{r.fertilizer.note && <small className="muted">{r.fertilizer.note}</small>}</Card>
            <Card title={t('analysis.npk')}>
              <div className="npk">{[[t('analysis.nitrogen'), r.fertilizer.npk.n], [t('analysis.phosphorus'), r.fertilizer.npk.p], [t('analysis.potassium'), r.fertilizer.npk.k]].map(([l, v]) => <div key={l}><small>{l}</small><strong>{v}</strong></div>)}</div>
            </Card>
            <Card title={t('analysis.howAndWhen')}>
              <p><strong>{t('analysis.application')}</strong> {r.fertilizer.application}</p>
              <p><strong>{t('analysis.timing')}</strong> {r.fertilizer.timing}</p>
              {r.fertilizer.adjustments.length > 0 && <ul className="ticks">{r.fertilizer.adjustments.map((x) => <li key={x}>{x}</li>)}</ul>}
              <Link to={`/fertilizer?analysis=${a.id}`} className="link">{t('analysis.fullPlan')}</Link>
            </Card>
          </>}

          {(tab === 'Harvest') && <>
            <Card title={t('analysis.harvestReadiness')}>
              <div className="between"><span>{r.harvest.estimated_days}</span><b className="big-pct">{r.harvest.readiness_percent}%</b></div>
              <Meter value={r.harvest.readiness_percent} />
              <p>{r.harvest.advice}</p>
              {r.harvest.signs && <div className="inset"><p className="muted">{r.harvest.signs}</p></div>}
            </Card>
            <Card>
              <div className="health"><div className="grade">{r.market.quality_grade}</div><div><h2>{t('analysis.sellingAdvice')}</h2><small className="muted">{t('analysis.expectedGrade')}</small></div></div>
              <p>{r.market.advice}</p>
            </Card>
          </>}

          {(tab === 'Details') && <>
            <Card title={t('analysis.watering')} right={<Droplets size={18} className="green" />}>
              <div className="two"><div className="inset"><small className="muted">{t('analysis.frequency')}</small><b>{r.watering.frequency}</b></div><div className="inset"><small className="muted">{t('analysis.amount')}</small><b>{r.watering.amount}</b></div></div>
              <p className="muted">{r.watering.advice}</p>
            </Card>
            {r.yield_tips.length > 0 && <Card title={t('analysis.improveYield')} right={<TrendingUp size={18} className="green" />}><ul className="ticks">{r.yield_tips.map((t) => <li key={t}>{t}</li>)}</ul></Card>}
            {r.sources?.length > 0 && <Card title={t('analysis.sources')}>{r.sources.map((g) => <Link key={g.id} className="q-row" to={`/guides/${g.id}`}>{g.title}</Link>)}</Card>}
            <Card title={t('analysis.scanInfo')}>
              <dl className="info">
                <dt>{t('analysis.date')}</dt><dd>{fmtDate(a.created_at)}</dd>
                <dt>{t('analysis.crop')}</dt><dd>{r.crop}{r.crop_confidence ? ` (${t('analysis.sure', { n: Math.round(r.crop_confidence * 100) })})` : ''}</dd>
                {a.notes && <><dt>{t('analysis.yourNotes')}</dt><dd>{a.notes}</dd></>}
                <dt>{t('analysis.analysedBy')}</dt><dd>{engineLabel(t, r.engine || a.provider)}</dd>
              </dl>
            </Card>
          </>}

          <Link to="/" className="btn analyze-again no-print"><Camera size={17} /> {t('common.analyzeAgain')}</Link>
          <p className={`muted small health-note ${scoreClass(r.health_score)}`}>{t('analysis.disclaimer')}</p>
        </div>
      </div>
    </>
  )
}
