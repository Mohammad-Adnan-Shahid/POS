import { useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import * as api from '../../../mockApi'

const CREATE_PERM = 'purchase_request.create'

/** 005-roles §5 — super admin grants/revokes `purchase_request.create` on the selected user. */
export default function CreateGrantModule({
  target,
  onResult,
}: {
  target: { id: string; name: string; permissions: string[]; is_active: boolean }
  onResult: (ok: boolean, message: string) => void
}) {
  const { token, user: me } = useAuth()
  const [busy, setBusy] = useState(false)

  const hasGrant = target.permissions.includes('*') || target.permissions.includes(CREATE_PERM)
  const isSelf = target.id === me?.id

  const toggle = async () => {
    setBusy(true)
    try {
      await api.setCreateGrant(token!, target.id, !hasGrant)
      onResult(
        true,
        `${!hasGrant ? 'Granted' : 'Revoked'} ${CREATE_PERM} for ${target.name}. ` +
          // auth-context.md §7.3 — the target's session holds a permissions snapshot.
          'They see the change at their next login.',
      )
    } catch (e) {
      onResult(false, (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>Module 1 — Create purchase request</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Per-user grant of <span className="mono">{CREATE_PERM}</span> (roles.md §5). Granted users see{' '}
        <strong>+ New Purchase Request</strong> on the Purchase Requests page.
      </p>

      <div className="toolbar">
        {hasGrant ? <span className="badge approved">granted</span> : <span className="badge draft">not granted</span>}
        {target.permissions.includes('*') && <span className="muted">wildcard — all permissions</span>}
        {!target.is_active && <span className="badge cancelled">inactive user</span>}
        <span style={{ flex: 1 }} />
        {isSelf ? (
          <span className="muted">You cannot change your own grant</span>
        ) : (
          <button className={`btn sm ${hasGrant ? 'danger' : ''}`} disabled={busy || !target.is_active} onClick={toggle}>
            {busy ? 'Saving…' : hasGrant ? 'Revoke' : 'Grant'}
          </button>
        )}
      </div>

      <div className="demo-note">
        Stored in <span className="mono">user.permissions[]</span> (roles.md §5.1 Option A). Every grant/revoke is written to the audit trail.
      </div>
    </div>
  )
}
