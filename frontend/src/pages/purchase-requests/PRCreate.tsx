import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import * as api from '../../mockApi'
import { PR_CATEGORIES } from '../../types'
import type { Budget } from '../../types'

interface ItemDraft {
  description: string
  quantity: number
  unit_price: number
  notes: string
}

export default function PRCreate() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [category, setCategory] = useState<string>('office_supplies')
  const [priority, setPriority] = useState('normal')
  const [justification, setJustification] = useState('')
  const [requiredByDate, setRequiredByDate] = useState('')
  const [budgetCategoryId, setBudgetCategoryId] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([
    { description: '', quantity: 1, unit_price: 0, notes: '' },
  ])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    api.listBudgets(token).then((bs) => setBudgets(bs)).catch(() => {})
  }, [token])

  const lines = items.map((i) => ({ ...i, total_price: i.quantity * i.unit_price }))
  const total = lines.reduce((s, i) => s + i.total_price, 0)

  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!justification.trim()) return setError('Justification is required')
    if (!requiredByDate) return setError('Required-by date is required')
    setBusy(true)
    try {
      const pr = await api.createPR(token!, {
        branch_id: 'br-hq',
        department_id: 'dept-it',
        category,
        priority,
        justification,
        required_by_date: requiredByDate,
        budget_category_id: budgetCategoryId || null,
        items: items.filter((i) => i.description.trim()).map((i) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price, notes: i.notes })),
      })
      navigate(`/purchase-requests/${pr.id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>New Purchase Request</h1>
          <p className="sub">Saved as draft — submit when ready (001-purchase-request US1)</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      <div className="demo-note">Markup: branch/department are fixed to demo values. Real impl fetches them from their modules.</div>

      <form onSubmit={submit}>
        <div className="card">
          <h2>Details</h2>
          <div className="form-row-3">
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {PR_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="priority">Priority</label>
              <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">low</option>
                <option value="normal">normal</option>
                <option value="urgent">urgent</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="required-by">Required by</label>
              <input id="required-by" type="date" value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="budget-category">Budget category (required before submission)</label>
            <select id="budget-category" value={budgetCategoryId} onChange={(e) => setBudgetCategoryId(e.target.value)}>
              <option value="">— none —</option>
              {budgets.flatMap((b) => b.lines.map((l) => (
                <option key={l.id} value={l.id}>{l.category.replace(/_/g, ' ')} — remaining {l.remaining.toLocaleString()}</option>
              )))}
            </select>
            <div className="hint">FR-004: submission is rejected without a linked budget category.</div>
          </div>
          <div className="field">
            <label htmlFor="justification">Justification</label>
            <textarea id="justification" rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Why is this purchase needed?" />
          </div>
        </div>

        <div className="card">
          <h2>Line Items</h2>
          {lines.map((item, idx) => (
            <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 14 }}>
              <div className="form-row-3">
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>Description</label>
                  <input value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="e.g. Office chairs" />
                </div>
                <div className="field">
                  <label>Quantity</label>
                  <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                </div>
              </div>
              <div className="form-row-3">
                <div className="field">
                  <label>Unit price</label>
                  <input type="number" min={0} value={item.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>Line total</label>
                  <input value={item.total_price.toLocaleString()} disabled />
                </div>
                <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                  {items.length > 1 && (
                    <button type="button" className="btn secondary" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="btn secondary sm" onClick={() => setItems([...items, { description: '', quantity: 1, unit_price: 0, notes: '' }])}>
            + Add item
          </button>
          <div className="mt total-line grand"><span>PR Total</span><span>{total.toLocaleString()}</span></div>
        </div>

        <div className="btn-row">
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create draft'}</button>
          <button className="btn secondary" type="button" onClick={() => navigate('/purchase-requests')}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
