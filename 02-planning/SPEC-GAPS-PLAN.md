# SPEC-GAPS-PLAN.md
# Implementation Plan: Spec Gap Closure
# Created: 2026-09-17

## Scope
Backend-only gap closure for three spec features:
- `specs/001-purchase-request/spec.md`
- `specs/002-approval-workflow/spec.md`
- `specs/003-financial-engine/spec.md`

Focus: What's MISSING from the existing implementation. Organized by priority (P1 → P2 → P3).

---

## Current State

| Area | Implemented | Missing |
|---|---|---|
| Purchase Request | Create, submit, list, duplicate detection | Recall to draft, edit/update, min-item validation, PO conversion |
| Approval Workflow | Multi-step routing, 4 actions, SoD, authority, audit | Resume held requests, workflow CRUD (update/delete), notifications, permission checks on management |
| Financial Engine | Commitment create/release, budget validation, risk classification | Current funds entry, commitment idempotency, concurrent protection, audit on release, release API endpoint |

---

## P1 — Critical Gaps

### P1.1 — Minimum Item Validation (FR-003)
- **Spec ref:** purchase-request FR-003
- **Problem:** PR with zero items can be submitted
- **Files:** `services/procurement_service.py`
- **Logic:** In `submit_purchase_request`, before duplicate check, verify `len(pr.items) >= 1`. Raise `ValueError` if empty.
- **Effort:** S
- **Tests:** Submit PR with 0 items → rejected. Submit with 1 item → succeeds.

### P1.2 — Manual Current Funds Entry (FR-012)
- **Spec ref:** financial-engine FR-012, US1
- **Problem:** `get_current_funds` hardcoded to `100000.0`
- **Files:** `models/financial.py` (new `CurrentFund` table), `alembic/versions/` (migration), `services/financial_service.py`, `schemas/financial.py`, `api/financial.py`
- **New migration:** Yes — `current_funds` table
- **Table schema:**
  ```
  current_funds
  ├── id              UUID (PK)
  ├── organization_id UUID (FK → organizations)
  ├── amount          NUMERIC(15,2) NOT NULL
  ├── reason          TEXT NOT NULL
  ├── created_by      UUID (FK → users)
  └── created_at      TIMESTAMP
  ```
- **Logic:** Store current funds per org. Update requires mandatory `reason`. Log to audit trail. Available funds recalculates immediately.
- **API:** `PUT /api/financial/funds` (Finance Manager+ role)
- **Effort:** M
- **Tests:** Update funds → available funds changes. Missing reason → rejected. Non-Finance-Manager → 403.

### P1.3 — Commitment Idempotency (FR-005)
- **Spec ref:** financial-engine FR-005
- **Problem:** Two approvals on same PR create duplicate commitments
- **Files:** `services/financial_service.py`
- **Logic:** In `create_commitment`, query for existing active commitment with same `entity_type` + `entity_id`. If exists, return existing.
- **Effort:** S
- **Tests:** Approve PR twice → only 1 commitment. Query returns same commitment both times.

### P1.4 — Audit Trail on Commitment Release (FR-013)
- **Spec ref:** financial-engine FR-013
- **Problem:** `release_commitment` modifies financial state but writes no audit log, and has no API endpoint
- **Files:** `services/financial_service.py`, `api/financial.py`
- **Logic:** After status change in `release_commitment`, call `log_action` with action `commitment.released`, previous/remaining amounts, user, timestamp.
- **API:** `POST /api/financial/commitments/{commitment_id}/release` — accepts `amount` body. Needed for PO conversion (P3.1) and future cancellation flows.
- **Effort:** S
- **Tests:** Release commitment via API → audit log entry exists with correct details. Missing amount → 400.

---

## P2 — Important Gaps

### P2.1 — Recall Purchase Request to Draft (FR-007, US2)
- **Spec ref:** purchase-request FR-007, US2
- **Problem:** No way to undo submission before approval
- **Files:** `services/procurement_service.py`, `api/procurement.py`
- **New endpoint:** `POST /api/procurement/{pr_id}/recall`
- **Logic:**
  1. Verify PR status is `submitted`
  2. Verify no `ApprovalHistory` records exist (no approvals processed)
  3. Verify `requested_by == user_id` (creator only)
  4. Set status to `draft`
  5. Log audit event `submitted → draft`
- **Edge cases:**
  - Recall while approval in progress → blocked (ApprovalHistory exists)
  - Non-creator tries recall → 403
  - PR already draft → 400
- **Effort:** S
- **Tests:** Submit then recall → status=draft, items editable. Recall after approval started → rejected. Non-creator recall → rejected.

