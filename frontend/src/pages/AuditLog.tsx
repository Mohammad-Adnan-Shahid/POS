import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import * as api from '../mockApi'
import type { AuditEvent } from '../types'

export default function AuditLog() {
  const { token } = useAuth()
  const [rows, setRows] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    api
      .auditLog(token)
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Audit Log</h1>
          <p className="sub">Append-only trail of auth, procurement, approval and financial events</p>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="page-loading">Loading…</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Metadata</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.created_at).toLocaleString()}</td>
                  <td>{e.actor_name}</td>
                  <td><span className="mono">{e.action}</span></td>
                  <td className="mono">{e.entity_type}</td>
                  <td className="mono" style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>
                    {Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : '—'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="empty">No audit events yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
