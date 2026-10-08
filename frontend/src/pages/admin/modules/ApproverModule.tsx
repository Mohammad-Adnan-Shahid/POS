import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import * as asApi from '../../../mockApi'
import type { ApprovalWorkflow, WorkflowStep } from '../../../types'

/**
 * 005-roles §4 — editable approver assignments for the selected user.
 * The super admin decides who approves and up to what amount: assign the user to a
 * workflow step (specific person, exactly-one-of with role — 002 data-model), set each
 * step's authority limit, or remove a step. Steps re-index on delete (002 api-spec).
 */
export default function ApproverModule({
  target,
  users,
  onResult,
}: {
  target: { id: string; name: string; role: string }
  /** All users (from the page's step-1 load) — used to label steps that name someone else. */
  users: { id: string; name: string }[]
  onResult: (ok: boolean, message: string) => void
}) {
  const { token, hasPermission } = useAuth()
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Add form state
  const [wfId, setWfId] = useState('')
  const [limit, setLimit] = useState('')
  const canConfigure = hasPermission('approval.configure_workflow')

  const refresh = useCallback(() => {
    if (!token) return
    asApi.listWorkflows(token).then(setWorkflows).catch((e) => setError((e as Error).message))
  }, [token])

  useEffect(refresh, [refresh])

  const involves = (s: WorkflowStep) => s.user_id === target.id || (!s.user_id && s.role_id === target.role)

  const run = async (key: string, fn: () => Promise<unknown>, okMessage: string) => {
    setError(null)
    setBusy(key)
    try {
      await fn()
      refresh()
      onResult(true, okMessage)
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      onResult(false, msg)
    } finally {
      setBusy(null)
    }
  }

  const addStep = () => {
    const wf = workflows.find((w) => w.id === wfId)
    if (!wf) return
    run(
      `add-${wfId}`,
      () =>
        asApi.addWorkflowStep(token!, wf.id, {
          step_order: wf.steps.length + 1,
          role_id: null,
          user_id: target.id, // exactly one of role/user — specific person (002 data-model)
          max_amount: limit === '' ? null : Number(limit),
        }),
      `${target.name} assigned to ${wf.name}${limit ? ` up to ${Number(limit).toLocaleString()}` : ' with no amount limit'}.`,
    ).then(() => {
      setWfId('')
      setLimit('')
    })
  }

  const saveLimit = (wf: ApprovalWorkflow, step: WorkflowStep, value: string) =>
    run(
      `limit-${step.id}`,
      () => asApi.updateWorkflowStep(token!, wf.id, step.id, { max_amount: value === '' ? null : Number(value) }),
      `Authority limit for ${wf.name} step ${step.step_order} updated.`,
    )

  const removeStep = (wf: ApprovalWorkflow, step: WorkflowStep) =>
    run(
      `del-${step.id}`,
      () => asApi.deleteWorkflowStep(token!, wf.id, step.id),
      `Step removed from ${wf.name} — remaining steps re-indexed.`,
    )

  return (
    <div className="card">
      <h2>Module 2 — Who approves {target.name}'s requests</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Assign <strong>{target.name}</strong> to approval steps with an authority limit (roles.md §4, 002-approval-workflow).
        A request above a step's limit skips that approver.
      </p>

      {error && <div className="alert error">{error}</div>}
      {!canConfigure && (
        <div className="alert info">Read-only — the `approval.configure_workflow` permission is required to change assignments.</div>
      )}

      {workflows.map((wf) => (
        <div key={wf.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
          <div className="flex-between">
            <h3 style={{ margin: 0 }}>{wf.name}</h3>
            <span className="muted">{wf.rules.length === 0 ? 'default (matches all)' : `${wf.rules.length} rule(s)`}</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th className="num">Step</th>
                <th>Approver</th>
                <th>Assigned via</th>
                <th className="num">Authority limit (max amount)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {wf.steps.map((s) => {
                const mine = involves(s)
                const isDirect = s.user_id === target.id
                return (
                  <tr key={s.id} style={mine ? { background: 'var(--bg)' } : undefined}>
                    <td className="num">{s.step_order}</td>
                    <td>
                      {s.user_id ? (s.user_id === target.id ? <strong>{target.name}</strong> : (users.find((u) => u.id === s.user_id)?.name ?? s.user_id)) : '—'}
                      {mine && <span className="badge submitted" style={{ marginLeft: 8 }}>{isDirect ? 'this person' : 'via role'}</span>}
                    </td>
                    <td className="muted">{s.user_id ? 'specific person' : s.role_id ? `any ${s.role_id.replace(/_/g, ' ')}` : '—'}</td>
                    <td className="num">
                      {canConfigure ? (
                        <input
                          type="number"
                          min={0}
                          defaultValue={s.max_amount ?? ''}
                          placeholder="No limit"
                          style={{ width: 140, textAlign: 'right' }}
                          onBlur={(e) => {
                            const next = e.target.value === '' ? '' : Number(e.target.value)
                            const prev = s.max_amount === null ? '' : s.max_amount
                            if (next !== prev) saveLimit(wf, s, e.target.value)
                          }}
                          aria-label={`Authority limit for ${wf.name} step ${s.step_order}`}
                        />
                      ) : (
                        <span>{s.max_amount === null ? 'No limit' : s.max_amount.toLocaleString()}</span>
                      )}
                    </td>
                    <td>
                      {canConfigure && (
                        <button
                          className="btn danger sm"
                          disabled={busy === `del-${s.id}`}
                          onClick={() => removeStep(wf, s)}
                          title="Remove this approver step"
                        >
                          {busy === `del-${s.id}` ? '…' : 'Remove'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {wf.steps.length === 0 && (
                <tr><td colSpan={5} className="empty">No steps — nobody approves for this workflow yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {canConfigure && (
        <div className="toolbar mt">
          <span className="muted">Assign {target.name} to:</span>
          <select value={wfId} onChange={(e) => setWfId(e.target.value)} aria-label="Workflow">
            <option value="">Choose workflow…</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>{w.name} (next step #{w.steps.length + 1})</option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            placeholder="Max amount (blank = no limit)"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            style={{ width: 220 }}
          />
          <button className="btn sm" disabled={busy !== null || !wfId} onClick={addStep}>
            {wfId && busy === `add-${wfId}` ? 'Saving…' : '+ Assign as approver'}
          </button>
        </div>
      )}
    </div>
  )
}
