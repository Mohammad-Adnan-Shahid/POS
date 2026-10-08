import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import * as api from '../../mockApi'
import type { RoleName } from '../../types'
import CreateGrantModule from './modules/CreateGrantModule'
import ApproverModule from './modules/ApproverModule'

type Assignable = { id: string; name: string; email: string; role: RoleName; permissions: string[]; is_active: boolean }

/**
 * 005-roles assignment screen: pick a user first (step 1), then two modules inside
 * that user's panel — Module 1: create-PR grant, Module 2: approver assignments (read-only).
 */
export default function RoleAssignments() {
  const { token, user: me, hasPermission } = useAuth()
  const [users, setUsers] = useState<Assignable[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const canAssign = hasPermission('user.manage')

  const refresh = useCallback(() => {
    if (!token || !canAssign) return
    api
      .listAssignables(token)
      .then((list) => {
        setUsers(list)
        // Keep the selection valid; default to the first user that isn't us.
        setSelectedId((current) => {
          if (current && list.some((u) => u.id === current)) return current
          return list.find((u) => u.id !== me?.id)?.id ?? list[0]?.id ?? null
        })
      })
      .catch((e) => setError((e as Error).message))
  }, [token, canAssign, me?.id])

  useEffect(refresh, [refresh])

  const selected = users.find((u) => u.id === selectedId) ?? null

  const onResult = (ok: boolean, message: string) => {
    if (ok) {
      setError(null)
      setInfo(message)
    } else {
      setInfo(null)
      setError(message)
    }
    refresh()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Roles &amp; Assignments</h1>
          <p className="sub">Pick a user, then manage their two assignments: create PR + approve PR (005-roles)</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert success">{info}</div>}
      {!canAssign && <div className="alert info">Read-only view — the `user.manage` permission is required to make assignments.</div>}

      {/* Step 1 — pick the user */}
      <div className="card">
        <h2>1. Choose a user</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Create PR</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const granted = u.permissions.includes('*') || u.permissions.includes('purchase_request.create')
              return (
                <tr
                  key={u.id}
                  className="clickable"
                  style={u.id === selectedId ? { background: 'var(--bg)' } : undefined}
                  onClick={() => { setSelectedId(u.id); setInfo(null); setError(null) }}
                >
                  <td>
                    <strong>{u.name}</strong>
                    {u.id === me?.id && <span className="muted"> (you)</span>}
                    {u.id === selectedId && <span className="badge submitted" style={{ marginLeft: 8 }}>selected</span>}
                  </td>
                  <td className="muted">{u.email}</td>
                  <td>{u.role.replace(/_/g, ' ')}</td>
                  <td>{u.is_active ? <span className="badge active">active</span> : <span className="badge cancelled">inactive</span>}</td>
                  <td>{granted ? <span className="badge approved">granted</span> : <span className="badge draft">not granted</span>}</td>
                </tr>
              )
            })}
            {users.length === 0 && <tr><td colSpan={5} className="empty">Loading users…</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Step 2 — the two modules inside the selected user */}
      {selected && (
        <>
          <CreateGrantModule target={selected} onResult={onResult} />
          <ApproverModule target={selected} users={users} onResult={onResult} />
        </>
      )}
    </div>
  )
}
