# Database Plan

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/001-purchase-request, specs/002-approval-workflow, specs/003-financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. Database Strategy

### Technology

- PostgreSQL as the primary relational database
- SQLAlchemy (async) as the ORM
- Single database instance, shared schema with organization_id isolation

### Design Principles

| Principle | Implementation |
|---|---|
| Tenant isolation | Every business table has organization_id foreign key |
| Primary keys | UUIDs (no sequential global IDs leaking across tenants) |
| Referential integrity | Foreign keys enforced at database level |
| Financial integrity | CHECK constraints on amounts, balance enforcement |
| Audit append-only | Audit table has no UPDATE or DELETE permissions |
| Concurrency | Optimistic locking with version column on financial records; advisory locks for available-funds calculation |
| No silent deletion | Soft deletes (is_deleted, deleted_at) for business data |
| Status tracking | String enums for readability (not integer codes) |
| History | Status change history tables for critical entities (approval_history, audit_logs) |

---

## 2. Core Entities

### 2.1 Organization and Tenant

**organizations** - Top-level tenant boundary
- id (UUID, PK)
- name (VARCHAR 255, NOT NULL)
- slug (VARCHAR 100, UNIQUE, NOT NULL)
- industry (VARCHAR 100)
- base_currency (VARCHAR 3, NOT NULL) - ISO 4217
- fiscal_year_start_month (INT, NOT NULL, DEFAULT 1)
- status (VARCHAR 20, NOT NULL) - active, trial, suspended, expired, closed
- owner_user_id (UUID, FK -> users.id)
- created_at, updated_at (TIMESTAMP, NOT NULL)
- version (INT, NOT NULL, DEFAULT 1)

### 2.2 Branch and Department

**branches**
- id (UUID, PK)
- organization_id (UUID, FK -> organizations.id, NOT NULL)
- name (VARCHAR 255, NOT NULL)
- code (VARCHAR 50, NOT NULL)
- status (VARCHAR 20, NOT NULL) - active, inactive
- manager_id (UUID, FK -> users.id)
- created_at, updated_at, version

Unique constraint: (organization_id, code)

**departments**
- id (UUID, PK)
- organization_id (UUID, FK -> organizations.id, NOT NULL)
- branch_id (UUID, FK -> branches.id, NOT NULL)
- name (VARCHAR 255, NOT NULL)
- code (VARCHAR 50, NOT NULL)
- status (VARCHAR 20, NOT NULL) - active, inactive
- manager_id (UUID, FK -> users.id)
- created_at, updated_at, version

Unique constraint: (organization_id, branch_id, code)

### 2.3 Users

**users**
- id (UUID, PK)
- organization_id (UUID, FK -> organizations.id, NOT NULL)
- email (VARCHAR 255, NOT NULL)
- full_name (VARCHAR 255, NOT NULL)
- password_hash (VARCHAR 255, NOT NULL)
- status (VARCHAR 20, NOT NULL) - active, inactive
- created_at, updated_at, version

Unique constraint: (organization_id, email)

**user_branch_departments** - Maps users to branch/department assignments
- id, user_id, organization_id, branch_id, department_id

### 2.4 Roles and Permissions (RBAC)

**roles**
- id (UUID, PK)
- organization_id (UUID, FK -> organizations.id, NOT NULL)
- name (VARCHAR 100, NOT NULL)
- description (TEXT)
- is_system (BOOLEAN, NOT NULL, DEFAULT FALSE)
- created_at, updated_at

Unique constraint: (organization_id, name)

**permissions** - Global permission definitions (not tenant-scoped)
- id (UUID, PK)
- code (VARCHAR 100, UNIQUE, NOT NULL) - e.g., purchase_request.create
- entity (VARCHAR 50, NOT NULL)
- action (VARCHAR 50, NOT NULL)
- description (TEXT)

**role_permissions**
- id (UUID, PK)
- role_id (UUID, FK -> roles.id, NOT NULL)
- permission_id (UUID, FK -> permissions.id, NOT NULL)
- scope (VARCHAR 20, DEFAULT global) - global, branch, department
- max_amount (DECIMAL 15, 2, nullable) - Financial authority limit

Unique constraint: (role_id, permission_id)

**user_roles**
- id (UUID, PK)
- user_id (UUID, FK -> users.id, NOT NULL)
- organization_id (UUID, FK -> organizations.id, NOT NULL)
- role_id (UUID, FK -> roles.id, NOT NULL)
- branch_id (UUID, nullable) - Optional scope
- department_id (UUID, nullable) - Optional scope

