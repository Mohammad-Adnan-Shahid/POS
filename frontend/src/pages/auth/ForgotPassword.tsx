import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!email.trim()) return setError('Email is required')
    setBusy(true)
    try {
      // Markup: backend + SMTP not implemented yet. Wire to POST /auth/forgot-password per contract.
      await new Promise((r) => setTimeout(r, 400))
      setInfo('A verification code has been sent to your email.')
      setTimeout(() => navigate(`/reset-password?email=${encodeURIComponent(email)}`), 800)
      // TODO(backend): POST /api/v1/auth/forgot-password { email } → 200 message | 404 EMAIL_NOT_FOUND
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Forgot password</h1>
        <p className="subtitle">Enter your email to receive a 6-digit verification code</p>
        {error && <div className="alert error">{error}</div>}
        {info && <div className="alert success">{info}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Sending…' : 'Send verification code'}
          </button>
        </form>
        <p className="alt">
          <Link to="/login">← Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
