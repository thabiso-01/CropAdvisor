import { useRef, useState } from 'react'
import {
  ArrowLeft,
  Bot,
  Camera,
  ChevronLeft,
  CircleUserRound,
  Clock3,
  Home,
  Languages,
  LineChart,
  Mic,
  Plus,
  Send,
  Sprout,
  Star,
  Wifi,
} from 'lucide-react'
import fieldImg from './assets/field.jpg'
import seedlingImg from './assets/seedling.jpg'
import './App.css'

const navItems = [
  { label: 'Home', icon: Home },
  { label: 'History', icon: Clock3 },
  { label: 'Analytics', icon: LineChart },
  { label: 'Favorites', icon: Star },
  { label: 'Chat', icon: Bot },
]

function StatusBar() {
  return (
    <div className="status-bar" aria-hidden="true">
      <span>17:48</span>
      <div className="status-icons">
        <span className="signal"><i /><i /><i /><i /></span>
        <Wifi size={12} strokeWidth={2.4} />
        <span className="battery" />
      </div>
    </div>
  )
}

function BottomNav({ active = 'Home', onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {navItems.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          className={active === label ? 'active' : ''}
          onClick={() => onChange?.(label)}
        >
          <span className="nav-icon-wrap"><Icon size={17} strokeWidth={1.9} /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

function PhoneFrame({ children, className = '' }) {
  return (
    <div className={`phone ${className}`}>
      <StatusBar />
      <div className="phone-screen">{children}</div>
      <div className="home-indicator" />
    </div>
  )
}

function ChatScreen() {
  const [activeNav, setActiveNav] = useState('Chat')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    { from: 'bot', text: 'Hello! I’m your Crop Advisor AI Assistant. I can help with plant disease identification, nutrient management, watering advice, and crop care recommendations. How can I assist you today?' },
    { from: 'user', text: 'How do I treat tomato blight?' },
    { from: 'bot', text: 'As a crop advisor and plant health expert, I understand your concern about tomato blight. It’s one of the most common and devastating diseases for tomato growers. The key to effective treatment lies in accurate identification, swift action, and robust prevention. Let’s break down how to treat it.' },
  ])

  function sendMessage() {
    const text = message.trim()
    if (!text) return
    setMessages((current) => [...current, { from: 'user', text }])
    setMessage('')
  }

  return (
    <PhoneFrame>
      <header className="chat-header">
        <button type="button" aria-label="Go back"><ChevronLeft size={20} /></button>
        <h1>Crop Advisor AI Assistant</h1>
        <div className="header-actions">
          <Languages size={18} />
          <Bot size={18} />
        </div>
      </header>
      <div className="chat-tools">
        <button type="button"><Sprout size={14} /> Tools</button>
        <button type="button"><LineChart size={14} /> Guides</button>
        <button type="button"><Camera size={14} /> Scan</button>
      </div>
      <main className="chat-content">
        {messages.map((item, index) => (
          item.from === 'bot' ? (
            <div className="bot-row" key={index}>
              {index === 0 && <span className="mini-bot"><Sprout size={12} /></span>}
              <div className="bubble bot-bubble">{item.text}</div>
            </div>
          ) : (
            <div className="user-row" key={index}>
              <div className="bubble user-bubble">{item.text}</div>
              <CircleUserRound size={17} className="user-avatar" />
            </div>
          )
        ))}
      </main>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage() }}>
        <Mic size={16} />
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask about crops..."
          aria-label="Chat message"
        />
        <button type="submit" aria-label="Send message"><Send size={16} /></button>
      </form>
      <BottomNav active={activeNav} onChange={setActiveNav} />
    </PhoneFrame>
  )
}

