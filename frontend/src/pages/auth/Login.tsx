import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

const DEMO_ACCOUNTS: { email: string; password: string; label: string }[] = [
  { email: 'demo.admin@demoorg.com', password: 'Secret@123', label: 'Org Admin' },
  { email: 'coord.one@demoorg.com', password: 'Coord@123', label: 'Coordinator' },
  { email: 'apr.one@demoorg.com', password: 'Apr@123456', label: 'Approver (Manager)' },
  { email: 'apr.two@demoorg.com', password: 'Apr@123456', label: 'Approver (Finance)' },
  { email: 'fin.one@demoorg.com', password: 'Fin@123456', label: 'Finance Manager' },
  { email: 'aud.one@demoorg.com', password: 'Aud@123456', label: 'Auditor' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim()) return setError('Email is required')
    if (!email.includes('@')) return setError('Email must include @ (e.g. you@company.com)')
    if (!password) return setError('Password is required')
    setBusy(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const fill = (acc: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(acc.email)
    setPassword(acc.password)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>POS Procurement</h1>
        <p className="subtitle">Multi-Tenant Procurement & Financial Controls</p>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="alt">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <div className="demo-note">
          <strong>Markup demo</strong> — no signup (per 004-auth quickstart; first org via bootstrap CLI).
          Click to fill demo logins:
          <div className="btn-row mt">
            {DEMO_ACCOUNTS.map((acc) => (
              <button key={acc.email} type="button" className="btn secondary sm" onClick={() => fill(acc)}>
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
 )
}
