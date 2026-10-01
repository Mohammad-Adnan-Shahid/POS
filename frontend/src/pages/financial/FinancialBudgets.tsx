import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import * as api from '../../mockApi'
import { PR_CATEGORIES } from '../../types'
import type { Budget } from '../../types'

export default function FinancialBudgets() {
  const { token, hasPermission } = useAuth()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [category, setCategory] = useState<string>(PR_CATEGORIES[0])
  const [allocated, setAllocated] = useState('')
  const [error, setError] = useState<string | null>(null)
  const canCreate = hasPermission('budget.create')

  const refresh = useCallback(() => {
    if (!token) return
    api.listBudgets(token).then(setBudgets).catch((e) => setError((e as Error).message))
  }, [token])

  useEffect(refresh, [refresh])

  const addLine = async (budgetId: string) => {
    setError(null)
    if (!allocated || Number(allocated) <= 0) return setError('Allocated amount must be positive')
    try {
      await api.createBudgetLine(token!, budgetId, { category, allocated: Number(allocated) })
      setAllocated('')
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Budgets</h1>
          <p className="sub">Per-category budget lines with warning levels (003-financial-engine US4)</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {budgets.map((b) => (
        <div className="card" key={b.id}>
          <div className="flex-between">
            <div>
              <h2 style={{ marginBottom: 2 }}>{b.name}</h2>
              <span className="muted">{b.period_type} · {b.period_start} → {b.period_end}</span>
            </div>
            <span className="badge active">{b.is_active ? 'active' : 'inactive'}</span>
          </div>

          <table className="table mt">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Allocated</th>
                <th className="num">Used</th>
                <th className="num">Committed</th>
                <th className="num">Remaining</th>
                <th className="num">% Remaining</th>
                <th>Warning</th>
              </tr>
            </thead>
            <tbody>
              {b.lines.map((l) => {
                const pct = l.allocated > 0 ? Math.round((l.remaining / l.allocated) * 100) : 0
                return (
                  <tr key={l.id}>
                    <td>{l.category.replace(/_/g, ' ')}</td>
                    <td className="num">{l.allocated.toLocaleString()}</td>
                    <td className="num">{l.used.toLocaleString()}</td>
                    <td className="num">{l.committed.toLocaleString()}</td>
                    <td className="num">{l.remaining.toLocaleString()}</td>
                    <td className="num">{pct}%</td>
                    <td><span className={`badge ${l.warning}`}>{l.warning}</span></td>
                  </tr>
                )
              })}
              {b.lines.length === 0 && <tr><td colSpan={7} className="empty">No budget lines.</td></tr>}
            </tbody>
          </table>

          {canCreate && (
            <div className="toolbar mt">
              <span className="muted">Add line:</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {PR_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
              <input type="number" min={0} placeholder="Allocated amount" value={allocated} onChange={(e) => setAllocated(e.target.value)} style={{ width: 180 }} />
              <button className="btn secondary sm" onClick={() => addLine(b.id)}>+ Add budget line</button>
            </div>
          )}
        </div>
      ))}

      <div className="demo-note">
        Warning thresholds per spec US4: <strong>critical</strong> &lt; 20% remaining · <strong>warning</strong> 20–50% · <strong>safe</strong> &gt; 50%.
        Over-budget requests escalate approval risk to critical (FR-009).
      </div>
    </div>
  )
}
