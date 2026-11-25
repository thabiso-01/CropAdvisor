import { BookOpen, Bot, Camera, FlaskConical, ImagePlus, LineChart, Lightbulb, Sprout, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { api } from '../api.js'
import field from '../assets/field.jpg'
import { useStore } from '../store.jsx'
import { Card, CROPS, ErrorBox, PageHead, ScanCard } from '../ui.jsx'

const STEPS = ['Checking leaf colour…', 'Looking for disease and pest signs…', 'Estimating growth and harvest readiness…', 'Writing treatment and fertilizer advice…']

const TOOLS = [
  { to: '/fertilizer', label: 'Fertilizer Advisor', Icon: FlaskConical },
  { to: '/assistant', label: 'AI Assistant', Icon: Bot },
  { to: '/guides', label: 'Crop Guides', Icon: BookOpen },
  { to: '/analytics', label: 'Farm Analytics', Icon: LineChart },
]

export default function Home() {
  const { lang, version, bump, health } = useStore()
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
    if (!f.type.startsWith('image/')) return setErr('Please choose a photo (JPEG, PNG or WebP).')
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
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const localModel = health?.provider?.startsWith('ollama:')
  return (
    <>
      <PageHead title="Crop Advisor AI" sub="Digital Kisan Advisor" />
      <div className="grid-2">
        <div className="stack">
          <section
            className={`dropzone ${drag ? 'drag' : ''} ${preview ? 'has-photo' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files?.[0]) }}
          >
            <img src={preview || field} alt={preview ? 'Selected plant photo' : ''} />
            {preview ? (
              <button type="button" className="photo-x" onClick={() => { setFile(null); setPreview(null) }} aria-label="Remove photo"><X size={18} /></button>
            ) : (
              <div className="drop-inner">
                <span className="drop-icon"><Sprout size={28} /></span>
                <h2>Scan your plant</h2>
                <p>Take a photo or drop one here. AI checks its health, problems, growth stage, fertilizer needs and harvest readiness.</p>
                <div className="btn-row">
                  <button type="button" className="btn light" onClick={() => cam.current.click()}><Camera size={17} /> Take photo</button>
                  <button type="button" className="btn glass" onClick={() => up.current.click()}><Upload size={17} /> Upload</button>
                </div>
              </div>
            )}
            <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
            <input ref={up} type="file" accept="image/*" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
          </section>

          {err && <ErrorBox message={err} />}

          <Card title="Which crop is this?">
            <div className="chips">
              {CROPS.map(([id, name]) => (
                <button type="button" key={id || 'auto'} className={`chip ${crop === id ? 'on' : ''}`} onClick={() => setCrop(id)}>{name}</button>
              ))}
            </div>
            <label className="field">
              <span>What are you seeing? <small className="muted">(optional, helps the AI)</small></span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. Yellow leaves with brown rings on the lower branches after a week of rain" />
            </label>
            <div className="btn-row">
              <button type="button" className="btn" disabled={!file || busy} onClick={analyze}><Sprout size={17} /> Analyze Plant</button>
              {file && <button type="button" className="btn ghost" onClick={() => up.current.click()}><ImagePlus size={17} /> Change photo</button>}
            </div>
            {!file && <p className="muted small">Choose a photo above to start.</p>}
          </Card>
        </div>

        <div className="stack">
          <div className="tools">
            {TOOLS.map(({ to, label, Icon }) => (
              <Link key={to} to={to} className="tool"><span className="icon-bubble"><Icon size={20} /></span>{label}</Link>
            ))}
          </div>
          <Card title="Recent scans" right={recent.length > 0 && <Link to="/history" className="link">See all</Link>}>
            {recent.length ? (
              <div className="scan-list">{recent.map((r) => <ScanCard key={r.id} item={r} />)}</div>
            ) : (
              <p className="muted">Your plant analyses will appear here.</p>
            )}
          </Card>
          <Card>
            <div className="tip"><span className="icon-bubble"><Lightbulb size={18} /></span>
              <p className="muted">Photo tip: shoot in daylight, fill the frame with the affected leaves or fruit, and add a short description of what you see.</p>
            </div>
          </Card>
        </div>
      </div>

      {busy && (
        <div className="busy" role="status">
          <div className="busy-card">
            <div className="spin" />
            <h3>Analysing your plant</h3>
            <p>{STEPS[Math.min(STEPS.length - 1, Math.floor(elapsed / 4))]}</p>
            {localModel && <small className="muted">The open-source model runs on your own server, so the first analysis can take a minute or two.</small>}
            <small className="muted">{elapsed}s</small>
          </div>
        </div>
      )}
    </>
  )
}