Unique constraint: (user_id, organization_id, role_id, branch_id, department_id)

### 2.5 Purchase Requests

**purchase_requests**
- id (UUID, PK)
- organization_id (UUID, FK -> organizations.id, NOT NULL)
- request_number (VARCHAR 50, NOT NULL) - Tenant-unique sequential
- branch_id (UUID, FK -> branches.id, NOT NULL)
- department_id (UUID, FK -> departments.id, NOT NULL)
- requested_by (UUID, FK -> users.id, NOT NULL)
- request_date (DATE, NOT NULL)
- required_by_date (DATE)
- category (VARCHAR 50, NOT NULL)
- priority (VARCHAR 20, NOT NULL, DEFAULT normal) - low, normal, high, urgent
- justification (TEXT)
- preferred_supplier_id (UUID, nullable)
- budget_category_id (UUID, nullable)
- status (VARCHAR 30, NOT NULL) - draft, submitted, under_review, approved, rejected, on_hold, purchase_ordered, cancelled
- notes (TEXT)
- version (INT, NOT NULL, DEFAULT 1) - Optimistic lock for concurrent transitions (P2.3)
- created_at, updated_at

Unique constraint: (organization_id, request_number)

**purchase_request_items**
- id, purchase_request_id, organization_id
- description (VARCHAR 500, NOT NULL)
- quantity (DECIMAL 10, 2, NOT NULL, CHECK > 0)
- unit_price (DECIMAL 15, 2, NOT NULL, CHECK >= 0)
- total_price (DECIMAL 15, 2, GENERATED ALWAYS AS quantity * unit_price)
- notes (TEXT)

**current_funds** - Manual current-funds balance entry with mandatory reason and audit (P1.2)
- id, organization_id
- amount (DECIMAL 15, 2, NOT NULL)
- reason (TEXT, NOT NULL)
- entered_by (UUID, FK -> users.id, NOT NULL)
- entered_at (TIMESTAMP, NOT NULL)

### 2.6 Approval Workflow

**approval_workflows**
- id, organization_id, name, description, is_active, created_at, updated_at

**approval_workflow_rules** - Routing rules per workflow
- id, workflow_id, organization_id
- min_amount, max_amount (DECIMAL 15, 2)
- category (VARCHAR 50)
- branch_id, department_id (UUID, nullable)

**approval_workflow_steps** - Sequential steps within a workflow
- id, workflow_id, organization_id
- step_order (INT, NOT NULL)
- role_id (UUID, nullable) - Required role
- user_id (UUID, nullable) - Specific user
- max_amount (DECIMAL 15, 2) - Authority limit for this step

**approval_history** - Immutable record of all approval actions
- id, organization_id
- entity_type (VARCHAR 50, NOT NULL) - purchase_request
- entity_id (UUID, NOT NULL)
- workflow_step_id (UUID, nullable)
- approver_id (UUID, FK -> users.id, NOT NULL)
- action (VARCHAR 20, NOT NULL) - approve, reject, hold, resume, approve_with_exception
- comments (TEXT)
- financial_snapshot (JSONB) - Available funds at time of decision
- exception_reason (TEXT)
- created_at (TIMESTAMP, NOT NULL)

### 2.7 Duplicate Detection

**duplicate_detection_log**
- id, organization_id
- entity_type (VARCHAR 50, NOT NULL)
- entity_id (UUID, NOT NULL)
- duplicate_entity_type (VARCHAR 50, NOT NULL)
- duplicate_entity_id (UUID, NOT NULL)
- match_score (DECIMAL 3, 2) - 0.00 to 1.00 confidence
- match_reason (TEXT)
- overridden (BOOLEAN, DEFAULT FALSE)
- override_reason (TEXT)
- overridden_by (UUID, nullable)
- created_at

### 2.8 Purchase Orders (PR to PO conversion, P3.1)

**purchase_orders**
- id, organization_id
- po_number (VARCHAR 50, NOT NULL) - Tenant-unique
- purchase_request_id (UUID, FK, NOT NULL)
- supplier_id (UUID, nullable) - Supplier reference only; full supplier module deferred
- branch_id (UUID, FK, NOT NULL)
- department_id (UUID, FK, NOT NULL)
- total_amount (DECIMAL 15, 2, NOT NULL)
- delivery_date (DATE)
- status (VARCHAR 30, NOT NULL) - draft, sent, cancelled
- notes (TEXT)
- created_at, updated_at, version

Unique constraint: (organization_id, po_number)

