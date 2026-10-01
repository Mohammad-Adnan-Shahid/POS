// In-browser mock of the spec'd REST API (spec-kit-plus/specs/*/contracts/api-spec.md).
// Implements enough business rules that the markup demonstrates the real workflows:
// SoD, authority limits, duplicate detection, optimistic locking (version), financial risk.
import type {
  ApiError,
  ApprovalHistoryEntry,
  ApprovalWorkflow,
  AuditEvent,
  AuthPayload,
  Budget,
  BudgetLine,
  DuplicateMatch,
  FinancialCommitment,
  FinancialPosition,
  FinancialValidation,
  PendingApproval,
  PurchaseRequest,
  RoleName,
  User,
} from './types'
import { PR_CATEGORIES } from './types'
import type { RiskLevel, WorkflowStep } from './types'

// ── latency + persistence ─────────────────────────────────────────────────
const LATENCY = 250
const KEY = 'pos-markup-db-v2'
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function makeError(status: number, code: string, message: string, details?: unknown): ApiError {
  const err = new Error(message) as ApiError
  err.status = status
  err.code = code
  if (details !== undefined) err.details = details
  return err
}

const uid = () => Math.random().toString(36).slice(2, 10)
const nowIso = () => new Date().toISOString()

interface Db {
  users: User[]
  credentials: Record<string, string> // email -> password (mock only)
  prs: PurchaseRequest[]
  prCounter: number
  approvals: ApprovalHistoryEntry[]
  workflows: ApprovalWorkflow[]
  fundEntries: { id: string; amount: number; reason: string; entered_at: string }[]
  commitments: FinancialCommitment[]
  budgets: Budget[]
  audit: AuditEvent[]
}

function seedUser(
  id: string,
  name: string,
  email: string,
  password: string,
  role: RoleName,
  permissions: string[],
): User {
  return { id, name, email, role, organization_id: 'org-demo', permissions, is_active: true }
}

