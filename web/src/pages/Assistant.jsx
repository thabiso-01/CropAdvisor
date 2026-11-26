import { ArrowLeft, BookOpen, Camera, Leaf, Paperclip, Send, Share2, Trash2, Tractor, User, Wrench, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { api, fileToDataUrl } from '../api.js'
import { CameraModal, canUseLiveCamera } from '../Camera.jsx'
import { errorText } from '../i18n/index.js'
import { useStore } from '../store.jsx'
import { fmtTime, LanguagePicker, Markdown, Modal } from '../ui.jsx'

// translation keys; the question is sent in the chosen language, so the AI answers in it
const EXAMPLES = ['chat.ex1', 'chat.ex2', 'chat.ex3', 'chat.ex4', 'chat.ex5', 'chat.ex6']

export default function Assistant() {
  const { messages, setMessages, clearChat, lang, chatScanId, setChatScanId, version, health, t } = useStore()
  const nav = useNavigate()
  const location = useLocation()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const [scans, setScans] = useState([])
  const [guides, setGuides] = useState([])
  const [sheet, setSheet] = useState(null)
  const [camOpen, setCamOpen] = useState(false)
  const end = useRef()
  const fileIn = useRef()
  const camIn = useRef()
  const handled = useRef(null)

  useEffect(() => { api.list().then(setScans).catch(() => {}) }, [version])
  useEffect(() => { api.guides().then(setGuides).catch(() => {}) }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [messages.length, sending])

  const scan = scans.find((s) => s.id === chatScanId)

  const send = useCallback(async (raw) => {
    const content = raw.trim() || (attachment ? t('chat.photoQuestion') : '')
    if (!content || sending) return
    const userMsg = { id: `u${Date.now()}`, role: 'user', content, at: Date.now(), image: attachment?.url }
    const history = [...messages.filter((m) => m.id !== 'welcome'), userMsg].map(({ role, content: c }) => ({ role, content: c }))
    setMessages((m) => [...m, userMsg])
    setText('')
    const img = attachment?.url
    setAttachment(null)
    setSending(true)
    try {
      const r = await api.chat({ messages: history, analysis_id: chatScanId || undefined, image_base64: img, lang })
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', content: r.reply, at: Date.now(), sources: r.sources, provider: r.provider }])
    } catch (e) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', content: `⚠️ ${errorText(t, e)}`, at: Date.now() }])
    } finally {
      setSending(false)
    }
  }, [attachment, sending, messages, setMessages, chatScanId, lang, t])

  // questions handed over from other pages (analysis follow-ups, guides, fertilizer)
  useEffect(() => {
    const q = location.state?.q
    if (q && handled.current !== location.key) {
      handled.current = location.key
      send(q)
      nav('.', { replace: true, state: null })
    }
  }, [location, send, nav])

  const attach = async (f) => {
    if (!f) return
    try { setAttachment({ url: await fileToDataUrl(f) }) } catch (e) { alert(e.message) }
  }
  const share = async () => {
    const text = messages.map((m) => `${m.role === 'user' ? t('chat.me') : t('app.name')}: ${m.id === 'welcome' ? t('chat.welcome') : m.content}`).join('\n\n')
    if (navigator.share) navigator.share({ title: t('chat.shareTitle'), text }).catch(() => {})
    else { await navigator.clipboard?.writeText(text); alert(t('chat.copied')) }
  }
  const clear = () => { if (window.confirm(t('chat.clearConfirm'))) { clearChat(); setChatScanId(null) } }

  const contextPanel = (
    <>
      <div className="ctx-block">
        <h3>{t('chat.discussing')}</h3>
        <select value={chatScanId ?? ''} onChange={(e) => setChatScanId(e.target.value || null)} aria-label={t('chat.discussing')}>
          <option value="">{t('chat.generalQuestion')}</option>
          {scans.map((s) => <option key={s.id} value={s.id}>{s.crop} · {s.health_score}/100 · {new Date(s.created_at).toLocaleDateString()}</option>)}
        </select>
        <small className="muted">{t('chat.scanContext')}</small>
      </div>
      <div className="ctx-block">
        <h3>{t('chat.quickQuestions')}</h3>
        {EXAMPLES.map((q) => <button type="button" key={q} className="q-row" onClick={() => { setSheet(null); send(t(q)) }}>{t(q)}</button>)}
      </div>
      <div className="ctx-block">
        <h3>{t('nav.guides')}</h3>
        {guides.slice(0, 8).map((g) => <Link key={g.id} to={`/guides/${g.id}`} className="q-row"><BookOpen size={15} />{g.title}</Link>)}
      </div>
    </>
  )

  return (
    <div className="chat-page">
      <div className="chat-col">
        <header className="chat-head">
          <button type="button" className="hbtn" onClick={() => nav('/')} aria-label={t('common.back')}><ArrowLeft size={20} /></button>
          <div className="chat-title"><h1>{t('chat.title')}</h1><small>{health?.ai_ready ? t('chat.poweredBy', { model: health.chat_model }) : t('chat.knowledgeMode')}</small></div>
          <div className="hide-mobile"><LanguagePicker /></div>
          <button type="button" className="hbtn" onClick={share} aria-label={t('chat.share')}><Share2 size={17} /></button>
          <button type="button" className="hbtn" onClick={clear} aria-label={t('chat.clear')}><Trash2 size={17} /></button>
        </header>

        <div className="chat-chips">
          <button type="button" onClick={() => setSheet('tools')}><Wrench size={15} /> {t('chat.tools')}</button>
          <button type="button" onClick={() => setSheet('guides')}><BookOpen size={15} /> {t('chat.guides')}</button>
          <button type="button" onClick={() => (canUseLiveCamera() ? setCamOpen(true) : camIn.current.click())}><Camera size={15} /> {t('chat.scan')}</button>
        </div>

        {scan && (
          <div className="ctx-chip"><Leaf size={14} /> {t('chat.discussingScan', { crop: scan.crop, score: scan.health_score })}
            <button type="button" onClick={() => setChatScanId(null)} aria-label={t('chat.stopDiscussing')}><X size={14} /></button>
          </div>
        )}

        <div className="messages" aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.role === 'user' ? 'me' : 'bot'}`}>
              {m.role !== 'user' && <span className="avatar bot"><Tractor size={16} /></span>}
              <div className="bubble">
                {m.image && <img src={m.image} alt={t('chat.attachedPhoto')} />}
                {m.role === 'user' ? <p>{m.content}</p> : <Markdown text={m.id === 'welcome' ? t('chat.welcome') : m.content} />}
                {m.sources?.length > 0 && (
                  <div className="sources">{m.sources.slice(0, 3).map((s) => <Link key={s.id} to={`/guides/${s.id}`}><BookOpen size={11} />{s.title}</Link>)}</div>
                )}
                <time>{fmtTime(m.at)}</time>
              </div>
              {m.role === 'user' && <span className="avatar me"><User size={16} /></span>}
            </div>
          ))}
          {sending && <div className="msg bot"><span className="avatar bot"><Tractor size={16} /></span><div className="bubble dots"><span /><span /><span /></div></div>}
          {messages.length <= 1 && !sending && (
            <div className="suggest">
              <small className="muted">{t('chat.tryAsking')}</small>
              {EXAMPLES.slice(0, 5).map((q) => <button type="button" key={q} onClick={() => send(t(q))}>{t(q)}</button>)}
            </div>
          )}
          <div ref={end} />
        </div>

        {attachment && (
          <div className="attach-preview"><img src={attachment.url} alt="" /><span className="muted">{t('chat.photoAttached')}</span>
            <button type="button" className="icon-btn" onClick={() => setAttachment(null)} aria-label={t('common.removePhoto')}><X size={16} /></button>
          </div>
        )}

        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text) }}>
          <button type="button" className="clip" onClick={() => fileIn.current.click()} aria-label={t('chat.attachPhoto')}><Paperclip size={19} /></button>
          <textarea
            value={text} rows={1} placeholder={t('chat.placeholder')} aria-label={t('chat.message')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}
          />
          <button type="submit" className={`send ${text.trim() || attachment ? 'on' : ''}`} disabled={sending || (!text.trim() && !attachment)} aria-label={t('chat.send')}><Send size={17} /></button>
        </form>
        <input ref={fileIn} type="file" accept="image/*" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = '' }} />
        <input ref={camIn} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = '' }} />
      </div>

      <aside className="chat-side">{contextPanel}</aside>

      <CameraModal open={camOpen} onClose={() => setCamOpen(false)} onCapture={attach} onUseFile={() => fileIn.current.click()} />

      <Modal open={sheet === 'tools'} onClose={() => setSheet(null)} title={t('chat.tools')}>
        <Link to="/" className="q-row"><Camera size={16} /> {t('chat.newAnalysis')}</Link>
        <Link to={chatScanId ? `/fertilizer?analysis=${chatScanId}` : '/fertilizer'} className="q-row"><Wrench size={16} /> {t('nav.fertilizer')}</Link>
        <button type="button" className="q-row" onClick={() => { setSheet(null); fileIn.current.click() }}><Paperclip size={16} /> {t('chat.attachAPhoto')}</button>
        {contextPanel}
      </Modal>
      <Modal open={sheet === 'guides'} onClose={() => setSheet(null)} title={t('nav.guides')}>
        {guides.map((g) => <Link key={g.id} to={`/guides/${g.id}`} className="q-row"><BookOpen size={15} />{g.title}<small className="muted"> · {g.category}</small></Link>)}
      </Modal>
    </div>
  )
}