**purchase_order_items**
- id, purchase_order_id, organization_id
- purchase_request_item_id (UUID, nullable)
- description (VARCHAR 500, NOT NULL)
- quantity (DECIMAL 10, 2, NOT NULL, CHECK > 0)
- unit_price (DECIMAL 15, 2, NOT NULL)
- total_price (DECIMAL 15, 2, NOT NULL)

### 2.9 Financial Commitments

**financial_commitments**
- id, organization_id
- branch_id, department_id (UUID, nullable)
- entity_type (VARCHAR 50, NOT NULL) - purchase_request, purchase_order
- entity_id (UUID, NOT NULL)
- amount (DECIMAL 15, 2, NOT NULL)
- released_amount (DECIMAL 15, 2, NOT NULL, DEFAULT 0)
- remaining_amount (DECIMAL 15, 2, GENERATED ALWAYS AS amount - released_amount)
- status (VARCHAR 20, NOT NULL) - active, partially_released, fully_released
- created_at, updated_at, version

Idempotency: a commitment must be created at most once per source entity (unique partial index on (entity_type, entity_id) where active, P1.3).

### 2.10 Budget Management

**budgets**
- id, organization_id
- name (VARCHAR 255, NOT NULL)
- period_type (VARCHAR 20, NOT NULL) - annual, monthly, quarterly
- period_start (DATE, NOT NULL)
- period_end (DATE, NOT NULL)
- status (VARCHAR 20, NOT NULL) - draft, active, closed
- created_at, updated_at, version

**budget_lines**
- id, budget_id, organization_id
- branch_id, department_id (UUID, nullable)
- category (VARCHAR 50, NOT NULL)
- allocated (DECIMAL 15, 2, NOT NULL)
- used (DECIMAL 15, 2, NOT NULL, DEFAULT 0)
- committed (DECIMAL 15, 2, NOT NULL, DEFAULT 0)
- remaining (DECIMAL 15, 2, GENERATED ALWAYS AS allocated - used - committed)
- warning_threshold_pct (DECIMAL 5, 2, DEFAULT 20.00)

**budget_adjustments**
- id, budget_line_id, organization_id
- adjustment_type (VARCHAR 20, NOT NULL) - allocation_change, transfer
- amount (DECIMAL 15, 2, NOT NULL)
- reason (TEXT, NOT NULL)
- approved_by (UUID, nullable)
- target_budget_line_id (UUID, nullable) - For transfers
- created_at

### 2.11 Audit Trail

**audit_logs** - Append-only, never updated or deleted
- id, organization_id
- user_id (UUID, NOT NULL)
- branch_id (UUID, nullable)
- action (VARCHAR 50, NOT NULL) - create, update, submit, approve, reject, hold, resume, cancel, adjustment, override
- entity_type (VARCHAR 50, NOT NULL)
- entity_id (UUID, NOT NULL)
- previous_value (JSONB)
- new_value (JSONB)
- context (VARCHAR 50) - approval, rejection, modification, cancellation, duplicate_override, financial_exception, budget_adjustment
- ip_address (VARCHAR 45)
- created_at (TIMESTAMP, NOT NULL)

No UPDATE or DELETE permissions on this table.

### 2.12 Notifications

**notifications**
- id, organization_id
- user_id (UUID, FK -> users.id, NOT NULL)
- entity_type (VARCHAR 50)
- entity_id (UUID)
- notification_type (VARCHAR 50, NOT NULL) - pending_approval, approval_result, duplicate_flagged, budget_warning, etc.
- title (VARCHAR 255, NOT NULL)
- message (TEXT, NOT NULL)
- is_read (BOOLEAN, NOT NULL, DEFAULT FALSE)
- channel (VARCHAR 20, NOT NULL) - in_app, email, whatsapp
- created_at

---

## 3. Entity Relationship Summary

### Tenant-Scoped Entities (In-Scope)

```
organizations
  |-- branches
  |     |-- departments
  |           |-- users (via user_branch_departments)
  |           |-- purchase_requests
  |           |     |-- purchase_request_items
  |           |     |-- current_funds (manual fund entries)
  |           |-- budgets
  |                 |-- budget_lines
  |-- users
  |     |-- user_roles
  |           |-- roles
  |                 |-- role_permissions
  |                       |-- permissions
  |-- purchase_requests --> purchase_orders --> purchase_order_items
  |-- financial_commitments
  |-- approval_workflows --> approval_workflow_rules
  |                       --> approval_workflow_steps
  |-- approval_history (cross-cutting)
  |-- duplicate_detection_log (cross-cutting)
  |-- audit_logs (cross-cutting, append-only)
  |-- notifications (cross-cutting)
```