function seed(): Db {
  const users: User[] = [
    seedUser('u-admin', 'Demo Admin', 'demo.admin@demoorg.com', 'Secret@123', 'org_admin', ['*']),
    seedUser('u-coord1', 'Coordinator One', 'coord.one@demoorg.com', 'Coord@123', 'dept_coordinator', [
      'purchase_request.create',
      'purchase_request.edit',
      'purchase_request.submit',
      'purchase_request.recall',
      'purchase_request.view',
      'purchase_request.cancel',
      'purchase_order.create',
      'approval.view',
    ]),
    seedUser('u-coord2', 'Coordinator Two', 'coord.two@demoorg.com', 'Coord@123', 'dept_coordinator', [
      'purchase_request.create',
      'purchase_request.edit',
      'purchase_request.submit',
      'purchase_request.recall',
      'purchase_request.view',
      'purchase_request.cancel',
      'purchase_order.create',
      'approval.view',
    ]),
    seedUser('u-appr1', 'Approver One (Manager)', 'apr.one@demoorg.com', 'Apr@123456', 'approver', [
      'purchase_request.view',
      'approval.view',
      'approval.approve',
      'approval.reject',
      'approval.hold',
    ]),
    seedUser('u-appr2', 'Approver Two (Finance)', 'apr.two@demoorg.com', 'Apr@123456', 'approver', [
      'purchase_request.view',
      'approval.view',
      'approval.approve',
      'approval.reject',
      'approval.hold',
      'approval.approve_with_exception',
      'approval.resume',
    ]),
    seedUser('u-finance', 'Finance Manager', 'fin.one@demoorg.com', 'Fin@123456', 'finance_manager', [
      'purchase_request.view',
      'approval.view',
      'financial.manage_current_funds',
      'commitment.adjust',
      'budget.adjust',
      'budget.create',
      'budget.transfer',
    ]),
    seedUser('u-auditor', 'Auditor', 'aud.one@demoorg.com', 'Aud@123456', 'auditor', [
      'purchase_request.view',
      'approval.view',
    ]),
  ]
  const credentials: Record<string, string> = {}
  users.forEach((u) => {
    credentials[u.email] = {
      'demo.admin@demoorg.com': 'Secret@123',
      'coord.one@demoorg.com': 'Coord@123',
      'coord.two@demoorg.com': 'Coord@123',
      'apr.one@demoorg.com': 'Apr@123456',
      'apr.two@demoorg.com': 'Apr@123456',
      'fin.one@demoorg.com': 'Fin@123456',
      'aud.one@demoorg.com': 'Aud@123456',
    }[u.email] as string
  })

  const workflows: ApprovalWorkflow[] = [
    {
      id: 'wf-standard',
      name: 'Standard Procurement',
      description: 'Default workflow: Manager then Finance',
      is_active: true,
      steps: [
        // User-assigned steps (002 data-model: exactly one of role_id / user_id).
        // Manager owns step 1, Finance owns step 2 — so the demo shows real step routing.
        { id: 'st-1', step_order: 1, role_id: null, user_id: 'u-appr1', max_amount: 500000 },
        { id: 'st-2', step_order: 2, role_id: null, user_id: 'u-appr2', max_amount: null },
      ],
      rules: [],
    },
    {
      id: 'wf-lowvalue',
      name: 'Low Value (< 10k)',
      description: 'Single manager approval for small purchases',
      is_active: true,
      steps: [{ id: 'st-l1', step_order: 1, role_id: null, user_id: 'u-appr1', max_amount: 100000 }],
      rules: [{ id: 'ru-1', min_amount: 0, max_amount: 10000, category: null }],
    },
  ]

  const budgets: Budget[] = [
    {
      id: 'budget-fy2026',
      name: 'FY2026 Operating Budget',
      period_type: 'annual',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
      is_active: true,
      lines: [
        { id: 'bl-1', budget_id: 'budget-fy2026', category: 'office_supplies', allocated: 50000, used: 8000, committed: 5000, remaining: 37000, warning: 'safe' },
        { id: 'bl-2', budget_id: 'budget-fy2026', category: 'it_equipment', allocated: 100000, used: 55000, committed: 20000, remaining: 25000, warning: 'warning' },
        { id: 'bl-3', budget_id: 'budget-fy2026', category: 'furniture', allocated: 30000, used: 26000, committed: 3000, remaining: 1000, warning: 'critical' },
      ],
    },
  ]

  const db: Db = {
    users,
    credentials,
    prs: [],
    prCounter: 0,
    approvals: [],
    workflows,
    fundEntries: [
      { id: uid(), amount: 100000, reason: 'Opening balance', entered_at: nowIso() },
    ],
    commitments: [
      { id: uid(), entity_type: 'purchase_request', entity_id: 'seed-pr-1', request_number: 'PR-000001', amount: 20000, released_amount: 0, remaining_amount: 20000, status: 'active', created_at: nowIso() },
    ],
    budgets,
    audit: [],
  }

  // One already-approved PR so commitments/queue have realistic data.
  db.prCounter = 1
  db.prs.push({
    id: 'seed-pr-1',
    request_number: 'PR-000001',
    organization_id: 'org-demo',
    branch_id: 'br-hq',
    department_id: 'dept-it',
    category: 'it_equipment',
    priority: 'normal',
    status: 'approved',
    budget_category_id: 'bl-2',
    justification: 'Laptops for new hires',
    required_by_date: '2026-11-01',
    preferred_supplier_id: null,
    requested_by: 'u-coord1',
    requester_name: 'Coordinator One',
    total: 20000,
    version: 3,
    created_at: nowIso(),
    updated_at: nowIso(),
    items: [{ id: uid(), description: 'Laptop 14"', quantity: 4, unit_price: 5000, total_price: 20000, notes: '' }],
  })
  db.audit.push({
    id: uid(), organization_id: 'org-demo', actor_id: 'u-appr2', actor_name: 'Approver Two (Finance)',
    action: 'approval.approve', entity_type: 'purchase_request', entity_id: 'seed-pr-1',
    metadata: { step: 2 }, created_at: nowIso(),
  })
  return db
}

function load(): Db {
  const raw = localStorage.getItem(KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as Db
    } catch {
      /* fall through to reseed */
    }
  }
  const db = seed()
  localStorage.setItem(KEY, JSON.stringify(db))
  return db
}

function save(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db))
}

// ── session ───────────────────────────────────────────────────────────────
const SESSION_KEY = 'pos-markup-session'
const TOKEN_KEY = 'pos-markup-access'
export interface Session {
  email: string
  orgId: string
}
export function storeSession(payload: AuthPayload) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email: payload.user.email, orgId: payload.organization.id }))
  localStorage.setItem(TOKEN_KEY, payload.access_token)
}
export function readSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY)
  return raw ? (JSON.parse(raw) as Session) : null
}
export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(TOKEN_KEY)
}
function requireUser(token: string | null): User {
  const db = load()
  const user = db.users.find((u) => u.id === token)
  if (!user || !user.is_active) throw makeError(401, 'INVALID_TOKEN', 'Not authenticated')
  return user
}
function requirePermission(user: User, permission: string) {
  if (user.permissions.includes('*')) return
  if (!user.permissions.includes(permission)) {
    throw makeError(403, 'FORBIDDEN', `Missing permission: ${permission}`)
  }
}

