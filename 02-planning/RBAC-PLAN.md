# RBAC & Authorization Planning

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/001-purchase-request, specs/002-approval-workflow, specs/003-financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. Authorization Architecture

### Core Principle

Authorization is enforced at the **backend service and data-access layers**. The React frontend is never the security boundary. Every API endpoint, every service method, and every database query enforces permission checks.

### Two-Layer Authorization Model

Authorization is enforced in two distinct layers for the current scope:

```
Layer 1: Organization Level (Org Owner / Admin)
  - Manage users, roles, permissions, branches, departments within their org
  - Cannot access other organizations

Layer 2: User Level (RBAC)
  - Granular permissions with scope and financial authority
  - Configurable per organization
```

> Deferred: Layer 0 (Platform Super Admin — cross-tenant management of organizations, plans, modules, entitlements) is outside the 3-spec scope.

### Authorization Chain

Every API request must pass through the following checks, in order:

```
Step 1: Authenticate (JWT token valid?)
Step 2: Identify Organization / Tenant (org_id from JWT)
Step 3: Tenant Isolation Check (data belongs to this org?)
Step 4: Subscription Status Check (is plan active?)            [deferred]
Step 5: Module Entitlement Check (is module enabled for org?)  [deferred]
Step 6: RBAC Permission Check (does user have required permission?)
Step 7: Branch / Department Scope Check (is user scoped to this location?)
Step 8: Approval Authority Check (can user approve this amount?)
Step 9: Business Rule Check (workflow rules, SoD rules)
→ Allow or Deny
```

Steps 4–5 are marked deferred until subscription/billing is built (SAAS-PLAN §5–§7).

### Hierarchy

