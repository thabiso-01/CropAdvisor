import { BookOpen, Bot, Camera, FlaskConical, ImagePlus, LineChart, Lightbulb, Sprout, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { api } from '../api.js'
import { CameraModal, canUseLiveCamera } from '../Camera.jsx'
import field from '../assets/field.jpg'
import { errorText } from '../i18n/index.js'
import { useStore } from '../store.jsx'
import { Card, CROPS, ErrorBox, PageHead, ScanCard } from '../ui.jsx'

const STEPS = ['home.step1', 'home.step2', 'home.step3', 'home.step4']

const TOOLS = [
  { to: '/fertilizer', label: 'nav.fertilizer', Icon: FlaskConical },
  { to: '/assistant', label: 'nav.assistant', Icon: Bot },
  { to: '/guides', label: 'nav.guides', Icon: BookOpen },
  { to: '/analytics', label: 'nav.farmAnalytics', Icon: LineChart },
]

export default function Home() {
  const { lang, version, bump, t } = useStore()
  const nav = useNavigate()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [crop, setCrop] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const [recent, setRecent] = useState([])
  const [camOpen, setCamOpen] = useState(false)
  const cam = useRef()
  const up = useRef()

  useEffect(() => { api.list().then((r) => setRecent(r.slice(0, 4))).catch(() => setRecent([])) }, [version])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])
  useEffect(() => {
    if (!busy) return
    setElapsed(0)
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [busy])

  const choose = (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setErr(t('error.photoType'))
    setErr('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const analyze = async () => {
    if (!file) return
    setBusy(true)
    setErr('')
    try {
      const a = await api.analyze(file, { crop, notes: notes.trim(), lang })
      bump()
      setFile(null)
      setPreview(null)
      setNotes('')
      nav(`/analysis/${a.id}`)
    } catch (e) {
      setErr(errorText(t, e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title={t('app.name')} />
      <div className="grid-2">
        <div className="stack">
          <section
            className={`dropzone ${drag ? 'drag' : ''} ${preview ? 'has-photo' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files?.[0]) }}
          >
            <img src={preview || field} alt={preview ? t('home.selectedPhoto') : ''} />
            {preview ? (
              <button type="button" className="photo-x" onClick={() => { setFile(null); setPreview(null) }} aria-label={t('common.removePhoto')}><X size={18} /></button>
            ) : (
              <div className="drop-inner">
                <span className="drop-icon"><Sprout size={28} /></span>
                <h2>{t('home.scanTitle')}</h2>
                <p>{t('home.scanText')}</p>
                <div className="btn-row">
                  <button type="button" className="btn light" onClick={() => (canUseLiveCamera() ? setCamOpen(true) : cam.current.click())}><Camera size={17} /> {t('home.takePhoto')}</button>
                  <button type="button" className="btn glass" onClick={() => up.current.click()}><Upload size={17} /> {t('home.upload')}</button>
                </div>
              </div>
            )}
            <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
            <input ref={up} type="file" accept="image/*" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
          </section>

          {err && <ErrorBox message={err} />}

          <Card title={t('home.whichCrop')}>
            <div className="chips">
              {CROPS.map(([id, name]) => (
                <button type="button" key={id || 'auto'} className={`chip ${crop === id ? 'on' : ''}`} onClick={() => setCrop(id)}>{t(name)}</button>
              ))}
            </div>
            <label className="field">
              <span>{t('home.whatSeeing')} <small className="muted">{t('home.optional')}</small></span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={t('home.notesPlaceholder')} />
            </label>
            <div className="btn-row">
              <button type="button" className="btn" disabled={!file || busy} onClick={analyze}><Sprout size={17} /> {t('home.analyze')}</button>
              {file && <button type="button" className="btn ghost" onClick={() => up.current.click()}><ImagePlus size={17} /> {t('home.changePhoto')}</button>}
            </div>
            {!file && <p className="muted small">{t('home.chooseFirst')}</p>}
          </Card>
        </div>

        <div className="stack">
          <div className="tools">
            {TOOLS.map(({ to, label, Icon }) => (
              <Link key={to} to={to} className="tool"><span className="icon-bubble"><Icon size={20} /></span>{t(label)}</Link>
            ))}
          </div>
          <Card title={t('home.recent')} right={recent.length > 0 && <Link to="/history" className="link">{t('home.seeAll')}</Link>}>
            {recent.length ? (
              <div className="scan-list">{recent.map((r) => <ScanCard key={r.id} item={r} />)}</div>
            ) : (
              <p className="muted">{t('home.recentEmpty')}</p>
            )}
          </Card>
          <Card>
            <div className="tip"><span className="icon-bubble"><Lightbulb size={18} /></span>
              <p className="muted">{t('home.photoTip')}</p>
            </div>
          </Card>
        </div>
      </div>

      <CameraModal open={camOpen} onClose={() => setCamOpen(false)} onCapture={choose} onUseFile={() => up.current.click()} />

      {busy && (
        <div className="busy" role="status">
          <div className="busy-card">
            <div className="spin" />
            <h3>{t('home.busyTitle')}</h3>
            <p>{t(STEPS[Math.min(STEPS.length - 1, Math.floor(elapsed / 4))])}</p>
            <small className="muted">{elapsed}s</small>
          </div>
        </div>
      )}
    </>
  )
}
