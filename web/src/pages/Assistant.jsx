import { ArrowLeft, BookOpen, Camera, Leaf, Paperclip, Send, Share2, Trash2, Tractor, User, Wrench, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { api, fileToDataUrl } from '../api.js'
import { useStore } from '../store.jsx'
import { fmtTime, LanguagePicker, Markdown, Modal } from '../ui.jsx'

const EXAMPLES = [
  'Why are my tomato leaves turning yellow?',
  'How often should I water these plants?',
  'What can I do about these spots on my leaves?',
  'Are my tomatoes ready for harvesting?',
  'How can I improve my crop production?',
  'How do I treat tomato blight?',
]

export default function Assistant() {
  const { messages, setMessages, clearChat, lang, chatScanId, setChatScanId, version, health } = useStore()
  const nav = useNavigate()
  const location = useLocation()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const [scans, setScans] = useState([])
  const [guides, setGuides] = useState([])
  const [sheet, setSheet] = useState(null)
  const end = useRef()
  const fileIn = useRef()
  const camIn = useRef()
  const handled = useRef(null)

  useEffect(() => { api.list().then(setScans).catch(() => {}) }, [version])
  useEffect(() => { api.guides().then(setGuides).catch(() => {}) }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [messages.length, sending])

  const scan = scans.find((s) => s.id === chatScanId)

  const send = useCallback(async (raw) => {
    const content = raw.trim() || (attachment ? 'Please look at this photo of my plant. What do you see and what should I do?' : '')
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
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', content: `⚠️ ${e.message}`, at: Date.now() }])
    } finally {
      setSending(false)
    }
  }, [attachment, sending, messages, setMessages, chatScanId, lang])

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
    const t = messages.map((m) => `${m.role === 'user' ? 'Me' : 'Crop Advisor AI'}: ${m.content}`).join('\n\n')
    if (navigator.share) navigator.share({ title: 'Crop Advisor AI chat', text: t }).catch(() => {})
    else { await navigator.clipboard?.writeText(t); alert('Conversation copied to clipboard') }
  }
  const clear = () => { if (window.confirm('Clear this conversation?')) { clearChat(); setChatScanId(null) } }

  const contextPanel = (
    <>
      <div className="ctx-block">
        <h3>Discussing</h3>
        <select value={chatScanId ?? ''} onChange={(e) => setChatScanId(e.target.value || null)} aria-label="Plant scan to discuss">
          <option value="">General question (no scan)</option>
          {scans.map((s) => <option key={s.id} value={s.id}>{s.crop} · {s.health_score}/100 · {new Date(s.created_at).toLocaleDateString()}</option>)}
        </select>
        <small className="muted">The assistant uses this scan's diagnosis when answering.</small>
      </div>
      <div className="ctx-block">
        <h3>Quick questions</h3>
        {EXAMPLES.map((q) => <button type="button" key={q} className="q-row" onClick={() => { setSheet(null); send(q) }}>{q}</button>)}
      </div>
      <div className="ctx-block">
        <h3>Crop guides</h3>
        {guides.slice(0, 8).map((g) => <Link key={g.id} to={`/guides/${g.id}`} className="q-row"><BookOpen size={15} />{g.title}</Link>)}
      </div>
    </>
  )

  return (
    <div className="chat-page">
      <div className="chat-col">
        <header className="chat-head">
          <button type="button" className="hbtn" onClick={() => nav('/')} aria-label="Back"><ArrowLeft size={20} /></button>
          <div className="chat-title"><h1>Crop Advisor AI Assistant</h1><small>{health?.ai_ready ? `Powered by ${health.chat_model}${health.provider?.startsWith('ollama:') ? ' · open-source' : ''}` : 'Knowledge-base mode'}</small></div>
          <div className="hide-mobile"><LanguagePicker /></div>
          <button type="button" className="hbtn" onClick={share} aria-label="Share conversation"><Share2 size={17} /></button>
          <button type="button" className="hbtn" onClick={clear} aria-label="Clear conversation"><Trash2 size={17} /></button>
        </header>

        <div className="chat-chips">
          <button type="button" onClick={() => setSheet('tools')}><Wrench size={15} /> Tools</button>
          <button type="button" onClick={() => setSheet('guides')}><BookOpen size={15} /> Guides</button>
          <button type="button" onClick={() => camIn.current.click()}><Camera size={15} /> Scan</button>
        </div>

        {scan && (
          <div className="ctx-chip"><Leaf size={14} /> Discussing: {scan.crop} scan · {scan.health_score}/100
            <button type="button" onClick={() => setChatScanId(null)} aria-label="Stop discussing this scan"><X size={14} /></button>
          </div>
        )}

        <div className="messages" aria-live="polite">
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.role === 'user' ? 'me' : 'bot'}`}>
              {m.role !== 'user' && <span className="avatar bot"><Tractor size={16} /></span>}
              <div className="bubble">
                {m.image && <img src={m.image} alt="Attached plant" />}
                {m.role === 'user' ? <p>{m.content}</p> : <Markdown text={m.content} />}
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
              <small className="muted">Try asking</small>
              {EXAMPLES.slice(0, 5).map((q) => <button type="button" key={q} onClick={() => send(q)}>{q}</button>)}
            </div>
          )}
          <div ref={end} />
        </div>

        {attachment && (
          <div className="attach-preview"><img src={attachment.url} alt="" /><span className="muted">Photo attached — ask a question or just send.</span>
            <button type="button" className="icon-btn" onClick={() => setAttachment(null)} aria-label="Remove photo"><X size={16} /></button>
          </div>
        )}

        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text) }}>
          <button type="button" className="clip" onClick={() => fileIn.current.click()} aria-label="Attach photo"><Paperclip size={19} /></button>
          <textarea
            value={text} rows={1} placeholder="Ask about crop care..." aria-label="Message"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}
          />
          <button type="submit" className={`send ${text.trim() || attachment ? 'on' : ''}`} disabled={sending || (!text.trim() && !attachment)} aria-label="Send"><Send size={17} /></button>
        </form>
        <input ref={fileIn} type="file" accept="image/*" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = '' }} />
        <input ref={camIn} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { attach(e.target.files?.[0]); e.target.value = '' }} />
      </div>

      <aside className="chat-side">{contextPanel}</aside>

      <Modal open={sheet === 'tools'} onClose={() => setSheet(null)} title="Tools">
        <Link to="/" className="q-row"><Camera size={16} /> New plant analysis</Link>
        <Link to={chatScanId ? `/fertilizer?analysis=${chatScanId}` : '/fertilizer'} className="q-row"><Wrench size={16} /> Fertilizer advisor</Link>
        <button type="button" className="q-row" onClick={() => { setSheet(null); fileIn.current.click() }}><Paperclip size={16} /> Attach a photo</button>
        {contextPanel}
      </Modal>
      <Modal open={sheet === 'guides'} onClose={() => setSheet(null)} title="Crop Guides">
        {guides.map((g) => <Link key={g.id} to={`/guides/${g.id}`} className="q-row"><BookOpen size={15} />{g.title}<small className="muted"> · {g.category}</small></Link>)}
      </Modal>
    </div>
  )
}
