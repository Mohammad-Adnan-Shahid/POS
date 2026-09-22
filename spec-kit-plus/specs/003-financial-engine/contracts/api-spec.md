# API Contracts: Financial Engine

**Branch**: `003-financial-engine` | **Date**: 2026-09-21 | **Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

Base path: `/api/v1` | Auth: Bearer JWT (tenant resolved) | Content-Type: `application/json`

## Conventions

- Envelope/error structure shared with the other features.
- Money fields `DECIMAL(15,2)`; audit on every financial mutation (FR-013).
- `403` = permission (Finance Manager+ / `commitment.adjust` / `budget.adjust`); `409` = version/lock conflict; `400` = validation.

## Endpoints

### GET /financial/available-funds
Current position. **200** →
```json
{ "current_funds": 100000.00, "commitments": 20000.00, "obligations": 0, "pending_payments": 0, "available": 80000.00 }
```
Obligations/pending return 0 until their modules exist (spec Assumptions). Real-time, never cached (FR-002/SC-004).

### POST /financial/funds  (P1.2 — FR-012)
Enter/update current funds. Permission: `financial.manage_current_funds` (Finance Manager+).
```json
{ "amount": 150000.00, "reason": "First quarter top-up" }
```
**201** → `{ "amount": 150000.00, "entered_at": "...", "available": ... }`. Missing `reason` → 400. Non-Finance-Manager → 403. Audit-logged.

### GET /financial/commitments
List active commitments. **200** → `[{ id, entity_type, entity_id, amount, released_amount, remaining_amount, status }]`.

### GET /financial/commitments/summary
**200** → `{ total_active, total_released, total_remaining, count }`.

### GET /financial/commitments/{id}
Commitment detail. **200** → commitment object.

### POST /financial/commitments/{id}/release  (P1.4 — FR-004/FR-013)
Full/partial release. Permission: `commitment.adjust` (Finance Manager+).
```json
{ "amount": 3000.00, "reason": "Partial payment made" }
```
**200** → `{ status: "partially_released" | "fully_released", released_amount, remaining_amount }`. Audit-logged (`commitment.released`, before/after). Missing amount → 400.

### POST /financial/commitments/{id}/adjust
Manual adjustment (spec Edge Cases). Permission: `commitment.adjust`; mandatory `reason`; audit-logged.

### GET /financial/validation/{entity_type}/{entity_id}
Live validation for an entity (used at final approval). Permission: `approval.view`.
**200** →
```json
{
  "available": 100000.00, "projected_position": 30000.00, "risk_level": "safe",
  "budget": { "allocated": 50000.00, "used": 10000.00, "committed": 5000.00, "remaining": 35000.00, "over_budget": false }
}
```
Risk: `safe` | `warning` | `critical` (projected < 0 or budget overrun escalates to critical, FR-009). No budget line → `budget: null` (does not block, US4 AC4).

### GET /financial/budgets
List budgets. **200** → `[BudgetResponse]`.

### POST /financial/budgets
Create budget. Permission: `budget.create`.
```json
{ "name": "FY2026", "period_type": "annual", "period_start": "2026-01-01", "period_end": "2026-12-31" }
```
**201** → `BudgetResponse`.

### GET /financial/budgets/{id}
Budget with lines. **200** → budget + `lines[]`.

### GET /financial/budgets/{id}/lines
List lines. **200** → `[BudgetLineResponse]` (allocated, used, committed, remaining, warning).

### POST /financial/budgets/{id}/lines
Create line.
```json
{ "category": "office_supplies", "allocated": 50000.00 }
```
**201** → `BudgetLineResponse`.

### POST /financial/budgets/{id}/lines/{line_id}/adjust
Adjust allocation. Permission: `budget.adjust`; mandatory `reason`; above-threshold requires approval (via `approved_by`).

### POST /financial/budgets/{id}/lines/{line_id}/transfer
Transfer to another line. Permission: `budget.transfer`; approval on source + destination.

### GET /financial/dashboard  (P3.2 — US5)
**200** →
```json
{
  "current_funds": 100000.00, "total_commitments": 20000.00,
  "obligations": 0, "pending_payments": 0, "available": 80000.00,
  "risk_level": "safe"
}
```
All values freshly calculated on load (US5 AC2); critical (negative) highlighted by `risk_level` (US5 AC3).

### GET /dashboard/summary
Cross-feature dashboard (current funds, total commitments, available).

### GET /dashboard/financial-status
**200** → `{ "status": "safe" | "warning" | "critical" }`.

### GET /dashboard/budget-utilization
**200** → per-budget utilization summary.

## Audit lineage

- Fund entries, commitment release/adjust, budget adjust/transfer each write an `audit_logs` row (FR-013) with previous/new values — required for SC-002/SC-004 completeness.