### P2.2 — Update Draft PR and Items (FR-008)
- **Spec ref:** purchase-request FR-008
- **Problem:** No way to edit draft PRs or their items
- **Files:** `services/procurement_service.py`, `api/procurement.py`, `schemas/procurement.py`
- **Existing schema:** `PurchaseRequestUpdate` already defined
- **New endpoints:**
  - `PUT /api/procurement/{pr_id}` — update PR header fields
  - `POST /api/procurement/{pr_id}/items` — add item
  - `PUT /api/procurement/{pr_id}/items/{item_id}` — update item
  - `DELETE /api/procurement/{pr_id}/items/{item_id}` — delete item
- **Logic:**
  - Only allow when status is `draft`
  - Recalculate `total_price` on item changes
  - Recalculate PR total after any item mutation
  - Optimistic locking: check `version` field before write, increment on success
- **Effort:** M
- **Tests:** Update draft fields → saved. Add/remove items → totals recalculate. Edit submitted PR → 400. Concurrent edit → version conflict error.

### P2.3 — Concurrent Approval Protection (FR-011)
- **Spec ref:** financial-engine FR-011
- **Problem:** Two simultaneous approvals could over-commit funds
- **Files:** `services/financial_service.py`, `services/approval_service.py`
- **Logic:**
  - Wrap commitment creation in transaction with row-level lock on PR
  - Check PR `version` field before processing approval
  - If version mismatch → raise conflict error
  - Soft in-flight tracking: query recent commitments (last 30s) as indicator
- **Depends on:** P1.2 (real funds data)
- **Effort:** M
- **Tests:** Two concurrent approvals → second gets conflict. Version mismatch → error. Sequential approvals → both succeed.

### P2.4 — Resume Held Requests (FR-012, US5)
- **Spec ref:** approval-workflow FR-012, US5
- **Note:** Spec priority is P3 (US5), re-prioritized to P2 for gap closure since held requests are a common workflow dead-end.
- **Problem:** Held approvals are terminal
- **Files:** `services/approval_service.py`, `api/approval.py`
- **New endpoint:** `POST /api/approval/{entity_type}/{entity_id}/resume`
- **Logic:**
  1. Verify entity status is `on_hold`
  2. Verify user has permission to approve at current step
  3. Set status to `under_review`
  4. Re-evaluate current step (workflow may have changed during hold)
  5. Log audit event
- **Edge cases:**
  - Resume by user without approval permission → 403
  - Resume already under_review → 400
  - Financial position changed during hold → re-validate at next step
- **Effort:** S
- **Tests:** Hold then resume → status=under_review. Resume by wrong role → rejected. Resume with changed financials → re-validation runs.

### P2.5 — Workflow CRUD Update/Delete (FR-009 partial)
- **Spec ref:** approval-workflow FR-009
- **Problem:** Workflows can be created but not modified or deactivated
- **Files:** `services/approval_service.py`, `api/approval.py`, `schemas/approval.py`
- **New schemas:** `WorkflowUpdate`, `WorkflowStepUpdate`, `WorkflowRuleUpdate`
- **New endpoints:**
  - `PUT /api/approval/workflows/{id}` — update name/description/active
  - `DELETE /api/approval/workflows/{id}` — soft delete (set `is_active=false`)
  - `PUT /api/approval/workflows/{id}/steps/{step_id}` — update step
  - `DELETE /api/approval/workflows/{id}/steps/{step_id}` — delete step, re-index
  - `PUT /api/approval/workflows/{id}/rules/{rule_id}` — update rule
  - `DELETE /api/approval/workflows/{id}/rules/{rule_id}` — delete rule
- **Logic:**
  - Delete = soft delete (`is_active = false`), never hard delete
  - Cannot deactivate workflow with PRs currently `under_review`
  - Step reorder on deletion: re-index remaining steps
  - Changes effective immediately for new PRs (SC-005)
- **Effort:** M
- **Tests:** Update workflow name → saved. Deactivate with active PRs → rejected. Delete step → remaining steps re-indexed.

### P2.6 — Permission Checks on Workflow Management
- **Spec ref:** approval-workflow (security requirement)
- **Problem:** Any authenticated user can create/modify workflows
- **Files:** `api/approval.py`
- **Logic:** Add `RBACService.check_permission` calls on all workflow mutation endpoints. Require `approval.workflow.manage` permission.
- **Effort:** S
- **Tests:** User without permission → 403 on create/update/delete workflow.

---

## P3 — Nice-to-Have Gaps

### P3.1 — Convert Approved PR to Purchase Order (FR-012, US5)
- **Spec ref:** purchase-request FR-012, US5
- **Problem:** No PO creation from approved PRs
- **Files:** `services/procurement_service.py` (or new `services/po_service.py`), `schemas/procurement.py`, `api/procurement.py`
- **Models exist:** `PurchaseOrder`, `PurchaseOrderItem` in `models/procurement.py`
- **New endpoint:** `POST /api/procurement/{pr_id}/convert-to-po`
- **New schemas:** `POCreate`, `POResponse`
- **Logic:**
  1. Verify PR status is `approved`
  2. Create PO with items copied from PR
  3. Link PO to PR (`purchase_request_id`)
  4. Set PR status to `purchase_ordered`
  5. Release or convert financial commitment
  6. Log audit event
