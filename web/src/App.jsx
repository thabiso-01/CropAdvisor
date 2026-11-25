import { BookOpen, Bot, Clock3, Cpu, FlaskConical, Home, LineChart, RefreshCw, Sprout, Star } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router'

import { api } from './api.js'
import Analysis from './pages/Analysis.jsx'
import Analytics from './pages/Analytics.jsx'
import Assistant from './pages/Assistant.jsx'
import Fertilizer from './pages/Fertilizer.jsx'
import { GuideDetail, Guides } from './pages/Guides.jsx'
import HomePage from './pages/Home.jsx'
import ScanList from './pages/ScanList.jsx'
import { useStore } from './store.jsx'
import { Empty } from './ui.jsx'

const NAV = [
  { to: '/', label: 'Scan Plant', short: 'Home', Icon: Home, mobile: true },
  { to: '/history', label: 'History', Icon: Clock3, mobile: true },
  { to: '/analytics', label: 'Analytics', Icon: LineChart, mobile: true },
  { to: '/favorites', label: 'Favorites', Icon: Star, mobile: true, badge: true },
  { to: '/assistant', label: 'AI Assistant', short: 'Chat', Icon: Bot, mobile: true },
  { to: '/fertilizer', label: 'Fertilizer Advisor', Icon: FlaskConical },
  { to: '/guides', label: 'Crop Guides', Icon: BookOpen },
]

const STATE_TEXT = {
  ready: 'Ready', downloading: 'Downloading…', queued: 'Queued', unavailable: 'Offline', missing: 'Needs setup',
  disabled: 'Off', unknown: 'Checking…',
}
const stateCls = (st) => (st === 'ready' ? 'good' : ['downloading', 'queued', 'unknown'].includes(st) ? 'warn' : 'critical')

function AiStatus({ compact }) {
  const { health, refreshHealth } = useStore()
  const down = !health || health.status === 'down'
  const isOllama = health?.provider?.startsWith('ollama:')
  const missingSetup = health?.model_status === 'missing'
  const chat = isOllama ? health.models?.chat ?? {} : { state: health?.ai_ready ? 'ready' : missingSetup ? 'missing' : 'disabled', detail: health?.model_detail }
  const vision = isOllama ? health.models?.vision ?? {} : { state: health?.vision_ready ? 'ready' : missingSetup ? 'missing' : 'disabled' }
  const engineName = health?.provider?.startsWith('gemini:') ? 'Google Gemini Flash' :
    health?.provider?.startsWith('claude:') ? 'Anthropic Claude' : 'AI engine'
  const recheck = () => api.recheckModel().catch(() => {}).finally(() => setTimeout(refreshHealth, 1500))

  if (compact) {
    const st = down ? 'unavailable' : chat.state
    const label = down ? 'Server offline' : st === 'ready' ? `AI ready · ${health.chat_model}` : `AI ${STATE_TEXT[st] ?? st}`
    return <span className={`ai-pill ${stateCls(st)}`} title={chat.detail}><i />{label}</span>
  }
  return (
    <div className="ai-card">
      <div className="ai-card-top"><Cpu size={16} /><span>{isOllama ? 'Open-source AI · Ollama' : engineName}</span></div>
      {down ? (
        <div className="ai-pill critical"><i />Server unreachable</div>
      ) : (
        <>
          <div className="ai-row"><span>Chat</span><b>{health.chat_model ?? 'Knowledge base'}</b><span className={`ai-pill ${stateCls(chat.state)}`}><i />{STATE_TEXT[chat.state] ?? chat.state}</span></div>
          <div className="ai-row"><span>Photos</span><b>{health.vision_model ?? 'Leaf colour'}</b><span className={`ai-pill ${stateCls(vision.state)}`}><i />{STATE_TEXT[vision.state] ?? vision.state}</span></div>
          {!health.ai_ready && <small className="muted">{chat.detail || 'Using the built-in knowledge base until the model is ready.'}</small>}
          {health.ai_ready && !health.vision_ready && isOllama && <small className="muted">Photos are analysed from your notes and leaf colour until the photo model is ready.</small>}
        </>
      )}
      {(down || (isOllama && (!health?.ai_ready || !health?.vision_ready))) && (
        <button type="button" className="link-btn" onClick={recheck}><RefreshCw size={13} /> Check again</button>
      )}
    </div>
  )
}

export default function App() {
  const { favCount } = useStore()
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const chatPage = pathname.startsWith('/assistant')

  return (
    <div className={`shell ${chatPage ? 'is-chat' : ''}`}>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark"><Sprout size={22} /></span>
          <span><b>Crop Advisor AI</b><small>Digital Kisan Advisor</small></span>
        </NavLink>
        <nav aria-label="Main">
          {NAV.map(({ to, label, Icon, badge }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `side-link ${isActive || (to === '/' && pathname.startsWith('/analysis')) ? 'active' : ''}`}>
              <Icon size={19} /><span>{label}</span>
              {badge && favCount > 0 && <em>{favCount}</em>}
            </NavLink>
          ))}
        </nav>
        <AiStatus />
      </aside>

      <div className="main">
        <div className="mobile-ai"><AiStatus compact /></div>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analysis/:id" element={<Analysis />} />
          <Route path="/history" element={<ScanList />} />
          <Route path="/favorites" element={<ScanList favorites />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/fertilizer" element={<Fertilizer />} />
          <Route path="/guides" element={<Guides />} />
          <Route path="/guides/:id" element={<GuideDetail />} />
          <Route path="*" element={<Empty icon={Sprout} title="Page not found" text="That page doesn't exist." />} />
        </Routes>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.filter((n) => n.mobile).map(({ to, label, short, Icon, badge }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive || (to === '/' && pathname.startsWith('/analysis')) ? 'active' : '')}>
            <span className="bn-icon"><Icon size={21} />{badge && favCount > 0 && <em>{favCount}</em>}</span>
            <span>{short ?? label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
