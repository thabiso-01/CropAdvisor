import { Eye, EyeOff, Lock, Phone, Sprout, User } from 'lucide-react'
import { useState } from 'react'

import { api } from '../api.js'
import field from '../assets/field.jpg'
import { useStore } from '../store.jsx'
import { ErrorBox, LanguagePicker } from '../ui.jsx'

const MIN_PASSWORD = 8

/** Sign in, or create an account, with a phone number or email address and a password. */
export default function Login() {
  const { signIn, t } = useStore()
  const [mode, setMode] = useState('signin') // 'signin' | 'create'
  const [name, setName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const creating = mode === 'create'

  const switchMode = (m) => { setMode(m); setErr(''); setPassword(''); setConfirm('') }

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (creating && password.length < MIN_PASSWORD) return setErr(t('auth.tooShort'))
    if (creating && password !== confirm) return setErr(t('auth.mismatch'))
    setBusy(true)
    try {
      signIn(creating ? await api.register(name.trim(), identifier.trim(), password) : await api.login(identifier.trim(), password))
    } catch (ex) {
      setErr(authError(t, ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-art" style={{ backgroundImage: `url(${field})` }} aria-hidden="true" />
      <main className="auth-main">
        <div className="auth-top"><LanguagePicker /></div>
        <div className="auth-card">
          <div className="auth-brand"><span className="brand-mark"><Sprout size={24} /></span><b>{t('app.name')}</b></div>
          <h1>{creating ? t('auth.createTitle') : t('auth.welcome')}</h1>
          <p className="muted">{t('auth.tagline')}</p>

          <div className="tabs auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!creating} className={!creating ? 'active' : ''} onClick={() => switchMode('signin')}>{t('auth.signIn')}</button>
            <button type="button" role="tab" aria-selected={creating} className={creating ? 'active' : ''} onClick={() => switchMode('create')}>{t('auth.createAccount')}</button>
          </div>

          <form className="auth-form" onSubmit={submit} noValidate>
            {creating && (
              <label className="field">
                <span>{t('auth.name')}</span>
                <span className="input-icon"><User size={18} />
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
                </span>
              </label>
            )}
            <label className="field">
              <span>{t('auth.identifier')}</span>
              <span className="input-icon"><Phone size={18} />
                <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" inputMode="email"
                  placeholder={t('auth.identifierHint')} required maxLength={254} />
              </span>
            </label>
            <label className="field">
              <span>{t('auth.password')} {creating && <small className="muted">{t('auth.passwordHint')}</small>}</span>
              <span className="input-icon"><Lock size={18} />
                <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={creating ? 'new-password' : 'current-password'} required minLength={creating ? MIN_PASSWORD : 1} maxLength={128} />
                <button type="button" className="eye" onClick={() => setShow((v) => !v)} aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {creating && (
              <label className="field">
                <span>{t('auth.confirmPassword')}</span>
                <span className="input-icon"><Lock size={18} />
                  <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required maxLength={128} />
                </span>
              </label>
            )}

            {err && <ErrorBox message={err} />}

            <button type="submit" className="btn auth-submit" disabled={busy || !identifier.trim() || !password || (creating && !name.trim())}>
              {busy ? t('auth.working') : creating ? t('auth.createAccount') : t('auth.signIn')}
            </button>
          </form>

          <p className="auth-switch">
            {creating ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <button type="button" className="link-btn" onClick={() => switchMode(creating ? 'signin' : 'create')}>
              {creating ? t('auth.signIn') : t('auth.createAccount')}
            </button>
          </p>
          <p className="muted small auth-privacy">{t('auth.privacy')}</p>
        </div>
      </main>
    </div>
  )
}

/** Translated messages for the errors the account endpoints return. */
function authError(t, e) {
  if (e?.code === 'network') return t('error.network')
  if (e?.status === 401) return t('auth.wrong')
  if (e?.status === 409) return t('auth.exists')
  if (e?.status === 429) return t('error.tooMany')
  if (e?.status === 400 && /phone|email/i.test(e.message)) return t('auth.badIdentifier')
  if (e?.status === 422) return t('auth.tooShort')
  return e?.message ?? String(e)
}
