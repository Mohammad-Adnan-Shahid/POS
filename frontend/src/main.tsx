import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import Layout from './components/Layout'
import Login from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import Dashboard from './pages/Dashboard'
import PRList from './pages/purchase-requests/PRList'
import PRCreate from './pages/purchase-requests/PRCreate'
import PRDetail from './pages/purchase-requests/PRDetail'
import ApprovalsQueue from './pages/approvals/ApprovalsQueue'
import ApprovalsWorkflows from './pages/approvals/ApprovalsWorkflows'
import FinancialDashboard from './pages/financial/FinancialDashboard'
import FinancialBudgets from './pages/financial/FinancialBudgets'
import AuditLog from './pages/AuditLog'
import RoleAssignments from './pages/admin/RoleAssignments'
import './styles.css'

function Protected({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()
  if (loading) return <div className="page-loading">Loading…</div>
  if (!token) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()
  if (loading) return <div className="page-loading">Loading…</div>
  if (token) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
          <Route path="/reset-password" element={<PublicOnly><ResetPassword /></PublicOnly>} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/purchase-requests" element={<Protected><PRList /></Protected>} />
          <Route path="/purchase-requests/new" element={<Protected><PRCreate /></Protected>} />
          <Route path="/purchase-requests/:id" element={<Protected><PRDetail /></Protected>} />
          <Route path="/approvals" element={<Protected><ApprovalsQueue /></Protected>} />
          <Route path="/approvals/workflows" element={<Protected><ApprovalsWorkflows /></Protected>} />
          <Route path="/financial" element={<Protected><FinancialDashboard /></Protected>} />
          <Route path="/financial/budgets" element={<Protected><FinancialBudgets /></Protected>} />
          <Route path="/audit" element={<Protected><AuditLog /></Protected>} />
          <Route path="/roles" element={<Protected><RoleAssignments /></Protected>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
