# API Planning

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/purchase-request, specs/approval-workflow, specs/financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. API Design Principles

### Standards

- RESTful architecture with JSON payloads
- Consistent URL patterns across all domains
- Standard HTTP methods: GET (read), POST (create), PUT (full update), PATCH (partial update), DELETE (soft delete)
- Pagination for all list endpoints
- Filtering via query parameters
- Sorting via query parameters
- Consistent error response structure
- Tenant context resolved from JWT (not user-provided)

### URL Convention

```
GET    /api/v1/{resource}           - List (paginated, filterable)
POST   /api/v1/{resource}           - Create
GET    /api/v1/{resource}/{id}      - Read
PUT    /api/v1/{resource}/{id}      - Full update
PATCH  /api/v1/{resource}/{id}      - Partial update
DELETE /api/v1/{resource}/{id}      - Soft delete

GET    /api/v1/{resource}/{id}/{sub-resource}  - List sub-resources
POST   /api/v1/{resource}/{id}/{sub-resource}  - Create sub-resource
```

### Response Structure

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

### Error Structure

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

---

## 2. Authentication Endpoints

### POST /api/v1/auth/login

- Authenticate user credentials
- Returns access token + refresh token
- No tenant context needed (user may belong to multiple orgs)

### POST /api/v1/auth/refresh

- Refresh access token using refresh token
- Returns new token pair

### POST /api/v1/auth/logout

- Invalidate refresh token
- Clear session

### POST /api/v1/auth/switch-organization

- Switch active organization context
- Returns new access token with updated org claim

### POST /api/v1/auth/password-change

- Change password (requires current password)
- Invalidate all refresh tokens

### POST /api/v1/auth/password-reset-request

- Request password reset email

### POST /api/v1/auth/password-reset

- Reset password using email token

---

## 3. Organization Endpoints

### GET /api/v1/organizations/current

- Get current organization details

### PATCH /api/v1/organizations/current

- Update organization settings (Owner only)

### GET /api/v1/organizations/current/stats

- Get organization statistics (user count, branch count, etc.)

---

## 4. Branch Endpoints

### GET /api/v1/branches

- List branches (paginated, filterable by status)

### POST /api/v1/branches

- Create branch (permission: organization.manage_branches)

### GET /api/v1/branches/{id}

- Get branch details

### PATCH /api/v1/branches/{id}

- Update branch details

### PATCH /api/v1/branches/{id}/status

- Activate/deactivate branch

---

## 5. Department Endpoints

### GET /api/v1/departments

- List departments (filterable by branch)

### POST /api/v1/departments

- Create department (permission: organization.manage_departments)

### GET /api/v1/departments/{id}

- Get department details

### PATCH /api/v1/departments/{id}

- Update department

### PATCH /api/v1/departments/{id}/status

- Activate/deactivate department

---

## 6. User Endpoints

### GET /api/v1/users

- List users (paginated, filterable by branch, department, status)

### POST /api/v1/users

- Create user (permission: user.create)

### GET /api/v1/users/{id}

- Get user details

### PATCH /api/v1/users/{id}

- Update user details

### PATCH /api/v1/users/{id}/status

- Activate/deactivate user

### GET /api/v1/users/{id}/roles

- Get user's roles

### POST /api/v1/users/{id}/roles

- Assign role to user (permission: user.assign_roles)

### DELETE /api/v1/users/{id}/roles/{role_id}

- Remove role from user

---

## 7. Role and Permission Endpoints

### GET /api/v1/roles

- List roles

### GET /api/v1/roles/{id}

- Get role with assigned permissions

### GET /api/v1/permissions

- List all available permissions (system-wide catalog)

### GET /api/v1/permissions/{code}

- Get permission details

> Note: Custom role CRUD (POST/PATCH/DELETE /roles) is deferred — roles are baseline-defined per the specs for the initial release.

---

## 8. Purchase Request Endpoints

### GET /api/v1/purchase-requests

- List purchase requests (paginated, filterable by status, department, branch, date range)

### POST /api/v1/purchase-requests

- Create purchase request (permission: purchase_request.create)
- Validation: request must contain at least one item (P1.1)

### GET /api/v1/purchase-requests/{id}

- Get purchase request details with items

### PATCH /api/v1/purchase-requests/{id}

- Update draft purchase request (permission: purchase_request.edit)
- Editing an already-submitted request resets it to draft and invalidates prior approval responses (P2.2/P2.4 resume)

### POST /api/v1/purchase-requests/{id}/submit

- Submit for approval (permission: purchase_request.submit)
- Runs duplicate detection

### POST /api/v1/purchase-requests/{id}/recall

- Recall back to draft (permission: purchase_request.recall only for accessible-eligible statuses, P2.1)

### POST /api/v1/purchase-requests/{id}/cancel

- Cancel request (permission: purchase_request.cancel, mandatory reason)

### GET /api/v1/purchase-requests/{id}/approvals

- Get approval history for this request

### GET /api/v1/purchase-requests/{id}/financial-impact

- Get financial impact summary (for approver view): current funds, commitments, obligations, pending payments, projected position (obligations/pending payments = 0 until built)

### GET /api/v1/purchase-requests/{id}/duplicate-check

- Run duplicate detection check

---

## 9. Approval Endpoints

### GET /api/v1/approvals/pending

- List pending approvals for current user

### POST /api/v1/approvals/{entity_type}/{entity_id}/approve

- Approve entity (permission: approval.approve)
- Creates financial commitment in the same transaction (P1.3 idempotent)

### POST /api/v1/approvals/{entity_type}/{entity_id}/reject

- Reject entity (permission: approval.reject)
- Requires rejection reason

### POST /api/v1/approvals/{entity_type}/{entity_id}/hold

