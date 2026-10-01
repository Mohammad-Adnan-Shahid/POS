// Types mirror spec-kit-plus/specs/*/contracts/api-spec.md field names.

// ── Shared ────────────────────────────────────────────────────────────────
export interface Paginated<T> {
  data: T[]
  meta: { page: number; per_page: number; total: number; total_pages: number }
}

export interface ApiError extends Error {
  status: number
  code: string
  details?: unknown
}

export type RiskLevel = 'safe' | 'warning' | 'critical'

export interface FinancialPosition {
  current_funds: number
  commitments: number
  obligations: number
  pending_payments: number
  available: number
}

export interface FinancialValidation extends FinancialPosition {
  projected_position: number
  risk_level: RiskLevel
  budget: BudgetCheck | null
}

export interface BudgetCheck {
  allocated: number
  used: number
  committed: number
  remaining: number
  over_budget: boolean
}

// ── 004-auth ──────────────────────────────────────────────────────────────
export interface User {
  id: string
  name: string
  email: string
  role: RoleName
  organization_id: string
  permissions: string[]
  is_active: boolean
}

export type RoleName = 'org_admin' | 'dept_coordinator' | 'approver' | 'finance_manager' | 'auditor'

export interface Organization {
  id: string
  name: string
}

export interface AuthPayload {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  user: User
  organization: Organization
}

// ── 001-purchase-request ──────────────────────────────────────────────────
export type PRStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'on_hold'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'purchase_ordered'

export type PRPriority = 'low' | 'normal' | 'urgent'

export const PR_CATEGORIES = [
  'office_supplies',
  'it_equipment',
  'furniture',
  'stationery',
  'cleaning_supplies',
  'maintenance',
] as const
export type PRCategory = (typeof PR_CATEGORIES)[number]

export interface PRItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total_price: number
  notes: string
}

export interface PurchaseRequest {
  id: string
  request_number: string
  organization_id: string
  branch_id: string
  department_id: string
  category: PRCategory
  priority: PRPriority
  status: PRStatus
  budget_category_id: string | null
  justification: string
  required_by_date: string
  preferred_supplier_id: string | null
  requested_by: string
  requester_name: string
  total: number
  version: number
  created_at: string
  updated_at: string
  items: PRItem[]
}

export interface DuplicateMatch {
  pr_id: string
  request_number: string
  total: number
  match_score: number
}

// ── 002-approval-workflow ─────────────────────────────────────────────────
export interface ApprovalHistoryEntry {
  id: string
  entity_type: 'purchase_request'
  entity_id: string
  step_order: number
  action: 'approve' | 'reject' | 'hold' | 'approve_with_exception' | 'resume'
  approver_id: string
  approver_name: string
  comments: string
  exception_reason: string | null
  financial_snapshot: FinancialValidation
  created_at: string
}

export interface PendingApproval {
  id: string
  request_number: string
  total: number
  category: PRCategory
  requested_by: string
  requester_name: string
  current_step: number
  total_steps: number
  status: PRStatus
}

export interface WorkflowStep {
  id: string
  step_order: number
  /** Exactly one of role_id / user_id is expected at a step (002 data-model). */
  role_id: RoleName | null
  user_id: string | null
  max_amount: number | null
}

export interface WorkflowRule {
  id: string
  min_amount: number
  max_amount: number | null
  category: PRCategory | null
}

export interface ApprovalWorkflow {
  id: string
  name: string
  description: string
  is_active: boolean
  steps: WorkflowStep[]
  rules: WorkflowRule[]
}

// ── 003-financial-engine ──────────────────────────────────────────────────
export interface FundEntry {
  id: string
  amount: number
  reason: string
  entered_at: string
}

export interface FinancialCommitment {
  id: string
  entity_type: 'purchase_request'
  entity_id: string
  request_number?: string
  amount: number
  released_amount: number
  remaining_amount: number
  status: 'active' | 'partially_released' | 'fully_released'
  created_at: string
}

export interface Budget {
  id: 'budget-fy2026' | string
  name: string
  period_type: 'annual' | 'quarterly' | 'monthly'
  period_start: string
  period_end: string
  is_active: boolean
  lines: BudgetLine[]
}

export interface BudgetLine {
  id: string
  budget_id: string
  category: PRCategory
  allocated: number
  used: number
  committed: number
  remaining: number
  warning: RiskLevel
}

export interface AuditEvent {
  id: string
  organization_id: string
  actor_id: string
  actor_name: string
  action: string
  entity_type: string
  entity_id: string
  metadata: Record<string, unknown>
  created_at: string
}