// ── helpers ───────────────────────────────────────────────────────────────
/** Budget warning from remaining vs allocated (003 US4: <20% critical, 20–50% warning, >50% safe). */
function budgetWarning(allocated: number, remaining: number): RiskLevel {
  if (allocated <= 0) return 'safe'
  const pct = remaining / allocated
  if (pct < 0.2) return 'critical'
  if (pct <= 0.5) return 'warning'
  return 'safe'
}
function currentFunds(db: Db): number {
  return db.fundEntries.reduce((sum, e) => sum + e.amount, 0)
}
function totalCommitments(db: Db): number {
  return db.commitments
    .filter((c) => c.status === 'active' || c.status === 'partially_released')
    .reduce((sum, c) => sum + c.remaining_amount, 0)
}
function position(db: Db): FinancialPosition {
  const current_funds = currentFunds(db)
  const commitments = totalCommitments(db)
  return {
    current_funds,
    commitments,
    obligations: 0, // module not built (spec assumption)
    pending_payments: 0, // module not built (spec assumption)
    available: current_funds - commitments,
  }
}
function validateFinancial(db: Db, prTotal: number): FinancialValidation {
  const pos = position(db)
  const projected = pos.available - prTotal
  let risk: 'safe' | 'warning' | 'critical' = 'safe'
  if (projected < pos.available * 0.2) risk = 'warning'
  if (projected < 0) risk = 'critical'
  let budget: FinancialValidation['budget'] = null
  return { ...pos, projected_position: projected, risk_level: risk, budget }
}
function validateFinancialForPr(db: Db, pr: PurchaseRequest): FinancialValidation {
  const v = validateFinancial(db, pr.total)
  const line = db.budgets.flatMap((b) => b.lines).find((l) => l.id === pr.budget_category_id)
  if (line) {
    const budget = {
      allocated: line.allocated,
      used: line.used,
      committed: line.committed,
      remaining: line.remaining,
      over_budget: pr.total > line.remaining,
    }
    // FR-009 (003): request exceeds remaining budget → escalate to critical
    if (budget.over_budget) v.risk_level = 'critical'
    v.budget = budget
  }
  return v
}
function audit(db: Db, user: User, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  db.audit.push({
    id: uid(), organization_id: user.organization_id, actor_id: user.id, actor_name: user.name,
    action, entity_type: entityType, entity_id: entityId, metadata, created_at: nowIso(),
  })
}
function activeWorkflowFor(db: Db, pr: PurchaseRequest): ApprovalWorkflow {
  const active = db.workflows.filter((w) => w.is_active)
  const matched = active.find((w) =>
    w.rules.some(
      (r) =>
        (r.category === null || r.category === pr.category) &&
        (r.min_amount === null || pr.total >= r.min_amount) &&
        (r.max_amount === null || pr.total <= r.max_amount),
    ),
  )
  // Default workflow (no rules) acts as fallback (002 assumption)
  return matched ?? active.find((w) => w.rules.length === 0) ?? active[0]
}
/** A step is assigned to a specific user or to a role (002 data-model: exactly one). */
function stepAssignedTo(step: WorkflowStep, user: User): boolean {
  if (user.permissions.includes('*')) return true // org admin may act anywhere
  if (step.user_id) return step.user_id === user.id
  if (step.role_id) return user.role === step.role_id
  return false
}

function matchCurrentStepRole(db: Db, pr: PurchaseRequest, user: User): { workflow: ApprovalWorkflow; step: WorkflowStep } | null {
  const workflow = activeWorkflowFor(db, pr)
  if (!workflow) return null
  const approvedSteps = new Set(db.approvals.filter((a) => a.entity_id === pr.id && a.action === 'approve').map((a) => a.step_order))
  const pending = workflow.steps.find((s) => !approvedSteps.has(s.step_order))
  if (!pending) return null
  if (!stepAssignedTo(pending, user)) return null
  return { workflow, step: pending }
}

// ── password policy (004 FR-005) ──────────────────────────────────────────
export function passwordIssue(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit'
  if (!/[^a-zA-Z0-9]/.test(password)) return 'Password must contain at least one special character (e.g. @, !, #)'
  return null
}

// ── 004-auth ──────────────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<AuthPayload> {
  await wait(LATENCY)
  const db = load()
  const normalized = email.trim().toLowerCase()
  const user = db.users.find((u) => u.email === normalized)
  const fail = () => makeError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
  if (!user || !user.is_active || db.credentials[user.email] !== password) {
    if (user) audit(db, user, 'auth.login_failed', 'user', user.id, { email: normalized }) // never the password (BR-002)
    save(db)
    throw fail()
  }
  audit(db, user, 'auth.login', 'user', user.id)
  save(db)
  const payload: AuthPayload = {
    access_token: user.id, // mock: token IS the user id
    refresh_token: `refresh-${uid()}`,
    token_type: 'bearer',
    user,
    organization: { id: user.organization_id, name: 'Demo Org' },
  }
  storeSession(payload)
  return payload
}

export async function logout(): Promise<void> {
  await wait(LATENCY)
  const session = readSession()
  if (session) {
    const db = load()
    const user = db.users.find((u) => u.email === session.email)
    if (user) {
      audit(db, user, 'auth.logout', 'user', user.id)
      save(db)
    }
  }
  clearSession()
}