- **Depends on:** P2.1 + P2.2 (recall/edit must work first)
- **Effort:** L
- **Tests:** Convert approved PR → PO created, PR status updated. Convert unapproved PR → 400. Items carried over correctly.

### P3.2 — Financial Dashboard (US5)
- **Spec ref:** financial-engine US5
- **Problem:** No summary view of financial position
- **Files:** `api/financial.py`
- **New endpoint:** `GET /api/financial/dashboard`
- **Logic:** Aggregate current_funds, total_commitments, total_obligations, total_pending, available_funds, risk_level. All freshly calculated.
- **Depends on:** P1.2 (real funds data)
- **Effort:** S
- **Tests:** Dashboard returns all fields. Values match individual calculations.

### P3.3 — Creator Notification on Decisions (FR-014)
- **Spec ref:** approval-workflow FR-014
- **Problem:** PR creators not notified of decisions
- **Files:** New `services/notification_service.py`, `services/approval_service.py`
- **New migration:** Yes — `notifications` table
- **Table schema:**
  ```
  notifications
  ├── id              UUID (PK)
  ├── organization_id UUID (FK → organizations)
  ├── user_id         UUID (FK → users)
  ├── type            VARCHAR(50) NOT NULL  -- 'approval_approved', 'approval_rejected', 'approval_hold', 'approval_exception'
  ├── entity_type     VARCHAR(50) NOT NULL  -- 'purchase_request'
  ├── entity_id       UUID NOT NULL
  ├── message         TEXT NOT NULL
  ├── is_read         BOOLEAN DEFAULT FALSE
  └── created_at      TIMESTAMP
  ```
- **Logic:** On approve/reject/hold/exception, create in-app notification for PR creator. Requires `notifications` table.
- **Effort:** M
- **Tests:** Approve PR → creator has notification. Reject → creator notified with reason.

---

## Execution Order

```
PARALLEL BATCH 1 (no dependencies — all can run concurrently):
  P1.1  Min items validation
  P1.2  Current funds entry
  P1.3  Commitment idempotency
  P1.4  Audit on release + release API endpoint
  P2.1  Recall to draft
  P2.4  Resume held requests
  P2.5  Workflow CRUD
  P2.6  Permission checks

SEQUENTIAL (after P2.1):
  P2.2  Update draft PR/items

PARALLEL (after P1.2):
  P2.3  Concurrent approval protection
  P3.2  Financial dashboard

SEQUENTIAL (after P2.1 + P2.2):
  P3.1  PO conversion

PARALLEL (after P1.2, standalone):
  P3.3  Notifications
```

---

## Migration Summary

| Task | New Migration? | New Table? |
|---|---|---|
| P1.1 | No | — |
| P1.2 | Yes | `current_funds` |
| P1.3 | No | — |
| P1.4 | No | — |
| P2.1 | No | — |
| P2.2 | No | — |
| P2.3 | No | — |
| P2.4 | No | — |
| P2.5 | No | — |
| P2.6 | No | — |
| P3.1 | No | — |
| P3.2 | No | — |
| P3.3 | Yes | `notifications` |

---

## Known Implementation Issues (not in plan scope)

1. **`FinancialImpactSummary` schema unused:** `schemas/approval.py` defines `FinancialImpactSummary` and `api/approval.py:12` imports it, but `get_financial_summary` endpoint returns a raw dict from `validate_financial_position` without using it as `response_model`. Should be wired up during P2.3 or P3.2.
2. **Zero unit price not flagged:** Purchase-request spec edge case says "Unit price of zero: allowed but flagged as warning." Current implementation silently accepts zero prices with no warning. Low priority — add a warning field to the item response during P2.2.
3. **`VersionMixin` column exists but unused:** `PurchaseRequest` model inherits `VersionMixin` (has `version` column), but no code reads or increments it. P2.2 and P2.3 will use it for optimistic locking.

---

## Testing Approach

No test infrastructure exists yet. Each task should include:
1. Unit test for the service function
2. API test for the endpoint
3. Edge case tests per spec

Suggested structure:
```
backend/tests/
├── conftest.py              # Fixtures: test DB, client, user/org
├── test_procurement.py      # P1.1, P2.1, P2.2, P3.1
├── test_approval.py         # P2.4, P2.5, P2.6
├── test_financial.py        # P1.2, P1.3, P1.4, P2.3, P3.2
└── test_notifications.py    # P3.3
```

---

## Effort Summary

| Priority | Tasks | Total Effort |
|---|---|---|
| P1 | 4 tasks | S + M + S + S = ~1.5 days |
| P2 | 6 tasks | S + M + M + S + M + S = ~3 days |
| P3 | 3 tasks | L + S + M = ~2 days |
| **Total** | **13 tasks** | **~6.5 days** |