- Hold entity (permission: approval.hold)
- Requires hold reason; later resumable (P2.4)

### POST /api/v1/approvals/{entity_type}/{entity_id}/approve-exception

- Approve with exception (permission: approval.approve_with_exception)
- Requires exception reason, higher authority, financial impact snapshot

### GET /api/v1/approvals/workflows

- List approval workflows

### POST /api/v1/approvals/workflows

- Create approval workflow (permission: approval.configure_workflow)

### GET /api/v1/approvals/workflows/{id}

- Get workflow with rules and steps

### PATCH /api/v1/approvals/workflows/{id}

- Update approval workflow (P2.5)

### DELETE /api/v1/approvals/workflows/{id}

- Deactivate/delete approval workflow (P2.5)

---

## 10. Purchase Order Endpoints (PR to PO conversion, P3.1)

### GET /api/v1/purchase-orders

- List purchase orders (paginated, filterable)

### POST /api/v1/purchase-orders

- Create purchase order from an approved purchase request (permission: purchase_order.create)
- Items copied from the PR; linked to PR and assigned to a supplier

### GET /api/v1/purchase-orders/{id}

- Get PO details with items

### POST /api/v1/purchase-orders/{id}/cancel

- Cancel PO (requires reason; releases the related commitment for the unfulfilled portion)

---

## 11. Commitment Endpoints

### GET /api/v1/commitments

- List active financial commitments

### GET /api/v1/commitments/summary

- Get commitment summary (total active, released, etc.)

### GET /api/v1/commitments/{id}

- Get commitment details

### POST /api/v1/commitments/{id}/adjust

- Manually adjust/release commitment (permission: commitment.adjust) (P1.4)
- Requires reason and permanent audit record
- Is idempotent per source entity (P1.3)

---

## 12. Budget Endpoints

### GET /api/v1/budgets

- List budgets

### POST /api/v1/budgets

- Create budget (permission: budget.create)

### GET /api/v1/budgets/{id}

- Get budget with lines

### PATCH /api/v1/budgets/{id}

- Update budget

### GET /api/v1/budgets/{id}/lines

- List budget lines

### POST /api/v1/budgets/{id}/lines

- Create budget line

### PATCH /api/v1/budgets/{id}/lines/{line_id}

- Update budget line allocation

### POST /api/v1/budgets/{id}/lines/{line_id}/adjust

- Adjust budget line (permission: budget.adjust, reason + approval above threshold)

### POST /api/v1/budgets/{id}/lines/{line_id}/transfer

- Transfer to another line (permission: budget.transfer, requires approval on source and destination)

---

## 13. Dashboard Endpoints

### GET /api/v1/dashboard/summary

- Get dashboard summary (current funds, total commitments, available funds)

### GET /api/v1/dashboard/pending-approvals

- Get pending approvals count and summary

### GET /api/v1/dashboard/financial-status

- Get financial status indicator (Safe/Warning/Critical)

### GET /api/v1/dashboard/budget-utilization

- Get budget utilization summary

---

## 14. Notification Endpoints

### GET /api/v1/notifications

- List notifications (paginated, filterable by type, read status)

### GET /api/v1/notifications/unread-count

- Get unread notification count

### PATCH /api/v1/notifications/{id}/read

- Mark notification as read

### PATCH /api/v1/notifications/read-all

- Mark all notifications as read

### GET /api/v1/notifications/preferences

- Get notification preferences

### PATCH /api/v1/notifications/preferences

- Update notification preferences

---

## 15. Audit Endpoints

### GET /api/v1/audit

- List audit logs (paginated, filterable by user, action, entity, date range)

### GET /api/v1/audit/{entity_type}/{entity_id}

- Get audit trail for specific entity

---

## 16. API Versioning

- URL-based versioning: /api/v1/, /api/v2/
- Current version: v1
- Breaking changes require new version
- Non-breaking additions (new fields, new endpoints) added to current version
- Deprecated versions supported for a migration period

---

## 17. API Documentation

- Auto-generated from FastAPI using OpenAPI/Swagger
- Available at /docs (Swagger UI) and /openapi.json
- Requires authentication to access in production

---

## 18. Deferred: Outside 3-Spec Scope (Future Phase)

These domains are not part of the purchase-request / approval-workflow / financial-engine specs. Their endpoint plans are preserved here for the future roadmap; the financial engine spec explicitly returns 0 for obligations and pending payments until built.

- **Platform Admin (Super Admin):** /platform/organizations CRUD + suspend/reactivate/close; /platform/plans; /platform/modules; /platform/entitlements; /platform/audit; /platform/analytics; auth /auth/platform-login.
- **Supplier Management:** full supplier CRUD, contacts, documents, bank accounts, 360 view, history, merge (POST /suppliers/merge). In-scope only as a supplier reference/link on POs.
- **Purchase Order (full lifecycle):** PO submit/approve/send-to-supplier; receiving records and items.
- **Receiving:** record/adjust receiving against POs.
- **Invoices & 3-Way Matching:** invoice CRUD, match, dispute, variance exception, invoice items.
- **Liabilities:** liability definitions, occurrences, skip/cancel, obligation generation.
- **Accounts Payable:** aging buckets, AP summary, payment scheduling.
- **Payments:** payment CRUD, approve/execute/reverse, allocations.
- **Reports:** supplier spending/outstanding, liabilities, payments, cash-flow forecast, export (CSV/PDF). Budget-utilization and commitments reporting remain useful and may be added.
- **Subscription:** current subscription, plans, upgrade/downgrade, usage limits.
- **Dashboard cash-flow projection:** `GET /api/v1/dashboard/cash-flow`.

---

*This document defines the REST API boundary planning. Implementation will derive the exact request/response schemas from this plan.*