export async function me(token: string): Promise<{ user: User; organization: { id: string; name: string } }> {
  await wait(LATENCY)
  const user = requireUser(token)
  return { user, organization: { id: user.organization_id, name: 'Demo Org' } }
}

// ── 001-purchase-request ──────────────────────────────────────────────────
export interface PRInput {
  branch_id: string
  department_id: string
  category: string
  priority: string
  justification: string
  required_by_date: string
  budget_category_id: string | null
  preferred_supplier_id?: string | null
  items: { description: string; quantity: number; unit_price: number; notes?: string }[]
}

function recalc(pr: PurchaseRequest) {
  pr.items.forEach((i) => {
    i.total_price = i.quantity * i.unit_price
  })
  pr.total = pr.items.reduce((s, i) => s + i.total_price, 0)
}

export async function createPR(token: string, input: PRInput): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.create')
  db.prCounter += 1
  const pr: PurchaseRequest = {
    id: uid(),
    request_number: `PR-${String(db.prCounter).padStart(6, '0')}`, // FR-001
    organization_id: user.organization_id,
    branch_id: input.branch_id,
    department_id: input.department_id,
    category: input.category as PurchaseRequest['category'],
    priority: input.priority as PurchaseRequest['priority'],
    status: 'draft',
    budget_category_id: input.budget_category_id,
    justification: input.justification,
    required_by_date: input.required_by_date,
    preferred_supplier_id: input.preferred_supplier_id ?? null,
    requested_by: user.id,
    requester_name: user.name,
    total: 0,
    version: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
    items: input.items.map((i) => ({
      id: uid(), description: i.description, quantity: i.quantity,
      unit_price: i.unit_price, total_price: i.quantity * i.unit_price, notes: i.notes ?? '',
    })),
  }
  recalc(pr)
  db.prs.unshift(pr)
  audit(db, user, 'purchase_request.created', 'purchase_request', pr.id, { request_number: pr.request_number })
  save(db)
  return pr
}

export async function listPRs(
  token: string,
  filters: { status?: string; category?: string; page?: number; per_page?: number } = {},
): Promise<{ data: PurchaseRequest[]; meta: { page: number; per_page: number; total: number; total_pages: number } }> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.view')
  const db = load()
  let rows = db.prs.filter((p) => p.organization_id === user.organization_id)
  if (filters.status) rows = rows.filter((p) => p.status === filters.status)
  if (filters.category) rows = rows.filter((p) => p.category === filters.category)
  rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)) // newest first (SC-005)
  const page = filters.page ?? 1
  const perPage = filters.per_page ?? 20
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  return { data: rows.slice((page - 1) * perPage, page * perPage), meta: { page, per_page: perPage, total, total_pages: totalPages } }
}

export async function getPR(token: string, id: string): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.view')
  const db = load()
  const pr = db.prs.find((p) => p.id === id)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  return pr
}

function requireDraftCreator(pr: PurchaseRequest, user: User, version?: number) {
  if (pr.status !== 'draft') throw makeError(400, 'INVALID_STATE', 'Only draft requests can be edited')
  if (pr.requested_by !== user.id) throw makeError(403, 'FORBIDDEN', 'Only the PR creator can edit')
  if (version !== undefined && version !== pr.version) {
    throw makeError(409, 'VERSION_CONFLICT', 'This request was modified by someone else. Reload and try again.')
  }
}

export async function updatePRHeader(token: string, id: string, body: Partial<PRInput> & { version: number }): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.edit')
  const pr = db.prs.find((p) => p.id === id)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  requireDraftCreator(pr, user, body.version)
  if (body.category !== undefined) pr.category = body.category as PurchaseRequest['category']
  if (body.priority !== undefined) pr.priority = body.priority as PurchaseRequest['priority']
  if (body.justification !== undefined) pr.justification = body.justification
  if (body.required_by_date !== undefined) pr.required_by_date = body.required_by_date
  if (body.budget_category_id !== undefined) pr.budget_category_id = body.budget_category_id
  pr.version += 1 // BR-009: optimistic locking
  pr.updated_at = nowIso()
  audit(db, user, 'purchase_request.updated', 'purchase_request', pr.id)
  save(db)
  return pr
}

export async function addItem(token: string, id: string, item: { description: string; quantity: number; unit_price: number; notes?: string }, version: number): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.edit')
  const pr = db.prs.find((p) => p.id === id)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  requireDraftCreator(pr, user, version)
  pr.items.push({ id: uid(), description: item.description, quantity: item.quantity, unit_price: item.unit_price, total_price: 0, notes: item.notes ?? '' })
  recalc(pr) // BR-010/BR-011
  pr.version += 1
  pr.updated_at = nowIso()
  audit(db, user, 'purchase_request.item_added', 'purchase_request', pr.id, { description: item.description, quantity: item.quantity, unit_price: item.unit_price })
  save(db)
  return pr
}

