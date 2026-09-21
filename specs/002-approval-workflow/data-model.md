# Data Model: Approval Workflow Engine

**Branch**: `002-approval-workflow` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
Derived from Phase 1 of `/sp.plan`.

## Entities

### approval_workflows

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK → organizations, NOT NULL | tenant boundary |
| name | VARCHAR(255) | NOT NULL | |
| description | TEXT | nullable | |
| is_active | BOOLEAN | NOT NULL, default TRUE | soft-deactivate (FR-009 P2.5) |
| created_at / updated_at | TIMESTAMP | NOT NULL | |

### approval_workflow_rules

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workflow_id | UUID | FK → approval_workflows, NOT NULL | |
| organization_id | UUID | FK, NOT NULL | |
| min_amount | DECIMAL(15,2) | nullable | lower bound |
| max_amount | DECIMAL(15,2) | nullable | upper bound |
| category | VARCHAR(50) | nullable | |
| branch_id | UUID | nullable | |
| department_id | UUID | nullable | |

**Logic**: workflow with no rules = default (matches all, FR-001). First matching workflow routes.

### approval_workflow_steps

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| workflow_id | UUID | FK, NOT NULL | |
| organization_id | UUID | FK, NOT NULL | |
| step_order | INT | NOT NULL | sequential; re-index on delete (P2.5) |
| role_id | UUID | nullable | role-assigned step (FR-010) |
| user_id | UUID | nullable | user-specific step |
| max_amount | DECIMAL(15,2) | nullable | authority limit (FR-003) |

**Logic**: exactly one of role_id/user_id expected at a step; deleted-role steps skipped with warning (spec Edge Cases); PR exceeding `max_amount` → step skipped/escalated (US2 AC6).

### approval_history

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK, NOT NULL | |
| entity_type | VARCHAR(50) | NOT NULL | `purchase_request` |
| entity_id | UUID | NOT NULL | PR id |
| workflow_step_id | UUID | nullable | FK → approval_workflow_steps |
| approver_id | UUID | FK → users, NOT NULL | |
| action | VARCHAR(20) | NOT NULL | approve, reject, hold, resume, approve_with_exception |
| comments | TEXT | nullable | |
| financial_snapshot | JSONB | nullable | available-funds state at decision (FR-006) |
| exception_reason | TEXT | nullable | mandatory for `approve_with_exception` (FR-005) |
| created_at | TIMESTAMP | NOT NULL | |

**Immutability**: no UPDATE/DELETE allowed — append-only (FR-007, SC-002). Note: `action` set excludes `resume` in the DB plan's enum but spec model includes it; include both hold/resume in DDL enum.

### notifications (P3.3 — FR-014)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK, NOT NULL | |
| user_id | UUID | FK → users, NOT NULL | PR creator |
| entity_type | VARCHAR(50) | NOT NULL | `purchase_request` |
| entity_id | UUID | NOT NULL | |
| notification_type | VARCHAR(50) | NOT NULL | approval_approved, approval_rejected, approval_hold, approval_exception |
| title | VARCHAR(255) | NOT NULL | |
| message | TEXT | NOT NULL | |
| is_read | BOOLEAN | NOT NULL, default FALSE | partial index where NOT is_read |
| channel | VARCHAR(20) | NOT NULL, default `in_app` | in_app, email, whatsapp (future) |
| created_at | TIMESTAMP | NOT NULL | |

## Cross-cutting references

- `purchase_requests` (from `001-purchase-request`): status transitions `submitted → under_review → approved/rejected/on_hold`, `on_hold → under_review`.
- `financial_commitments` (from `003-financial-engine`): created on final approval (FR-013).
- `audit_logs`: every action audited in parallel with `approval_history`.

## Relationships (summary)

```
approval_workflows 1─N approval_workflow_steps
           1─N approval_workflow_rules
status on purchase_request (001):
  submitted → under_review → approved / rejected / on_hold → under_review (resume)
```

## Indexing priorities

- `(organization_id, entity_type, entity_id)` on approval_history → per-entity lookup
- `(organization_id, workflow_id, step_order)` on steps → ordered resolution
- partial index: approval_history WHERE action = 'approve_with_exception' → exception reports
- partial index: notifications WHERE NOT is_read → unread counts