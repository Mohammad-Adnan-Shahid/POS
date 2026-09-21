# Data Model: Financial Engine

**Branch**: `003-financial-engine` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
Derived from Phase 1 of `/sp.plan`.

## Entities

### current_funds (P1.2 — FR-012)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK → organizations, NOT NULL | one logical latest balance per org |
| amount | DECIMAL(15,2) | NOT NULL | supports zero/negative (overdraft) |
| reason | TEXT | NOT NULL | mandatory reason on every entry |
| entered_by | UUID | FK → users, NOT NULL | Finance Manager+ |
| entered_at | TIMESTAMP | NOT NULL | |

**Logic**: every entry append-only (audit-friendly); `get_current_funds(org)` returns latest entry by `entered_at`. No hardcoded balance (removes baseline `100000.0`).

### financial_commitments

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK, NOT NULL | |
| branch_id / department_id | UUID | nullable | carried from source |
| entity_type | VARCHAR(50) | NOT NULL | `purchase_request`, `purchase_order` |
| entity_id | UUID | NOT NULL | |
| amount | DECIMAL(15,2) | NOT NULL | PR/PO total |
| released_amount | DECIMAL(15,2) | NOT NULL, default 0 | partial/full release |
| remaining_amount | DECIMAL(15,2) | generated `amount − released_amount` | |
| status | VARCHAR(20) | NOT NULL | active, partially_released, fully_released |
| created_at / updated_at | TIMESTAMP | NOT NULL | |
| version | INT | NOT NULL, default 1 | |

**Logic**:
- Created on final approval (FR-003) via `create_commitment` (idempotent — P1.3).
- Unique partial index: `(organization_id, entity_type, entity_id) WHERE status = 'active'`.
- Active-total = `SUM(amount − released_amount)` over active + partially_released (US2 AC4).
- Full release (cancel → `fully_released`, released = original); partial payment → `partially_released` (US2 AC2/AC3).
- Reversal of a payment reinstates commitment (spec Edge Cases).

### budgets

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| period_type | VARCHAR(20) | NOT NULL | annual, monthly, quarterly |
| period_start / period_end | DATE | NOT NULL | |
| status | VARCHAR(20) | NOT NULL | draft, active, closed |
| created_at / updated_at | TIMESTAMP | NOT NULL | |
| version | INT | NOT NULL, default 1 | |

### budget_lines

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| budget_id | UUID | FK → budgets, NOT NULL | |
| organization_id | UUID | FK, NOT NULL | |
| branch_id / department_id | UUID | nullable | |
| category | VARCHAR(50) | NOT NULL | |
| allocated | DECIMAL(15,2) | NOT NULL | |
| used | DECIMAL(15,2) | NOT NULL, default 0 | |
| committed | DECIMAL(15,2) | NOT NULL, default 0 | incremented on approval |
| remaining | DECIMAL(15,2) | generated `allocated − used − committed` | |
| warning_threshold_pct | DECIMAL(5,2) | default 20.00 | |

**Warning thresholds** (US4): remaining < 20% → `critical`; 20–50% → `warning`; >50% → `safe`; no line → null (never blocks).

### budget_adjustments

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| budget_line_id | UUID | FK → budget_lines, NOT NULL | |
| organization_id | UUID | FK, NOT NULL | |
| adjustment_type | VARCHAR(20) | NOT NULL | allocation_change, transfer |
| amount | DECIMAL(15,2) | NOT NULL | |
| reason | TEXT | NOT NULL | |
| approved_by | UUID | nullable | above-threshold requires approval |
| target_budget_line_id | UUID | nullable | transfers |
| created_at | TIMESTAMP | NOT NULL | |

### Available Funds (computed — not a table)

```
available = current_funds
          − Σ(commitments.amount − commitments.released_amount) [active/partially_released]
          − obligations_total   (= 0 until module built)
          − pending_payments_total (= 0 until module built)
```

## Cross-cutting references

- Consumed by: `002-approval-workflow` (validation at final step, commitment creation), `001-purchase-request` (financial-impact view, PO conversion commitment).
- `approval_history.financial_snapshot` JSONB captures the available-funds position at each decision.
- Deferred (spec Assumptions): obligations, pending payments, bank feed, multi-currency.

## Relationships (summary)

```
organizations
  ├── current_funds            (latest per org)
  ├── budgets 1─N budget_lines 1─* budget_adjustments
  └── financial_commitments    (→ purchase_request / purchase_order by entity_type+entity_id)
```

## Indexing priorities

- `financial_commitments(organization_id, status, entity_type)` → active commitments query
- partial unique `financial_commitments(org, entity_type, entity_id) WHERE status='active'` → idempotency (P1.3)
- `budget_lines(organization_id, category, department_id)` → budget lookup