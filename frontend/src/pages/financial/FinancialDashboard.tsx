import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import * as api from '../../mockApi'
import type { FinancialCommitment, FinancialValidation } from '../../types'

export default function FinancialDashboard() {
  const { token, hasPermission } = useAuth()
  const [data, setData] = useState<FinancialValidation & { budget_utilization: { category: string; allocated: number; remaining: number; warning: string }[] } | null>(null)
  const [commitments, setCommitments] = useState<FinancialCommitment[]>([])
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [releaseFor, setReleaseFor] = useState<string | null>(null)
  const [releaseAmount, setReleaseAmount] = useState('')
  const [releaseReason, setReleaseReason] = useState('')
  const canManageFunds = hasPermission('financial.manage_current_funds')
  const canAdjust = hasPermission('commitment.adjust')

  const refresh = useCallback(() => {
    if (!token) return
    api.financialDashboard(token).then(setData).catch(() => {})
    api.listCommitments(token).then(setCommitments).catch(() => {})
  }, [token])

  useEffect(refresh, [refresh])

  const enterFunds = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setInfo(null)
    if (!amount || Number(amount) === 0) return setError('Amount is required')
    if (!reason.trim()) return setError('A reason is required (audit-logged)')
    try {
      await api.enterFunds(token!, Number(amount), reason)
      setInfo('Funds updated and audit-logged.')
      setAmount(''); setReason('')
      refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const release = async (id: string) => {
    setError(null); setInfo(null)
    if (!releaseAmount || Number(releaseAmount) <= 0) return setError('Release amount must be positive')
    if (!releaseReason.trim()) return setError('A reason is required')
    try {
      const c = await api.releaseCommitment(token!, id, Number(releaseAmount), releaseReason)
      setInfo(`Commitment ${c.status.replace(/_/g, ' ')} — remaining ${c.remaining_amount.toLocaleString()}.`)
      setReleaseFor(null); setReleaseAmount(''); setReleaseReason('')
      refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Financial Dashboard</h1>
          <p className="sub">Available = Current Funds − Commitments − Obligations − Pending Payments (003-financial-engine FR-001)</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert success">{info}</div>}

      {data && (
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Current Funds</div>
            <div className="value">{data.current_funds.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="label">Commitments</div>
            <div className="value warn">{data.commitments.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="label">Obligations / Pending Payments</div>
            <div className="value">0 <span className="muted" style={{ fontSize: 12 }}>(modules not built)</span></div>
          </div>
          <div className="stat">
            <div className="label">Available Funds</div>
            <div className={data.available < 0 ? 'value critical' : data.available < data.current_funds * 0.2 ? 'value warn' : 'value ok'}>
              {data.available.toLocaleString()}
            </div>
          </div>
        </div>
      )}
      {data && data.risk_level === 'critical' && (
        <div className="alert error">⚠ Critical: available funds are negative — approvals will require an exception (FR-005/FR-009).</div>
      )}

      {canManageFunds && (
        <div className="card">
          <h2>Enter / update current funds</h2>
          <div className="demo-note">Manual entry per spec (bank feed = future scope). Every entry needs a mandatory reason and is audit-logged (FR-012/FR-013).</div>
          <form onSubmit={enterFunds}>
            <div className="form-row">
              <div className="field">
                <label htmlFor="fund-amount">Amount (added to current funds)</label>
                <input id="fund-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="fund-reason">Reason</label>
                <input id="fund-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Q1 top-up" />
              </div>
            </div>
            <button className="btn" type="submit">Record funds</button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Commitments</h2>
        <table className="table">
          <thead>
            <tr><th>Request #</th><th className="num">Amount</th><th className="num">Released</th><th className="num">Remaining</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {commitments.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.request_number ?? c.entity_id}</td>
                <td className="num">{c.amount.toLocaleString()}</td>
                <td className="num">{c.released_amount.toLocaleString()}</td>
                <td className="num">{c.remaining_amount.toLocaleString()}</td>
                <td><span className={`badge ${c.status}`}>{c.status.replace(/_/g, ' ')}</span></td>
                <td>
                  {canAdjust && c.status !== 'fully_released' && (
                    <button className="btn secondary sm" onClick={() => { setReleaseFor(c.id); setReleaseAmount(''); setReleaseReason('') }}>
                      Release
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {commitments.length === 0 && <tr><td colSpan={6} className="empty">No commitments yet — created automatically on final approval (FR-003).</td></tr>}
          </tbody>
        </table>

        {releaseFor && (
          <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <h3>Partial / full release</h3>
            <div className="form-row">
              <div className="field">
                <label>Amount</label>
                <input type="number" min={0} value={releaseAmount} onChange={(e) => setReleaseAmount(e.target.value)} />
              </div>
              <div className="field">
                <label>Reason</label>
                <input value={releaseReason} onChange={(e) => setReleaseReason(e.target.value)} placeholder="e.g. Partial payment made" />
              </div>
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => release(releaseFor)}>Release</button>
              <button className="btn secondary" onClick={() => setReleaseFor(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