export async function updateItem(token: string, prId: string, itemId: string, body: { description?: string; quantity?: number; unit_price?: number; notes?: string }, version: number): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.edit')
  const pr = db.prs.find((p) => p.id === prId)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  requireDraftCreator(pr, user, version)
  const item = pr.items.find((i) => i.id === itemId)
  if (!item) throw makeError(404, 'NOT_FOUND', 'Item not found')
  if (body.description !== undefined) item.description = body.description
  if (body.quantity !== undefined) item.quantity = body.quantity
  if (body.unit_price !== undefined) item.unit_price = body.unit_price
  if (body.notes !== undefined) item.notes = body.notes
  recalc(pr)
  pr.version += 1
  pr.updated_at = nowIso()
  audit(db, user, 'purchase_request.item_updated', 'purchase_request', pr.id, { item_id: itemId })
  save(db)
  return pr
}

export async function deleteItem(token: string, prId: string, itemId: string, version: number): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.edit')
  const pr = db.prs.find((p) => p.id === prId)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  requireDraftCreator(pr, user, version)
  pr.items = pr.items.filter((i) => i.id !== itemId) // deleting last item allowed (FR-003 blocks at submit)
  recalc(pr)
  pr.version += 1
  pr.updated_at = nowIso()
  audit(db, user, 'purchase_request.item_deleted', 'purchase_request', pr.id, { item_id: itemId })
  save(db)
  return pr
}

function detectDuplicates(db: Db, pr: PurchaseRequest): DuplicateMatch[] {
  // FR-006: same category, total within 10%
  return db.prs
    .filter(
      (p) =>
        p.id !== pr.id &&
        p.organization_id === pr.organization_id &&
        p.category === pr.category &&
        p.status !== 'cancelled' &&
        p.status !== 'rejected' &&
        pr.total > 0 &&
        Math.abs(p.total - pr.total) / p.total <= 0.1,
    )
    .map((p) => ({
      pr_id: p.id,
      request_number: p.request_number,
      total: p.total,
      match_score: Number((1 - Math.abs(p.total - pr.total) / Math.max(p.total, 1)).toFixed(2)),
    }))
}

export async function checkDuplicates(token: string, prId: string): Promise<DuplicateMatch[]> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.view')
  const db = load()
  const pr = db.prs.find((p) => p.id === prId)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  return detectDuplicates(db, pr)
}

export async function submitPR(token: string, id: string, version: number): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.submit')
  const pr = db.prs.find((p) => p.id === id)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  if (pr.requested_by !== user.id) throw makeError(403, 'FORBIDDEN', 'Only the PR creator can submit') // FR-005
  if (version !== pr.version) throw makeError(409, 'VERSION_CONFLICT', 'This request was modified by someone else. Reload and try again.')
  if (pr.items.length < 1) throw makeError(422, 'INVALID_ITEMS', 'At least one line item is required') // FR-003
  if (!pr.budget_category_id) throw makeError(422, 'VALIDATION_ERROR', 'A budget category must be linked before submission') // FR-004
  const dupes = detectDuplicates(db, pr)
  if (dupes.length > 0) {
    throw makeError(409, 'DUPLICATE_DETECTED', 'A similar purchase request already exists in this category', { matches: dupes }) // FR-006
  }
  pr.status = 'submitted'
  pr.version += 1
  pr.updated_at = nowIso()
  audit(db, user, 'purchase_request.submitted', 'purchase_request', pr.id, { request_number: pr.request_number })
  save(db)
  return pr
}

export async function recallPR(token: string, id: string, version: number): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.recall')
  const pr = db.prs.find((p) => p.id === id)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  if (pr.requested_by !== user.id) throw makeError(403, 'FORBIDDEN', 'Only the PR creator can recall') // BR-001
  if (pr.status === 'draft') throw makeError(400, 'INVALID_STATE', 'Already in draft') // BR-002
  if (pr.status !== 'submitted') throw makeError(400, 'INVALID_STATE', `Only submitted requests can be recalled (current: ${pr.status})`)
  if (db.approvals.some((a) => a.entity_id === pr.id)) {
    throw makeError(400, 'INVALID_STATE', 'Approval already started — recall blocked') // BR-003
  }
  if (version !== pr.version) throw makeError(409, 'VERSION_CONFLICT', 'This request was modified by someone else. Reload and try again.')
  pr.status = 'draft'
  pr.version += 1
  pr.updated_at = nowIso()
  audit(db, user, 'purchase_request.recalled', 'purchase_request', pr.id, { transition: 'submitted → draft' }) // BR-004
  save(db)
  return pr
}