```
Organization (Tenant)
    |
    v
Users (belong to organization)
    |
    v
Roles (assigned to users within organization)
    |
    v
Permissions (granted to roles)
    |
    v
Scope (global, branch, department)
    |
    v
Financial Authority (max_amount per permission)
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Roles are per-organization | A user's role in Org A has no bearing on Org B |
| Permissions are global definitions | The permission catalog is system-wide; role grants are per-org |
| Scope is per-role-permission grant | Same role can have different scope in different contexts |
| Financial authority is configurable | Amount limits are not hard-coded (spec: authority limits per role) |
| Custom roles deferred | Baseline roles only for initial release; custom roles later |

---

## 2. Baseline Roles

### Organization-Level Roles

| Role | Description | System Role |
|---|---|---|
| Organization Owner | Full control over the organization, max authority | Yes |
| Finance Manager | Financial controls oversight (commitments, budgets, funds) | Yes |
| Procurement Officer | Purchase request creation, submission, PO conversion | Yes |
| Department Manager | Department-level request and approval control | Yes |
| Coordinator | Department-level request creation | Yes |
| Approver | Assigned approval authority on workflow steps | Yes |
| Auditor | Read-only access to all data and audit trail | Yes |
| Viewer | Read-only access to authorized modules | Yes |

> Deferred: Platform Admin role, Director, Accountant, and custom roles (outside 3-spec scope / later release).

---

## 3. Permission Catalog (In-Scope)

### 3.1 Organization Management

| Permission Code | Action |
|---|---|
| organization.view | View organization settings |
| organization.edit | Edit organization settings |
| organization.manage_branches | Create/edit branches |
| organization.manage_departments | Create/edit departments |

### 3.2 User Management

| Permission Code | Action |
|---|---|
| user.view | View user list |
| user.create | Create new users |
| user.edit | Edit user details |
| user.deactivate | Deactivate users |
| user.assign_roles | Assign roles to users |

### 3.3 Role and Permission Management

| Permission Code | Action |
|---|---|
| role.view | View roles |
| role.edit | Edit baseline role permissions (amount limits, workflow assignment) |

> Deferred: role.create / role.delete (custom roles later).

### 3.4 Purchase Request Management

| Permission Code | Action |
|---|---|
| purchase_request.view | View purchase requests |
| purchase_request.create | Create new purchase requests |
| purchase_request.edit | Edit draft requests |
| purchase_request.submit | Submit requests for approval |
| purchase_request.recall | Recall submitted request back to draft (P2.1) |
| purchase_request.cancel | Cancel a request (mandatory reason) |
| purchase_request.view_approvals | View approval history |

### 3.5 Approval Management

| Permission Code | Action |
|---|---|
| approval.view | View pending approvals |
| approval.approve | Approve requests |
| approval.reject | Reject requests |
| approval.hold | Place requests on hold |
| approval.resume | Resume a held request (P2.4) |
| approval.approve_with_exception | Approve despite financial/duplicate warnings |
| approval.configure_workflow | Configure approval workflows (P2.5) |
| approval.view_workflow | View approval workflow definitions |

### 3.6 Purchase Order Management (P3.1)

| Permission Code | Action |
|---|---|
| purchase_order.view | View purchase orders |
| purchase_order.create | Create purchase orders from approved requests |
| purchase_order.cancel | Cancel purchase orders (releases commitment) |

> Deferred: purchase_order.edit/approve/amend (full PO lifecycle later).

### 3.7 Budget Management

| Permission Code | Action |
|---|---|
| budget.view | View budgets |
| budget.create | Create budgets |
| budget.edit | Edit budget allocations |
| budget.adjust | Make budget adjustments |
| budget.transfer | Transfer between budget lines |
| budget.approve_adjustment | Approve budget adjustments |

### 3.8 Financial Commitments & Funds

| Permission Code | Action |
|---|---|
| commitment.view | View financial commitments |
| commitment.adjust | Manually adjust/release commitments (P1.4) |
| financial.current_funds_entry | Enter/adjust current funds with mandatory reason (P1.2) |
| financial.view_positions | View available funds position |

### 3.9 Audit Trail

| Permission Code | Action |
|---|---|
| audit.view | View audit trail |

### 3.10 Notification Management

| Permission Code | Action |
|---|---|
| notification.view | View notifications and unread count |
| notification.configure | Configure notification preferences |

### 3.11 Deferred Permissions (Future Roadmap)

Preserved from the full catalog but **not part of the 3-spec scope**: platform.* (Super Admin), supplier.* (module deferred), receiving.*, invoice.*, matching.*, liability.*, accounts_payable.*, payment.*, subscription.*, report.supplier / report.finance / report.management / report.export (reporting limited to dashboard + commitments/budget summaries).

---

## 4. Default Role-Permission Mapping

### Organization Owner

All in-scope permissions. Maximum authority (no amount limit by default).

### Finance Manager

- All financial module permissions: commitment.view, commitment.adjust, financial.current_funds_entry, financial.view_positions
- All budget permissions (budget.view/create/edit/adjust/transfer/approve_adjustment)
- purchase_request.view, approval.approve, approval.reject, approval.hold, approval.resume, approval.approve_with_exception
- purchase_order.view, purchase_order.cancel
- audit.view, notification.view/configure

Authority limit: configurable per category.

### Procurement Officer

- purchase_request.view, purchase_request.create, purchase_request.edit, purchase_request.submit, purchase_request.recall, purchase_request.cancel
- purchase_order.view, purchase_order.create, purchase_order.cancel (P3.1)
- approval.view (see pending status), notification.view
- budget.view (read-only), commitment.view, financial.view_positions

### Department Manager

- purchase_request.view (own department), purchase_request.create, purchase_request.submit, purchase_request.edit, purchase_request.recall
- approval.approve, approval.reject, approval.hold, approval.resume (own department, within authority limit)
- budget.view (own department), commitment.view, financial.view_positions

Authority limit: configurable, typically department-level.

### Coordinator

- purchase_request.view (own department), purchase_request.create, purchase_request.submit, purchase_request.edit, purchase_request.recall
- notification.view

No approval authority.

### Approver

- approval.view, approval.approve, approval.reject, approval.hold, approval.resume (per workflow step assignment)
- approval.approve_with_exception where granted

### Auditor

All view permissions across modules (purchase_request.view, approval.view, purchase_order.view, budget.view, commitment.view, financial.view_positions, audit.view). No create, edit, approve, or delete permissions. Full audit trail access.

### Viewer

Read-only access to modules as configured by the organization. No action permissions.

---

## 5. Approval Authority Model

### Authority Configuration

Approval authority is configured per role-permission grant:

```
role_permissions.scope = branch | department | global
role_permissions.max_amount = DECIMAL(15, 2)  (nullable = no limit)
```

### Authority Resolution Rules

1. A user may hold multiple roles; their effective authority is the **highest** across all their roles for the relevant scope
2. Authority is checked against the transaction's branch and department context
3. If a user has branch-scoped authority, they can only approve transactions within that branch
4. If a user has department-scoped authority, they can only approve transactions within that department
5. Global authority means the user can approve across all branches and departments

### Workflow-Step Authority

Authority also applies per workflow step (approval_workflow_steps.max_amount). An approver reaching step N must have authority >= the request amount (spec: authority-based routing/step control).

### Escalation Rules

When an approver does not have sufficient authority:

1. The system automatically identifies the next qualifying authority level
2. The approval is escalated to that level
3. The original approver is notified that escalation occurred
4. The escalation is logged in the audit trail

### Self-Approval Prevention

- A user cannot approve their own purchase request (spec: SoD)
- An explicit, audited override is available only if organization policy allows it (e.g., Owner approving their own emergency purchase)
- Self-approval prevention is enforced at the backend, not the UI

> Deferred: delegation/unavailability handling is noted but simplified for v1 (no delegation rules; escalates to next step).

---

## 6. Separation of Duties (SoD)

### Enforced Separations (In-Scope)

| Rule | Description | Enforcement |
|---|---|---|
| Request Creator != Request Approver | The person who creates a request cannot approve it | Backend validation at approval time |
| Approver != Same-Role Collusion Path | A user acting in two assigned steps cannot approve both steps of the same request | Backend validates across workflow steps |

> Deferred: Payment Creator != Payment Approver, Journal Entry SoD, Invoice SoD (payment/invoice modules not in scope).

### Implementation

Separation of duties is enforced in the **backend service layer**, not in the React frontend. The approval endpoint checks the approver user_id against the creator and the prior step's approver.

### Exceptions

- Organization Owner may bypass SoD rules with explicit, audited override
- Emergency/urgent workflows may have configurable SoD exceptions
- All SoD exceptions are logged in the audit trail

---

## 7. Permission Enforcement Points

### API Layer (Middleware)

1. Extract JWT token and resolve user identity
2. Resolve tenant context (organization_id)
3. Check endpoint-level permission (e.g., purchase_request.create)
4. Check scope (branch/department if applicable)

### Service Layer

- Check business operation permission (e.g., can this user approve this specific request?)
- Check financial authority (is the amount within the user's approval limit?)
- Check separation of duties (is the user the creator/prior approver of this entity?)
- Validate workflow step match (P2.6: only assigned step role/user may act)

### Repository Layer

- Enforce tenant isolation (mandatory organization_id filter)
- Enforce scope filtering (branch/department if user has scoped access)
- Never return data from other tenants

---

## 8. Audit Requirements for RBAC

Every permission-related action must be audited:

| Action | Audit Details |
|---|---|
| Role modified | Who modified, what changed, amount limits |
| User role assigned | Who assigned, to whom, role, scope |
| User role removed | Who removed, from whom, role |
| Permission denied | Who was denied, what they tried to do, why |
| Approval authority used | Who approved, amount, authority limit, entity |
| Authority exceeded (escalation) | Who was escalated to, from whom, reason |
| SoD exception | Who bypassed SoD, what rule, reason |

---

## 9. RBAC Configuration Interface

### Organization Owner

The Organization Owner must be able to:

1. Assign baseline roles to users with branch/department scope
2. Set approval authority (amount) limits per role
3. Configure approval workflows and their steps/rules
4. Set workflow-step role/user assignments and limits
5. View RBAC audit trail

All RBAC configuration changes are versioned and audited.

> Deferred: custom role creation/editing, delegation rules, SoD rule configuration UI, platform-level RBAC.

---

*This document defines the RBAC and authorization planning. Implementation will derive the final permission set from this catalog.*