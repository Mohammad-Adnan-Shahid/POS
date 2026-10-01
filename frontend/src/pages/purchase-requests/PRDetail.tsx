import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import * as api from '../../mockApi'
import { PR_CATEGORIES } from '../../types'
import type { ApiError, ApprovalHistoryEntry, Budget, DuplicateMatch, FinancialValidation, PurchaseRequest } from '../../types'

export default function PRDetail() {
  const { id } = useParams<{ id: string }>()
  const { token, user, hasPermission } = useAuth()
  const [pr, setPr] = useState<PurchaseRequest | null>(null)
  const [history, setHistory] = useState<ApprovalHistoryEntry[]>([])
  const [impact, setImpact] = useState<FinancialValidation | null>(null)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [dupes, setDupes] = useState<DuplicateMatch[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState<{ action: string; comments: string; exceptionReason: string } | null>(null)

  // draft edit form state
  const [hdr, setHdr] = useState({ category: '', priority: '', justification: '', required_by_date: '', budget_category_id: '' })
  const [newItem, setNewItem] = useState({ description: '', quantity: 1, unit_price: 0 })

  const refresh = useCallback(async () => {
    if (!token || !id) return
    try {
      const loaded = await api.getPR(token, id)
      setPr(loaded)
      setHdr({
        category: loaded.category,
        priority: loaded.priority,
        justification: loaded.justification,
        required_by_date: loaded.required_by_date,
        budget_category_id: loaded.budget_category_id ?? '',
      })
      api.approvalHistory(token, id).then(setHistory).catch(() => {})
      api.financialImpact(token, id).then(setImpact).catch(() => {})
    } catch (err) {
      setError((err as Error).message)
    }
  }, [token, id])

  useEffect(() => {
    refresh()
    if (token) api.listBudgets(token).then(setBudgets).catch(() => {})
  }, [refresh, token])

  const run = async (fn: () => Promise<unknown>, okMessage?: string) => {
    setError(null); setInfo(null); setDupes(null); setBusy(true)
    try {
      await fn()
      await refresh()
      if (okMessage) setInfo(okMessage)
      return true
    } catch (err) {
      const e = err as ApiError
      if (e.code === 'DUPLICATE_DETECTED') setDupes((e.details as { matches: DuplicateMatch[] })?.matches ?? [])
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!pr) return <div className="page-loading">{error ?? 'Loading…'}</div>

  const isCreator = user?.id === pr.requested_by
  const canEdit = pr.status === 'draft' && isCreator && hasPermission('purchase_request.edit')
  const canSubmit = pr.status === 'draft' && isCreator && hasPermission('purchase_request.submit')
  const canRecall = pr.status === 'submitted' && isCreator && hasPermission('purchase_request.recall')
  const canConvert = pr.status === 'approved' && hasPermission('purchase_order.create')
  const canCancel = pr.status !== 'cancelled' && hasPermission('purchase_request.cancel')
  const canDecide = (pr.status === 'submitted' || pr.status === 'under_review' || pr.status === 'on_hold') && hasPermission('approval.approve') && !isCreator

  const submitPr = () =>
    run(async () => { await api.submitPR(token!, pr.id, pr.version) }, 'Submitted for approval — routed to workflow.')

  const recallPr = () =>
    run(async () => { await api.recallPR(token!, pr.id, pr.version) }, 'Recalled to draft. Items are editable again.')

  const saveHeader = () =>
    run(async () => {
      await api.updatePRHeader(token!, pr.id, {
        category: hdr.category, priority: hdr.priority, justification: hdr.justification,
        required_by_date: hdr.required_by_date, budget_category_id: hdr.budget_category_id || null,
        version: pr.version,
      })
      setEditing(false)
    }, 'Header updated.')

  const addItem = () =>
    run(async () => {
      await api.addItem(token!, pr.id, newItem, pr.version)
      setNewItem({ description: '', quantity: 1, unit_price: 0 })
    }, 'Item added.')

  const convert = () => {
    const supplier = window.prompt('Supplier ID (markup: free text):')
    if (supplier) run(async () => { await api.convertToPO(token!, pr.id, supplier) }, 'Converted to Purchase Order.')
  }

  // Mandatory reason per 001 api-spec POST /purchase-requests/{id}/cancel.
  const cancel = () => {
    const reason = window.prompt('Cancel reason (mandatory):')
    if (reason === null) return
    if (!reason.trim()) {
      setError('A reason is required to cancel')
      return
    }
    run(async () => { await api.cancelPR(token!, pr.id, reason, pr.version) }, 'Request cancelled — any active commitment was released.')
  }

  const submitDecision = () => {
    if (!decision) return
    if (decision.action === 'approve_with_exception' && !decision.exceptionReason.trim()) {
      setError('An exception reason is required')
      return
    }
    run(async () => {
      await api.decideApproval(token!, pr.id, decision.action as 'approve', {
        comments: decision.comments,
        exception_reason: decision.action === 'approve_with_exception' ? decision.exceptionReason : undefined,
      })
      setDecision(null)
    }, `Decision recorded: ${decision.action.replace(/_/g, ' ')}.`)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1><span className="mono">{pr.request_number}</span> <span className={`badge ${pr.status}`}>{pr.status.replace(/_/g, ' ')}</span></h1>
          <p className="sub">Requested by {pr.requester_name} · Created {new Date(pr.created_at).toLocaleString()} · v{pr.version}</p>
        </div>
        <div className="btn-row">
          {canEdit && !editing && <button className="btn secondary" onClick={() => setEditing(true)}>Edit draft</button>}
          {canSubmit && <button className="btn" disabled={busy} onClick={submitPr}>Submit for approval</button>}
          {canRecall && <button className="btn warn" disabled={busy} onClick={recallPr}>Recall to draft</button>}
          {canConvert && <button className="btn" disabled={busy} onClick={convert}>Convert to PO</button>}
          {canCancel && <button className="btn danger" disabled={busy} onClick={cancel}>Cancel</button>}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {info && <div className="alert success">{info}</div>}
      {dupes && (
        <div className="alert warn">
          <strong>Duplicate detected (FR-006):</strong> similar request(s) in the same category within 10%:
          <ul style={{ margin: '8px 0 0' }}>
            {dupes.map((d) => (
              <li key={d.pr_id}><span className="mono">{d.request_number}</span> — total {d.total.toLocaleString()} · match score {Math.round(d.match_score * 100)}%</li>
            ))}
          </ul>
        </div>
      )}
      {canSubmit && !pr.budget_category_id && (
        <div className="alert warn">FR-004: link a budget category before submission.</div>
      )}
      {canSubmit && pr.items.length === 0 && (
        <div className="alert warn">FR-003: at least one line item is required before submission.</div>
      )}

      <div className="card">
        <h2>Details</h2>
        {!editing ? (
          <dl className="kv-grid">
            <dt>Category</dt><dd>{pr.category.replace(/_/g, ' ')}</dd>
            <dt>Priority</dt><dd><span className={`badge priority-${pr.priority}`}>{pr.priority}</span></dd>
            <dt>Required by</dt><dd>{pr.required_by_date}</dd>
            <dt>Budget category</dt><dd>{pr.budget_category_id ? budgetLineLabel(budgets, pr.budget_category_id) : <span className="muted">none</span>}</dd>
            <dt>Justification</dt><dd>{pr.justification}</dd>
          </dl>
        ) : (
          <>
            <div className="form-row-3">
              <div className="field">
                <label>Category</label>
                <select value={hdr.category} onChange={(e) => setHdr({ ...hdr, category: e.target.value })}>
                  {PR_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Priority</label>
                <select value={hdr.priority} onChange={(e) => setHdr({ ...hdr, priority: e.target.value })}>
                  <option value="low">low</option><option value="normal">normal</option><option value="urgent">urgent</option>
                </select>
              </div>
              <div className="field">
                <label>Required by</label>
                <input type="date" value={hdr.required_by_date} onChange={(e) => setHdr({ ...hdr, required_by_date: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Budget category</label>
              <select value={hdr.budget_category_id} onChange={(e) => setHdr({ ...hdr, budget_category_id: e.target.value })}>
                <option value="">— none —</option>
                {budgets.flatMap((b) => b.lines.map((l) => (
                  <option key={l.id} value={l.id}>{l.category.replace(/_/g, ' ')} — remaining {l.remaining.toLocaleString()}</option>
                )))}
              </select>
            </div>
            <div className="field">
              <label>Justification</label>
              <textarea rows={3} value={hdr.justification} onChange={(e) => setHdr({ ...hdr, justification: e.target.value })} />
            </div>
            <div className="btn-row">
              <button className="btn" disabled={busy} onClick={saveHeader}>Save header</button>
              <button className="btn secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Line Items</h2>
        <table className="table">
          <thead>
            <tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Line total</th><th></th></tr>
          </thead>
          <tbody>
            {pr.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}{item.unit_price === 0 && <span className="badge warning" style={{ marginLeft: 8 }}>zero price</span>}</td>
                <td className="num">{item.quantity}</td>
                <td className="num">{item.unit_price.toLocaleString()}</td>
                <td className="num">{item.total_price.toLocaleString()}</td>
                <td>
                  {canEdit && (
                    <button
                      className="btn secondary sm"
                      disabled={busy}
                      onClick={() => run(async () => { await api.deleteItem(token!, pr.id, item.id, pr.version) }, 'Item deleted.')}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {pr.items.length === 0 && <tr><td colSpan={5} className="empty">No items.</td></tr>}
          </tbody>
        </table>
        <div className="total-line grand"><span>PR Total</span><span>{pr.total.toLocaleString()}</span></div>

        {canEdit && (
          <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <h3>Add item</h3>
            <div className="form-row-3">
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Description</label>
                <input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
              </div>
              <div className="field">
                <label>Quantity</label>
                <input type="number" min={1} value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-row-3">
              <div className="field">
                <label>Unit price</label>
                <input type="number" min={0} value={newItem.unit_price} onChange={(e) => setNewItem({ ...newItem, unit_price: Number(e.target.value) })} />
              </div>
              <div className="field" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn secondary" disabled={busy} onClick={addItem}>+ Add item</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Financial Impact (003-financial-engine)</h2>
        {impact ? (
          <>
            <div className="total-line"><span>Current funds</span><span>{impact.current_funds.toLocaleString()}</span></div>
            <div className="total-line"><span>Commitments</span><span>-{impact.commitments.toLocaleString()}</span></div>
            <div className="total-line"><span>Available</span><span>{impact.available.toLocaleString()}</span></div>
            <div className="total-line grand">
              <span>Projected position after this PR</span>
              <span className={impact.projected_position < 0 ? 'badge critical' : ''}>{impact.projected_position.toLocaleString()}</span>
            </div>
            <div className="mt">Risk level: <span className={`badge ${impact.risk_level}`}>{impact.risk_level}</span></div>
            {impact.budget && (
              <div className="mt">
                Budget check: allocated {impact.budget.allocated.toLocaleString()} · committed {impact.budget.committed.toLocaleString()} · remaining {impact.budget.remaining.toLocaleString()}{' '}
                {impact.budget.over_budget && <span className="badge critical">over budget</span>}
              </div>
            )}
          </>
        ) : <div className="muted">Loading…</div>}
      </div>

      {canDecide && (
        <div className="card">
          <h2>Approval Decision (002-approval-workflow)</h2>
          {pr.status === 'on_hold' && hasPermission('approval.resume') && (
            <button
              className="btn ok"
              disabled={busy}
              onClick={() => run(async () => { await api.decideApproval(token!, pr.id, 'resume', { comments: '' }) }, 'Resumed to under_review.')}
            >
              Resume
            </button>
          )}
          {!decision ? (
            <div className="btn-row">
              <button className="btn ok" disabled={busy} onClick={() => setDecision({ action: 'approve', comments: '', exceptionReason: '' })}>Approve</button>
              <button className="btn danger" disabled={busy} onClick={() => setDecision({ action: 'reject', comments: '', exceptionReason: '' })}>Reject</button>
              <button className="btn warn" disabled={busy} onClick={() => setDecision({ action: 'hold', comments: '', exceptionReason: '' })}>Hold</button>
              {hasPermission('approval.approve_with_exception') && (
                <button className="btn secondary" disabled={busy} onClick={() => setDecision({ action: 'approve_with_exception', comments: '', exceptionReason: '' })}>Approve with exception</button>
              )}
            </div>
          ) : (
            <>
              {decision.action === 'approve_with_exception' && (
                <div className="field">
                  <label>Exception reason (mandatory — FR-005)</label>
                  <textarea rows={2} value={decision.exceptionReason} onChange={(e) => setDecision({ ...decision, exceptionReason: e.target.value })} />
                </div>
              )}
              <div className="field">
                <label>Comments</label>
                <textarea rows={2} value={decision.comments} onChange={(e) => setDecision({ ...decision, comments: e.target.value })} placeholder="Optional context for the audit trail" />
              </div>
              <div className="btn-row">
                <button className="btn" disabled={busy} onClick={submitDecision}>Confirm {decision.action.replace(/_/g, ' ')}</button>
                <button className="btn secondary" onClick={() => setDecision(null)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h2>Approval History (audit trail — FR-007)</h2>
        {history.length === 0 ? (
          <div className="empty">No approval decisions yet.</div>
        ) : (
          <ul className="timeline">
            {history.map((h) => (
              <li key={h.id}>
                <div className="t-head">
                  <strong>{h.approver_name}</strong>
                  <span className={`badge ${h.action === 'approve' || h.action === 'approve_with_exception' ? 'approved' : h.action === 'reject' ? 'rejected' : 'on_hold'}`}>
                    {h.action.replace(/_/g, ' ')}
                  </span>
                  <span className="muted">step {h.step_order}</span>
                </div>
                <div className="t-meta">{new Date(h.created_at).toLocaleString()}</div>
                {h.comments && <div>“{h.comments}”</div>}
                {h.exception_reason && <div className="muted">Exception: {h.exception_reason}</div>}
                <div className="t-meta">
                  Snapshot: available {h.financial_snapshot.available.toLocaleString()} · projected {h.financial_snapshot.projected_position.toLocaleString()} · risk {h.financial_snapshot.risk_level}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p><Link to="/purchase-requests">← Back to purchase requests</Link></p>
    </div>
  )
}

function budgetLineLabel(budgets: Budget[], lineId: string): string {
  for (const b of budgets) {
    const l = b.lines.find((x) => x.id === lineId)
    if (l) return `${l.category.replace(/_/g, ' ')} (remaining ${l.remaining.toLocaleString()})`
  }
  return lineId
}