export async function cancelPR(token: string, id: string, reason: string, version: number): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'purchase_request.cancel')
  const pr = db.prs.find((p) => p.id === id)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  if (!reason.trim()) throw makeError(400, 'VALIDATION_ERROR', 'A reason is required to cancel')
  if (pr.status === 'cancelled') throw makeError(400, 'INVALID_STATE', 'Already cancelled')
  if (version !== pr.version) throw makeError(409, 'VERSION_CONFLICT', 'This request was modified by someone else. Reload and try again.')
  pr.status = 'cancelled'
  pr.version += 1
  pr.updated_at = nowIso()
  const c = db.commitments.find((x) => x.entity_id === pr.id && x.status !== 'fully_released')
  if (c) {
    c.status = 'fully_released'
    c.released_amount = c.amount
    c.remaining_amount = 0
  }
  audit(db, user, 'purchase_request.cancelled', 'purchase_request', pr.id, { reason })
  save(db)
  return pr
}

export async function convertToPO(token: string, id: string, supplierId: string): Promise<PurchaseRequest> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'purchase_order.create')
  const pr = db.prs.find((p) => p.id === id)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  if (pr.status !== 'approved') throw makeError(400, 'INVALID_STATE', 'Only approved requests can be converted')
  pr.status = 'purchase_ordered'
  pr.preferred_supplier_id = supplierId
  pr.version += 1
  pr.updated_at = nowIso()
  const existing = db.commitments.find((c) => c.entity_id === pr.id && c.status === 'active')
  if (!existing) {
    // FR-011: commitment on conversion (idempotent, FR-005 of 003)
    db.commitments.push({
      id: uid(), entity_type: 'purchase_request', entity_id: pr.id, request_number: pr.request_number,
      amount: pr.total, released_amount: 0, remaining_amount: pr.total, status: 'active', created_at: nowIso(),
    })
  }
  audit(db, user, 'purchase_order.created', 'purchase_request', pr.id, { supplier_id: supplierId })
  save(db)
  return pr
}

export async function financialImpact(token: string, prId: string): Promise<FinancialValidation> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.view')
  const db = load()
  const pr = db.prs.find((p) => p.id === prId)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  return validateFinancialForPr(db, pr)
}

// ── 002-approval-workflow ─────────────────────────────────────────────────
export async function pendingApprovals(token: string): Promise<PendingApproval[]> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.view')
  const db = load()
  const rows = db.prs
    .filter((p) => p.status === 'submitted' || p.status === 'under_review')
    .filter((p) => matchCurrentStepRole(db, p, user) !== null)
    .map((p) => {
      const m = matchCurrentStepRole(db, p, user)
      return {
        id: p.id,
        request_number: p.request_number,
        total: p.total,
        category: p.category,
        requested_by: p.requested_by,
        requester_name: p.requester_name,
        current_step: m?.step.step_order ?? 1,
        total_steps: m?.workflow.steps.length ?? 1,
        status: p.status,
      }
    })
  return rows
}

export interface DecisionInput {
  comments?: string
  exception_reason?: string
  version?: number
}