function AnalysisScreen() {
  const [tab, setTab] = useState('Overview')
  const [analyzed, setAnalyzed] = useState(false)
  const [activeNav, setActiveNav] = useState('Home')
  const fileRef = useRef(null)

  function handleFile(event) {
    const file = event.target.files?.[0]
    if (file) setAnalyzed(true)
  }

  return (
    <PhoneFrame>
      <header className="page-header">
        <button type="button" aria-label="Go back"><ArrowLeft size={19} /></button>
        <div>
          <h1>Crop Advisor AI</h1>
          <p>Digital Kisan Advisor</p>
        </div>
        <button type="button" aria-label="Translate"><Languages size={17} /></button>
      </header>
      <main className="analysis-content">
        <div className="plant-photo">
          <img src={analyzed ? seedlingImg : fieldImg} alt="Crop field analysis" />
        </div>
        <div className="tabs" role="tablist">
          {['Overview', 'Treatment', 'Details'].map((name) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={tab === name ? 'active' : ''}
              key={name}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <section className="guide-card">
          <h2>{tab === 'Overview' ? 'Treatment Guide' : tab === 'Treatment' ? 'Treatment Steps' : 'Plant Details'}</h2>
          {tab === 'Details' ? (
            <div className="detail-list">
              <p><strong>Crop:</strong> Tomato</p>
              <p><strong>Health:</strong> 78%</p>
              <p><strong>Stage:</strong> Vegetative</p>
            </div>
          ) : (
            <div className="guide-body">
              <p>
                {tab === 'Overview'
                  ? 'Based on the identified issue, here’s a general guide to help you treat your crops.'
                  : 'Remove affected leaves, improve airflow, and apply an approved copper fungicide according to label instructions.'}
              </p>
              {tab === 'Overview' && (
                <ol>
                  <li><span>1</span><div><strong>Identify the Problem</strong><small>Carefully examine the affected parts to understand the full extent of the issue.</small></div></li>
                </ol>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
          <button className="analyze-button" type="button" onClick={() => fileRef.current?.click()}>
            <Camera size={15} /> Analyze Again
          </button>
        </section>
      </main>
      <BottomNav active={activeNav} onChange={setActiveNav} />
    </PhoneFrame>
  )
}

function FertilizerScreen() {
  const [activeNav, setActiveNav] = useState('Favorites')
  const [ratio, setRatio] = useState([10, 10, 10])
  const fileRef = useRef(null)

  function adjustRatio(index) {
    setRatio((current) => current.map((value, i) => i === index ? Math.min(value + 1, 20) : value))
  }

  return (
    <PhoneFrame>
      <header className="page-header">
        <button type="button" aria-label="Go back"><ArrowLeft size={19} /></button>
        <div>
          <h1>Fertilizer Advisor</h1>
          <p>AI-Powered Recommendations</p>
        </div>
        <button type="button" aria-label="Translate"><Languages size={17} /></button>
      </header>
      <main className="fertilizer-content">
        <div className="plant-photo">
          <img src={seedlingImg} alt="Healthy seedling" />
        </div>
        <div className="simple-tabs">
          <button type="button" className="active">Overview</button>
          <button type="button">Details</button>
        </div>
        <section className="recommendation-card">
          <h2>Recommended Fertilizer</h2>
          <p>Balanced NPK granular fertilizer (e.g., 10-10-10 or similar)</p>
        </section>
        <section className="ratio-card">
          <h2>NPK Ratio</h2>
          <div className="nutrients">
            {[
              ['Nitrogen (N)', ratio[0]],
              ['Phosphorus (P)', ratio[1]],
              ['Potassium (K)', ratio[2]],
            ].map(([label, value], index) => (
              <div className="nutrient" key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
                <button type="button" aria-label={`Increase ${label}`} onClick={() => adjustRatio(index)}>
                  <Plus size={12} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <input ref={fileRef} type="file" accept="image/*" hidden />
        <button className="analyze-button" type="button" onClick={() => fileRef.current?.click()}>
          <Camera size={15} /> Analyze Again
        </button>
      </main>
      <BottomNav active={activeNav} onChange={setActiveNav} />
    </PhoneFrame>
  )
}

function App() {
  return (
    <main className="showcase">
      <ChatScreen />
      <AnalysisScreen />
      <FertilizerScreen />
    </main>
  )
}

export default App
