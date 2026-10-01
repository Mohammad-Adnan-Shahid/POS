import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export interface NavItem {
  to: string
  label: string
  permission?: string
  /** Match only the exact path — set on entries that have a sibling sub-route
   *  (e.g. `/financial` vs `/financial/budgets`) so only one stays highlighted. */
  exact?: boolean
}

/** Sidebar navigation model. Exported for nav-state verification. */
export const NAV_SECTIONS: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard' }],
  },
  {
    section: 'Procurement',
    items: [
      // prefix-matched on purpose: stays active on /purchase-requests/new and /:id
      { to: '/purchase-requests', label: 'Purchase Requests', permission: 'purchase_request.view' },
      { to: '/approvals', label: 'Approvals', permission: 'approval.view', exact: true },
      { to: '/approvals/workflows', label: 'Workflow Config', permission: 'approval.view' },
    ],
  },
  {
    section: 'Finance',
    items: [
      { to: '/financial', label: 'Financial Dashboard', permission: 'approval.view', exact: true },
      { to: '/financial/budgets', label: 'Budgets', permission: 'approval.view' },
    ],
  },
  {
    section: 'Governance',
    items: [{ to: '/audit', label: 'Audit Log', permission: 'approval.view' }],
  },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { user, organization, logout, hasPermission } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          POS Procurement
          <small>{organization?.name}</small>
        </div>
        <nav>
          {NAV_SECTIONS.map(({ section, items }) => {
            const visible = items.filter((i) => !i.permission || hasPermission(i.permission))
            if (visible.length === 0) return null
            return (
              <div key={section}>
                <div className="nav-section">{section}</div>
                {visible.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    className={({ isActive }) => (isActive ? 'active' : '')}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="session">
          <div className="who">{user?.name}</div>
          <div className="role">{user?.role.replace(/_/g, ' ')}</div>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
