import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import * as api from '../mockApi'
import type { FinancialPosition, Paginated, PurchaseRequest, PendingApproval } from '../types'

export default function Dashboard() {
  const { token, user } = useAuth()
  const [funds, setFunds] = useState<FinancialPosition | null>(null)
  const [prs, setPrs] = useState<Paginated<PurchaseRequest> | null>(null)
  const [pending, setPending] = useState<PendingApproval[]>([])

  useEffect(() => {
    if (!token) return
    api.availableFunds(token).then(setFunds).catch(() => {})
    api.listPRs(token, { per_page: 5 }).then(setPrs).catch(() => {})
    api.pendingApprovals(token).then(setPending).catch(() => {})
  }, [token])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Welcome back, {user?.name} — role: {user?.role.replace(/_/g, ' ')}</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">Current Funds</div>
          <div className="value">{funds ? funds.current_funds.toLocaleString() : '—'}</div>
        </div>
        <div className="stat">
          <div className="label">Commitments</div>
          <div className="value warn">{funds ? funds.commitments.toLocaleString() : '—'}</div>
        </div>
        <div className="stat">
          <div className="label">Available Funds</div>
          <div className={funds ? (funds.available < 0 ? 'value critical' : funds.available < funds.current_funds * 0.2 ? 'value warn' : 'value ok') : 'value'}>
            {funds ? funds.available.toLocaleString() : '—'}
          </div>
        </div>
        <div className="stat">
          <div className="label">Pending My Approval</div>
          <div className="value">{pending.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="flex-between">
          <h2>Recent Purchase Requests</h2>
          <Link to="/purchase-requests">View all →</Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Request #</th>
              <th>Category</th>
              <th>Requester</th>
              <th className="num">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(prs?.data ?? []).map((pr) => (
              <tr key={pr.id} className="clickable" onClick={() => (window.location.href = `/purchase-requests/${pr.id}`)}>
                <td className="mono">{pr.request_number}</td>
                <td>{pr.category.replace(/_/g, ' ')}</td>
                <td>{pr.requester_name}</td>
                <td className="num">{pr.total.toLocaleString()}</td>
                <td><span className={`badge ${pr.status}`}>{pr.status.replace(/_/g, ' ')}</span></td>
              </tr>
            ))}
            {prs && prs.data.length === 0 && (
              <tr><td colSpan={5} className="empty">No purchase requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
