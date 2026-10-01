import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import * as api from '../../mockApi'
import type { Paginated, PurchaseRequest } from '../../types'

const STATUSES = ['draft', 'submitted', 'under_review', 'on_hold', 'approved', 'rejected', 'cancelled', 'purchase_ordered']

export default function PRList() {
  const { token, hasPermission } = useAuth()
  const [result, setResult] = useState<Paginated<PurchaseRequest> | null>(null)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!token) return
    api.listPRs(token, { status: status || undefined, page, per_page: 10 }).then(setResult).catch(() => {})
  }, [token, status, page])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Purchase Requests</h1>
          <p className="sub">All org requests, newest first — filter by status (001-purchase-request US4)</p>
        </div>
        {hasPermission('purchase_request.create') && (
          <Link className="btn" to="/purchase-requests/new">+ New Purchase Request</Link>
        )}
      </div>

      <div className="toolbar">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {result && <span className="muted">{result.meta.total} request(s)</span>}
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Request #</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Requester</th>
              <th>Created</th>
              <th className="num">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(result?.data ?? []).map((pr) => (
              <tr key={pr.id} className="clickable">
                <td><Link to={`/purchase-requests/${pr.id}`} className="mono">{pr.request_number}</Link></td>
                <td>{pr.category.replace(/_/g, ' ')}</td>
                <td><span className={`badge priority-${pr.priority}`}>{pr.priority}</span></td>
                <td>{pr.requester_name}</td>
                <td>{new Date(pr.created_at).toLocaleDateString()}</td>
                <td className="num">{pr.total.toLocaleString()}</td>
                <td><span className={`badge ${pr.status}`}>{pr.status.replace(/_/g, ' ')}</span></td>
              </tr>
            ))}
            {result && result.data.length === 0 && (
              <tr><td colSpan={7} className="empty">No purchase requests match this filter.</td></tr>
            )}
          </tbody>
        </table>
        {result && result.meta.total_pages > 1 && (
          <div className="flex-between mt">
            <button className="btn secondary sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="muted">Page {result.meta.page} of {result.meta.total_pages}</span>
            <button className="btn secondary sm" disabled={page >= result.meta.total_pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  )
}
