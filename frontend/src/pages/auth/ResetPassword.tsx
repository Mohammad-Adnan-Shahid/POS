import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { passwordIssue } from '../../mockApi'

export default function ResetPassword() {
  const navigate = useNavigate()
  const email = new URLSearchParams(window.location.search).get('email') ?? ''
  const [step, setStep] = useState<'verify' | 'reset'>('verify')
  const [code, setCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!/^\d{6}$/.test(code)) return setError('Invalid verification code.')
    setBusy(true)
    try {
      // Markup: backend not implemented yet. Wire to POST /auth/verify-otp per contract.
      await new Promise((r) => setTimeout(r, 400))
      setResetToken('mock-reset-token')
      setInfo('Code verified. Set a new password.')
      setStep('reset')
      // TODO(backend): POST /api/v1/auth/verify-otp { email, code } → 200 reset_token | 401 INVALID_OTP
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const policy = passwordIssue(password)
    if (policy) return setError(policy)
    if (password !== confirmPassword) return setError('Passwords do not match')
    setBusy(true)
    try {
      // Markup: backend not implemented yet. Wire to POST /auth/reset-password per contract.
      await new Promise((r) => setTimeout(r, 400))
      alert('Password updated. You can now sign in.')
      navigate('/login')
      // TODO(backend): POST /api/v1/auth/reset-password { reset_token, password, confirm_password }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Reset password</h1>
        {email && <p className="subtitle">for {email}</p>}
        {error && <div className="alert error">{error}</div>}
        {info && <div className="alert success">{info}</div>}

        {step === 'verify' && (
          <form onSubmit={verifyOtp}>
            <div className="field">
              <label htmlFor="code">6-digit verification code</label>
              <input
                id="code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="mono"
                style={{ fontSize: 20, letterSpacing: 6, textAlign: 'center' }}
              />
              <div className="hint">Markup demo: any 6 digits works. Real impl emails an OTP (10 min TTL, 5 attempts).</div>
            </div>
            <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={resetPassword}>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="hint">Min 8 chars, with at least one letter, one digit, one special character.</div>
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        <p className="alt">
          <Link to="/login">← Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
