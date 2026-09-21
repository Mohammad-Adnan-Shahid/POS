# Data Model: Purchase Request Management

**Branch**: `001-purchase-request` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
Derived from Phase 1 of `/sp.plan`; source of truth for entities, fields, and validation.

## Entities

### purchase_requests

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK → organizations, NOT NULL | tenant boundary |
| request_number | VARCHAR(50) | NOT NULL, UNIQUE (org, request_number) | sequential `PR-000001` (FR-001) |
| branch_id | UUID | FK → branches, NOT NULL | |
| department_id | UUID | FK → departments, NOT NULL | |
| requested_by | UUID | FK → users, NOT NULL | PR creator (creator-only actions BR-01/BR-02) |
| request_date | DATE | NOT NULL | |
| required_by_date | DATE | nullable | |
| category | VARCHAR(50) | NOT NULL | used by duplicate detection |
| priority | VARCHAR(20) | NOT NULL, default `normal` | low, normal, high, urgent |
| justification | TEXT | nullable | |
| preferred_supplier_id | UUID | nullable | supplier reference only; module deferred |
| budget_category_id | UUID | nullable | linked at submit (FR-004) |
| status | VARCHAR(30) | NOT NULL, default `draft` | draft, submitted, under_review, approved, rejected, on_hold, purchase_ordered, cancelled |
| notes | TEXT | nullable | |
| version | INT | NOT NULL, default 1 | optimistic lock (FR-008c, SC-007) |
| created_at / updated_at | TIMESTAMP | NOT NULL | |

**Validation / Business rules**
- Only `draft` status can be edited (BR-01 US6); only creator can edit (BR-02).
- Every item mutation recalculates `total_price` and PR total (BR-04/BR-05).
- Header and item updates are separate endpoints (BR-06).
- Submission requires ≥1 item (FR-003), linked `budget_category_id` (FR-004), and passes duplicate check (FR-006).

### purchase_request_items

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| purchase_request_id | UUID | FK → purchase_requests, NOT NULL | |
| organization_id | UUID | FK, NOT NULL | |
| description | VARCHAR(500) | NOT NULL | |
| quantity | DECIMAL(10,2) | NOT NULL, CHECK > 0 | |
| unit_price | DECIMAL(15,2) | NOT NULL, CHECK >= 0 | zero allowed but flagged (spec Edge Cases) |
| total_price | DECIMAL(15,2) | generated `quantity * unit_price` | FR-002 |
| notes | TEXT | nullable | |
| created_at / updated_at | TIMESTAMP | NOT NULL | |

**Validation**
- Delete last item allowed (BR-07); submission re-blocks via FR-003.

### purchase_orders (P3.1)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK, NOT NULL | |
| po_number | VARCHAR(50) | NOT NULL, UNIQUE (org, po_number) | tenant-unique |
| purchase_request_id | UUID | FK → purchase_requests, NOT NULL | source PR |
| supplier_id | UUID | nullable | reference link (FR-012) |
| branch_id / department_id | UUID | FK, NOT NULL | carried from PR |
| total_amount | DECIMAL(15,2) | NOT NULL | = PR total; commitment target |
| delivery_date | DATE | nullable | |
| status | VARCHAR(30) | NOT NULL, default `draft` | draft, sent, cancelled |
| notes | TEXT | nullable | |
| version | INT | NOT NULL, default 1 | |
| created_at / updated_at | TIMESTAMP | NOT NULL | |

### purchase_order_items

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| purchase_order_id | UUID | FK → purchase_orders, NOT NULL | |
| organization_id | UUID | FK, NOT NULL | |
| purchase_request_item_id | UUID | nullable | traces to source PR item |
| description | VARCHAR(500) | NOT NULL | copied from PR item |
| quantity | DECIMAL(10,2) | NOT NULL, CHECK > 0 | |
| unit_price | DECIMAL(15,2) | NOT NULL | |
| total_price | DECIMAL(15,2) | NOT NULL | |

### duplicate_detection_log

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK, NOT NULL | |
| entity_type | VARCHAR(50) | NOT NULL | `purchase_request` |
| entity_id | UUID | NOT NULL | the newly submitted PR |
| duplicate_entity_type | VARCHAR(50) | NOT NULL | |
| duplicate_entity_id | UUID | NOT NULL | existing matching PR (FR-006) |
| match_score | DECIMAL(3,2) | 0.00–1.00 | confidence (US3) |
| match_reason | TEXT | nullable | e.g., same category + within 10% |
| overridden | BOOLEAN | default FALSE | deferred override support |
| override_reason | TEXT | nullable | |
| overridden_by | UUID | nullable | |
| created_at | TIMESTAMP | NOT NULL | |

## Cross-cutting references

- `approval_history`, `financial_commitments`, `audit_logs`, `notifications`: owned by `002-approval-workflow` / `003-financial-engine` features; referenced by `entity_type`/`entity_id` where `entity_type = 'purchase_request'`.
- On final approval the approval feature calls the financial feature to create a commitment (FR-011).

## Relationships (summary)

```
organizations
   └── purchase_requests 1─N purchase_request_items
              │ 1─1 (was) purchase_orders 1─N purchase_order_items
              └─* duplicate_detection_log (matches to other purchase_requests)
```

## Indexing priorities

- `(organization_id, status, created_at)` on purchase_requests → filtered lists (SC-005)
- `(organization_id, category)` for duplicate detection lookup
- `(organization_id, entity_type, entity_id)` on duplicate_detection_log