import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import * as api from '../../mockApi'
import { PR_CATEGORIES } from '../../types'
import type { ApprovalWorkflow, RoleName } from '../../types'

const ROLES: RoleName[] = ['approver', 'finance_manager', 'org_admin', 'dept_coordinator']

type Approver = { id: string; name: string; role: RoleName }

export default function ApprovalsWorkflows() {
  const { token, hasPermission } = useAuth()
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([])
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const canConfigure = hasPermission('approval.configure_workflow')

  const refresh = useCallback(() => {
    if (!token) return
    api.listWorkflows(token).then(setWorkflows).catch((e) => setError((e as Error).message))
  }, [token])

  useEffect(refresh, [refresh])

  useEffect(() => {
    if (!token || !canConfigure) return
    api.listApprovers(token).then(setApprovers).catch(() => {})
  }, [token, canConfigure])

  const createWorkflow = async () => {
    if (!newName.trim()) return
    setError(null)
    try {
      await api.createWorkflow(token!, { name: newName, description: '', is_active: true })
      setNewName('')
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Approval Workflow Config</h1>
          <p className="sub">Multi-step chains with authority limits and matching rules (002-approval-workflow US2)</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {!canConfigure && <div className="alert info">Read-only view — the `approval.configure_workflow` permission is required to modify workflows.</div>}

      {canConfigure && (
        <div className="card">
          <h2>Create workflow</h2>
          <div className="toolbar">
            <input
              placeholder="Workflow name (e.g. Urgent Procurement)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ minWidth: 280 }}
            />
            <button className="btn" onClick={createWorkflow}>Create</button>
          </div>
        </div>
      )}

      {workflows.map((wf) => (
        <div className="card" key={wf.id}>
          <div className="flex-between">
            <div>
              <h2 style={{ marginBottom: 2 }}>{wf.name}</h2>
              <span className="muted">{wf.description || 'No description'}</span>
            </div>
            <div className="btn-row">
              <span className={`badge ${wf.is_active ? 'active' : 'fully_released'}`}>{wf.is_active ? 'active' : 'inactive'}</span>
              {wf.rules.length === 0 && <span className="badge draft">default (matches all)</span>}
            </div>
          </div>

          <h3 className="mt">Steps</h3>
          <table className="table">
            <thead>
              <tr><th>Order</th><th>Approver</th><th>Assigned by</th><th className="num">Authority limit (max amount)</th></tr>
            </thead>
            <tbody>
              {wf.steps.map((s) => (
                <tr key={s.id}>
                  <td>{s.step_order}</td>
                  <td>{approverName(s.user_id, approvers)}</td>
                  <td className="muted">{s.user_id ? 'specific user' : s.role_id ? s.role_id.replace(/_/g, ' ') : '—'}</td>
                  <td className="num">{s.max_amount === null ? 'No limit' : s.max_amount.toLocaleString()}</td>
                </tr>
              ))}
              {wf.steps.length === 0 && <tr><td colSpan={4} className="empty">No steps configured.</td></tr>}
            </tbody>
          </table>
          {canConfigure && <AddStep workflowId={wf.id} nextOrder={wf.steps.length + 1} approvers={approvers} onDone={refresh} />}

          <h3 className="mt">Matching rules</h3>
          {wf.rules.length === 0 ? (
            <div className="muted">No rules — this workflow matches every PR (fallback).</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Min amount</th><th>Max amount</th><th>Category</th></tr>
              </thead>
              <tbody>
                {wf.rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.min_amount.toLocaleString()}</td>
                    <td>{r.max_amount === null ? '∞' : r.max_amount.toLocaleString()}</td>
                    <td>{r.category ? r.category.replace(/_/g, ' ') : 'any'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canConfigure && <AddRule workflowId={wf.id} onDone={refresh} />}
        </div>
      ))}
    </div>
  )
}

function approverName(userId: string | null, approvers: Approver[]): string {
  if (!userId) return '—'
  return approvers.find((a) => a.id === userId)?.name ?? userId
}

function AddStep({ workflowId, nextOrder, approvers, onDone }: { workflowId: string; nextOrder: number; approvers: Approver[]; onDone: () => void }) {
  const { token } = useAuth()
  const [assignment, setAssignment] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    setBusy(true)
    try {
      await api.addWorkflowStep(token!, workflowId, {
        step_order: nextOrder,
        // A specific approver wins; otherwise fall back to the chosen role.
        role_id: assignment.startsWith('user:') ? null : ((assignment.replace('role:', '') || 'approver') as RoleName),
        user_id: assignment.startsWith('user:') ? assignment.slice(5) : null,
        max_amount: maxAmount ? Number(maxAmount) : null,
      })
      setMaxAmount('')
      onDone()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="toolbar mt">
      <span className="muted">Add step #{nextOrder}:</span>
      <select value={assignment} onChange={(e) => setAssignment(e.target.value)}>
        <option value="">Choose approver…</option>
        <optgroup label="Specific approver">
          {approvers.map((a) => <option key={a.id} value={`user:${a.id}`}>{a.name} ({a.role.replace(/_/g, ' ')})</option>)}
        </optgroup>
        <optgroup label="Anyone with role">
          {ROLES.map((r) => <option key={r} value={`role:${r}`}>any {r.replace(/_/g, ' ')}</option>)}
        </optgroup>
      </select>
      <input type="number" min={0} placeholder="Max amount (blank = none)" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
      <button className="btn secondary sm" disabled={busy || !assignment} onClick={add}>+ Add step</button>
    </div>
  )
}

function AddRule({ workflowId, onDone }: { workflowId: string; onDone: () => void }) {
  const { token } = useAuth()
  const [minAmount, setMinAmount] = useState('0')
  const [maxAmount, setMaxAmount] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    setBusy(true)
    try {
      await api.addWorkflowRule(token!, workflowId, {
        min_amount: Number(minAmount || 0),
        max_amount: maxAmount ? Number(maxAmount) : null,
        category: category || null,
      })
      setMaxAmount('')
      onDone()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="toolbar mt">
      <span className="muted">Add rule:</span>
      <input type="number" min={0} placeholder="Min amount" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} style={{ width: 130 }} />
      <input type="number" min={0} placeholder="Max amount (blank = none)" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} style={{ width: 180 }} />
      <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Rule category">
        <option value="">any category</option>
        {PR_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
      </select>
      <button className="btn secondary sm" disabled={busy} onClick={add}>+ Add rule</button>
    </div>
  )
}