export async function decideApproval(token: string, prId: string, action: 'approve' | 'reject' | 'hold' | 'approve_with_exception' | 'resume', input: DecisionInput = {}): Promise<{ status: string; next_step: number | null }> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  const pr = db.prs.find((p) => p.id === prId)
  if (!pr) throw makeError(404, 'NOT_FOUND', 'Purchase request not found')
  const m = matchCurrentStepRole(db, pr, user)
  if (!m) throw makeError(403, 'FORBIDDEN', 'Not authorized at the current step')

  const permissionFor: Record<string, string> = {
    approve: 'approval.approve',
    reject: 'approval.reject',
    hold: 'approval.hold',
    approve_with_exception: 'approval.approve_with_exception',
    resume: 'approval.resume',
  }
  requirePermission(user, permissionFor[action])

  if (action === 'resume') {
    if (pr.status !== 'on_hold') throw makeError(400, 'INVALID_STATE', 'Only held requests can be resumed')
    pr.status = 'under_review'
    pr.updated_at = nowIso()
    db.approvals.push({
      id: uid(), entity_type: 'purchase_request', entity_id: pr.id, step_order: m.step.step_order,
      action, approver_id: user.id, approver_name: user.name, comments: input.comments ?? '',
      exception_reason: null, financial_snapshot: validateFinancialForPr(db, pr), created_at: nowIso(),
    })
    audit(db, user, 'approval.resume', 'purchase_request', pr.id)
    save(db)
    return { status: pr.status, next_step: m.step.step_order }
  }

  if (pr.requested_by === user.id) {
    throw makeError(403, 'APPROVER_IS_CREATOR', 'Separation of duties: you cannot approve your own request') // FR-002 SoD
  }
  if (m.step.max_amount !== null && pr.total > m.step.max_amount) {
    throw makeError(403, 'AUTHORITY_INSUFFICIENT', `This request exceeds your step authority limit (${m.step.max_amount.toLocaleString()})`) // FR-003
  }

  const snapshot = validateFinancialForPr(db, pr)
  const finalStep = m.step.step_order === m.workflow.steps.length

  if (action === 'approve' || action === 'approve_with_exception') {
    if (finalStep && snapshot.risk_level === 'critical' && action !== 'approve_with_exception') {
      throw makeError(403, 'CRITICAL_RISK', 'Normal approval blocked — must approve with exception') // FR-005
    }
    if (action === 'approve_with_exception' && !input.exception_reason?.trim()) {
      throw makeError(400, 'VALIDATION_ERROR', 'An exception reason is required')
    }
    db.approvals.push({
      id: uid(), entity_type: 'purchase_request', entity_id: pr.id, step_order: m.step.step_order,
      action, approver_id: user.id, approver_name: user.name, comments: input.comments ?? '',
      exception_reason: input.exception_reason ?? null,
      financial_snapshot: snapshot, // FR-006
      created_at: nowIso(),
    })
    if (finalStep) {
      pr.status = 'approved'
      // FR-013: commitment on final approval (idempotent)
      if (!db.commitments.some((c) => c.entity_id === pr.id && c.status === 'active')) {
        db.commitments.push({
          id: uid(), entity_type: 'purchase_request', entity_id: pr.id, request_number: pr.request_number,
          amount: pr.total, released_amount: 0, remaining_amount: pr.total, status: 'active', created_at: nowIso(),
        })
      }
    } else {
      pr.status = 'under_review'
    }
    audit(db, user, `approval.${action}`, 'purchase_request', pr.id, { step: m.step.step_order })
  } else if (action === 'reject') {
    db.approvals.push({
      id: uid(), entity_type: 'purchase_request', entity_id: pr.id, step_order: m.step.step_order,
      action, approver_id: user.id, approver_name: user.name, comments: input.comments ?? '',
      exception_reason: null, financial_snapshot: snapshot, created_at: nowIso(),
    })
    pr.status = 'rejected'
    audit(db, user, 'approval.reject', 'purchase_request', pr.id) // creator notified via notifications (FR-014)
  } else if (action === 'hold') {
    db.approvals.push({
      id: uid(), entity_type: 'purchase_request', entity_id: pr.id, step_order: m.step.step_order,
      action, approver_id: user.id, approver_name: user.name, comments: input.comments ?? '',
      exception_reason: null, financial_snapshot: snapshot, created_at: nowIso(),
    })
    pr.status = 'on_hold'
    audit(db, user, 'approval.hold', 'purchase_request', pr.id)
  }
  pr.version += 1
  pr.updated_at = nowIso()
  save(db)
  const approvedSteps = new Set(db.approvals.filter((a) => a.entity_id === pr.id && a.action !== 'reject' && a.action !== 'hold' && a.action !== 'resume').map((a) => a.step_order))
  const next = m.workflow.steps.find((s) => !approvedSteps.has(s.step_order))
  return { status: pr.status, next_step: next ? next.step_order : null }
}

export async function approvalHistory(token: string, prId: string): Promise<ApprovalHistoryEntry[]> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.view')
  const db = load()
  return db.approvals
    .filter((a) => a.entity_id === prId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function listWorkflows(token: string): Promise<ApprovalWorkflow[]> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.view')
  return load().workflows
}

/** Active users who can take approval decisions — used to assign a step to a named approver. */
export async function listApprovers(token: string): Promise<Pick<User, 'id' | 'name' | 'role'>[]> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.configure_workflow')
  return load()
    .users.filter((u) => u.is_active && (u.permissions.includes('*') || u.permissions.includes('approval.approve')))
    .map((u) => ({ id: u.id, name: u.name, role: u.role }))
}

export async function createWorkflow(token: string, body: { name: string; description: string; is_active: boolean }): Promise<ApprovalWorkflow> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'approval.configure_workflow')
  const wf: ApprovalWorkflow = { id: uid(), name: body.name, description: body.description, is_active: body.is_active, steps: [], rules: [] }
  db.workflows.push(wf)
  audit(db, user, 'approval.workflow_created', 'workflow', wf.id)
  save(db)
  return wf
}

export async function addWorkflowStep(
  token: string,
  workflowId: string,
  step: { step_order: number; role_id: RoleName | null; user_id?: string | null; max_amount: number | null },
): Promise<ApprovalWorkflow> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'approval.configure_workflow')
  const wf = db.workflows.find((w) => w.id === workflowId)
  if (!wf) throw makeError(404, 'NOT_FOUND', 'Workflow not found')
  if (!step.role_id && !step.user_id) {
    throw makeError(400, 'VALIDATION_ERROR', 'Assign the step to an approver role or a specific approver')
  }
  if (step.user_id && !db.users.some((u) => u.id === step.user_id)) {
    throw makeError(400, 'VALIDATION_ERROR', 'Unknown approver')
  }
  // Exactly one of role_id / user_id (002 data-model) — a specific user wins.
  wf.steps.push({
    id: uid(),
    step_order: step.step_order,
    role_id: step.user_id ? null : step.role_id,
    user_id: step.user_id ?? null,
    max_amount: step.max_amount,
  })
  wf.steps.sort((a, b) => a.step_order - b.step_order)
  audit(db, user, 'approval.workflow_step_added', 'workflow', wf.id, { step_order: step.step_order })
  save(db)
  return wf
}

