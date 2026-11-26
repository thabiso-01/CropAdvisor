import { BookOpen, Bot, Clock3, Cpu, FlaskConical, Home, LineChart, LogOut, RefreshCw, Sprout, Star } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router'

import Analysis from './pages/Analysis.jsx'
import Analytics from './pages/Analytics.jsx'
import Assistant from './pages/Assistant.jsx'
import Fertilizer from './pages/Fertilizer.jsx'
import { GuideDetail, Guides } from './pages/Guides.jsx'
import HomePage from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import ScanList from './pages/ScanList.jsx'
import { useStore } from './store.jsx'
import { Empty } from './ui.jsx'

// labels are translation keys
const NAV = [
  { to: '/', label: 'nav.scan', short: 'nav.scanShort', Icon: Home, mobile: true },
  { to: '/history', label: 'nav.history', Icon: Clock3, mobile: true },
  { to: '/analytics', label: 'nav.analytics', Icon: LineChart, mobile: true },
  { to: '/favorites', label: 'nav.favorites', Icon: Star, mobile: true, badge: true },
  { to: '/assistant', label: 'nav.assistant', short: 'nav.assistantShort', Icon: Bot, mobile: true },
  { to: '/fertilizer', label: 'nav.fertilizer', Icon: FlaskConical },
  { to: '/guides', label: 'nav.guides', Icon: BookOpen },
]

const STATE_TEXT = {
  ready: 'ai.ready', unavailable: 'ai.offline', missing: 'ai.needsSetup',
  disabled: 'ai.off', unknown: 'ai.checking',
}
const stateCls = (st) => (st === 'ready' ? 'good' : st === 'unknown' ? 'warn' : 'critical')

function AiStatus({ compact }) {
  const { health, refreshHealth, t } = useStore()
  const stateText = (st) => (STATE_TEXT[st] ? t(STATE_TEXT[st]) : st)
  const down = !health || health.status === 'down'
  const missingSetup = health?.model_status === 'missing'
  const chat = { state: health?.ai_ready ? 'ready' : missingSetup ? 'missing' : 'disabled', detail: health?.model_detail }
  const vision = { state: health?.vision_ready ? 'ready' : missingSetup ? 'missing' : 'disabled' }
  const engineName = health?.provider?.startsWith('gemini:') ? 'Google Gemini Flash' :
    health?.provider?.startsWith('claude:') ? 'Anthropic Claude' : t('ai.engine')

  if (compact) {
    const st = down ? 'unavailable' : chat.state
    const label = down ? t('ai.serverOffline') : st === 'ready' ? t('ai.readyWith', { model: health.chat_model }) : t('ai.state', { state: stateText(st) })
    return <span className={`ai-pill ${stateCls(st)}`} title={chat.detail}><i />{label}</span>
  }
  return (
    <div className="ai-card">
      <div className="ai-card-top"><Cpu size={16} /><span>{engineName}</span></div>
      {down ? (
        <div className="ai-pill critical"><i />{t('ai.serverUnreachable')}</div>
      ) : (
        <>
          <div className="ai-row"><span>{t('ai.chat')}</span><b>{health.chat_model ?? t('ai.knowledgeBase')}</b><span className={`ai-pill ${stateCls(chat.state)}`}><i />{stateText(chat.state)}</span></div>
          <div className="ai-row"><span>{t('ai.photos')}</span><b>{health.vision_model ?? t('ai.leafColour')}</b><span className={`ai-pill ${stateCls(vision.state)}`}><i />{stateText(vision.state)}</span></div>
          {!health.ai_ready && <small className="muted">{chat.detail || t('ai.usingKnowledgeBase')}</small>}
        </>
      )}
      {down && (
        <button type="button" className="link-btn" onClick={refreshHealth}><RefreshCw size={13} /> {t('ai.checkAgain')}</button>
      )}
    </div>
  )
}

function Account({ compact }) {
  const { user, signOut, t } = useStore()
  const out = () => { if (window.confirm(t('auth.signOutConfirm'))) signOut() }
  if (compact) {
    return <button type="button" className="icon-btn account-mini" onClick={out} aria-label={t('auth.signOut')} title={t('auth.signedInAs', { name: user.name })}><LogOut size={17} /></button>
  }
  return (
    <div className="account">
      <span className="avatar-circle" aria-hidden="true">{user.name.trim()[0]?.toUpperCase()}</span>
      <div><b>{user.name}</b><small className="muted">{user.identifier}</small></div>
      <button type="button" onClick={out} aria-label={t('auth.signOut')} title={t('auth.signOut')}><LogOut size={17} /></button>
    </div>
  )
}

export default function App() {
  const { favCount, user, t } = useStore()
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const chatPage = pathname.startsWith('/assistant')

  if (!user) return <Login />

  return (
    <div className={`shell ${chatPage ? 'is-chat' : ''}`}>
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <span className="brand-mark"><Sprout size={22} /></span>
          <span><b>{t('app.name')}</b></span>
        </NavLink>
        <nav aria-label="Main">
          {NAV.map(({ to, label, Icon, badge }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `side-link ${isActive || (to === '/' && pathname.startsWith('/analysis')) ? 'active' : ''}`}>
              <Icon size={19} /><span>{t(label)}</span>
              {badge && favCount > 0 && <em>{favCount}</em>}
            </NavLink>
          ))}
        </nav>
        <AiStatus />
        <Account />
      </aside>

      <div className="main">
        <div className="mobile-ai"><AiStatus compact /><Account compact /></div>
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
          <Route path="*" element={<Empty icon={Sprout} title={t('notFound.title')} text={t('notFound.text')} />} />
        </Routes>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.filter((n) => n.mobile).map(({ to, label, short, Icon, badge }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive || (to === '/' && pathname.startsWith('/analysis')) ? 'active' : '')}>
            <span className="bn-icon"><Icon size={21} />{badge && favCount > 0 && <em>{favCount}</em>}</span>
            <span>{t(short ?? label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
