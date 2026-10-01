import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import * as api from '../../mockApi'
import type { PendingApproval } from '../../types'

export default function ApprovalsQueue() {
  const { token } = useAuth()
  const [rows, setRows] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    api
      .pendingApprovals(token)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Approvals Queue</h1>
          <p className="sub">PRs pending your role at the current step (002-approval-workflow US4)</p>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="page-loading">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Queue is empty — no PRs pending your approval. 🎉</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Request #</th>
                <th>Category</th>
                <th>Requester</th>
                <th className="num">Total</th>
                <th>Step</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><Link className="mono" to={`/purchase-requests/${p.id}`}>{p.request_number}</Link></td>
                  <td>{p.category.replace(/_/g, ' ')}</td>
                  <td>{p.requester_name}</td>
                  <td className="num">{p.total.toLocaleString()}</td>
                  <td>{p.current_step} of {p.total_steps}</td>
                  <td><span className={`badge ${p.status}`}>{p.status.replace(/_/g, ' ')}</span></td>
                  <td><Link className="btn sm" to={`/purchase-requests/${p.id}`}>Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