export async function addWorkflowRule(token: string, workflowId: string, rule: { min_amount: number; max_amount: number | null; category: string | null }): Promise<ApprovalWorkflow> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'approval.configure_workflow')
  const wf = db.workflows.find((w) => w.id === workflowId)
  if (!wf) throw makeError(404, 'NOT_FOUND', 'Workflow not found')
  wf.rules.push({ id: uid(), min_amount: rule.min_amount, max_amount: rule.max_amount, category: rule.category as ApprovalWorkflow['rules'][number]['category'] })
  audit(db, user, 'approval.workflow_rule_added', 'workflow', wf.id)
  save(db)
  return wf
}

// ── 003-financial-engine ──────────────────────────────────────────────────
export async function availableFunds(token: string): Promise<FinancialPosition> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.view')
  return position(load())
}

export async function enterFunds(token: string, amount: number, reason: string): Promise<FinancialPosition> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'financial.manage_current_funds')
  if (!reason.trim()) throw makeError(400, 'VALIDATION_ERROR', 'A reason is required') // FR-012
  db.fundEntries.push({ id: uid(), amount, reason, entered_at: nowIso() })
  audit(db, user, 'financial.funds_entered', 'fund_entry', 'current', { amount, reason })
  save(db)
  return position(db)
}

export async function listCommitments(token: string): Promise<FinancialCommitment[]> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.view')
  return load().commitments
}

export async function releaseCommitment(token: string, id: string, amount: number, reason: string): Promise<FinancialCommitment> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'commitment.adjust')
  if (!reason.trim()) throw makeError(400, 'VALIDATION_ERROR', 'A reason is required')
  const c = db.commitments.find((x) => x.id === id)
  if (!c) throw makeError(404, 'NOT_FOUND', 'Commitment not found')
  if (amount <= 0 || amount > c.remaining_amount) throw makeError(400, 'VALIDATION_ERROR', 'Amount must be positive and not exceed the remaining commitment')
  c.released_amount += amount
  c.remaining_amount = c.amount - c.released_amount
  c.status = c.remaining_amount === 0 ? 'fully_released' : 'partially_released'
  audit(db, user, 'commitment.released', 'commitment', c.id, { amount, reason, remaining: c.remaining_amount })
  save(db)
  return c
}

export async function listBudgets(token: string): Promise<Budget[]> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.view')
  const db = load()
  // Warning is derived, never stored — a stale badge can't drift from the numbers.
  return db.budgets.map((b) => ({
    ...b,
    lines: b.lines.map((l) => ({ ...l, warning: budgetWarning(l.allocated, l.remaining) })),
  }))
}

export async function createBudgetLine(token: string, budgetId: string, line: { category: string; allocated: number }): Promise<BudgetLine> {
  await wait(LATENCY)
  const db = load()
  const user = requireUser(token)
  requirePermission(user, 'budget.create')
  const budget = db.budgets.find((b) => b.id === budgetId)
  if (!budget) throw makeError(404, 'NOT_FOUND', 'Budget not found')
  const newLine: BudgetLine = {
    id: uid(), budget_id: budget.id, category: line.category as BudgetLine['category'],
    allocated: line.allocated, used: 0, committed: 0, remaining: line.allocated, warning: 'safe',
  }
  budget.lines.push(newLine)
  audit(db, user, 'budget.line_created', 'budget_line', newLine.id, { allocated: line.allocated })
  save(db)
  return newLine
}

export async function financialDashboard(token: string): Promise<FinancialValidation & { budget_utilization: { category: string; allocated: number; remaining: number; warning: string }[] }> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.view')
  const db = load()
  const pos = position(db)
  const worst: FinancialValidation['risk_level'] = pos.available < 0 ? 'critical' : pos.available < pos.current_funds * 0.2 ? 'warning' : 'safe'
  return {
    ...pos,
    projected_position: pos.available,
    risk_level: worst,
    budget: null,
    budget_utilization: db.budgets.flatMap((b) =>
      b.lines.map((l) => ({ category: l.category, allocated: l.allocated, remaining: l.remaining, warning: budgetWarning(l.allocated, l.remaining) })),
    ),
  }
}

export async function auditLog(token: string): Promise<AuditEvent[]> {
  await wait(LATENCY)
  const user = requireUser(token)
  requirePermission(user, 'approval.view')
  const db = load()
  return [...db.audit].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100)
}

export { PR_CATEGORIES }