### Deferred Entities (Not Part of 3-Spec Scope)

Preserved for the future roadmap only: suppliers + contacts/documents/bank_accounts, receiving_records/items, invoices + items, three_way_matching, liabilities + occurrences, accounts_payable, payments + allocations, subscriptions, organization_modules, module_catalog, subscription_plans, plan_modules, platform_users, platform_audit_logs.

---

## 4. Indexing Strategy (In-Scope)

### High-Priority Indexes

Every query in the system filters by organization_id. The following composite indexes are essential:

| Table | Index Columns | Purpose |
|---|---|---|
| All business tables | (organization_id, id) | Tenant isolation on every query |
| purchase_requests | (organization_id, status, created_at) | Filter by status and date |
| purchase_orders | (organization_id, status, created_at) | Filter by status and date |
| approval_history | (organization_id, entity_type, entity_id) | Approval lookup per entity |
| audit_logs | (organization_id, entity_type, entity_id) | Audit trail per entity |
| audit_logs | (organization_id, user_id, created_at) | User action history |
| financial_commitments | (organization_id, status, entity_type) | Active commitments query |
| financial_commitments | (organization_id, entity_type, entity_id) WHERE status = 'active' (partial, UNIQUE) | Idempotent commitment creation |
| budget_lines | (organization_id, category, department_id) | Budget lookup |
| notifications | (organization_id, user_id, is_read) | User notification feed |
| duplicate_detection_log | (organization_id, entity_type, entity_id) | Duplicate lookup |

### Partial Indexes

- Partial index on notifications WHERE is_read = FALSE for unread notification counts
- Partial index on approval_history WHERE action = 'approve_with_exception' for exception reports

---

## 5. Transaction Strategy

### Database Transaction Rules

1. Each financial operation (approval, commitment creation, fund entry, release) runs in a single database transaction
2. If any step fails, the entire operation rolls back
3. Read operations use PostgreSQL read committed isolation level
4. Write operations use optimistic locking with version column

### Optimistic Locking Pattern

Every entity with a version column follows this pattern:

```sql
UPDATE purchase_requests
SET status = 'approved', version = version + 1
WHERE id = :id AND organization_id = :org_id AND version = :expected_version;

-- If 0 rows affected, version mismatch (concurrent modification)
```

### Financial Transaction Atomicity

Critical financial operations that must be atomic:

1. **Approval + Commitment Creation:** Approving a purchase request and creating the financial commitment must happen in one transaction (idempotent, P1.3)
2. **Cancellation + Commitment Release:** Cancelling a request/PO and releasing the related commitment must happen in one transaction

---

## 6. Concurrency Considerations (In-Scope)

### Race Conditions to Handle

1. **Concurrent approvals:** Two approvers acting simultaneously on the same request. First valid action wins; second is rejected with clear message (version + advisory lock, P2.3)
2. **Concurrent approvals vs. available funds:** Multiple approvals happening simultaneously that could collectively exceed available funds. Use database-level locking/serialized validation plus in-flight soft commitment tracking
3. **Budget overspend:** Multiple requests against the same budget line approved concurrently. Budget check must lock the budget line row

### Locking Strategy

- Use SELECT FOR UPDATE on financial records being modified (commitments, budget lines, current funds)
- Use optimistic locking (version column) for status transitions and non-critical updates
- Use advisory locks for cross-record operations (e.g., available funds calculation)

### Rollback

If a financial operation fails at any step: the entire transaction rolls back, no partial state is committed, the user receives a clear error, the operation can be retried.

---

## 7. Data Retention Rules (In-Scope)

| Data Type | Retention | Notes |
|---|---|---|
| Financial records (commitments, fund entries, budget adjustments) | Indefinite | Never deleted; reverse/adjust only |
| Audit logs | Indefinite | Never deleted, append-only |
| Purchase requests/orders | Indefinite | Status history preserved |
| Notifications | 90 days rolling | Old notifications purged |

---

## 8. Deferred: Multi-Currency and Archiving

- **Multi-currency / exchange rates:** org base_currency is stored; foreign-currency invoice/payment handling, exchange-rate policy, and FX adjustments are deferred (no invoice/payment entities yet).
- **Archiving:** the non-deletion principle applies now; subscription-based archival and archive tables are deferred until the subscription and invoices/payments domains are built.

---

*This document defines the database strategy and entity planning. Final SQL schemas will be derived from this plan during the implementation phase.*