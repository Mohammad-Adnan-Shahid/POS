# API Contracts: Approval Workflow Engine

**Branch**: `002-approval-workflow` | **Date**: 2026-09-21 | **Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

Base path: `/api/v1` | Auth: Bearer JWT (tenant resolved) | Content-Type: `application/json`

## Conventions

- Envelope/error structure shared with `001-purchase-request` (`{ "data": ... }`, `{ "error": { "code", "message", "details" } }`).
- `403` = permission/SoD/authority; `409` = version conflict / concurrent action; `400` = invalid state transition.

## Endpoints

### GET /approvals/pending
Pending queue for current user. Permission: `approval.view`. Role/user must match current step (US4).
Query: `?page=&per_page=`
**200** → `{ data: [{ id, request_number, total, category, requested_by, current_step, status }], meta }`. Empty queue → 200 `{ data: [] }`.
Filter logic: only PRs where current step role = user's role (or user = step.user_id).

### POST /approvals/{entity_type}/{entity_id}/approve
Approve PR at current step. Permission: `approval.approve`.
```json
{ "comments": "Approved", "version": 2 }
```
**200** → `{ "status": "under_review" | "approved", "next_step": "step-3" | null }` + audit entry + snapshot (FR-006).
Final step: live financial validation (FR-004); if risk `critical` → **403** `{ "error": { "code": "CRITICAL_RISK", "message": "Normal approval blocked — must approve with exception" } }`.
**403** → SoD (`APPROVER_IS_CREATOR`) / authority (`AUTHORITY_INSUFFICIENT`); **409** → version conflict. On final step success → commitment created via financial service (FR-013).

### POST /approvals/{entity_type}/{entity_id}/reject
Reject PR. Permission: `approval.reject`.
```json
{ "comments": "Budget needed", "reason": "Insufficient info", "version": 2 }
```
**200** → status `rejected`, audit entry, creator notified (FR-014).

### POST /approvals/{entity_type}/{entity_id}/hold
Hold PR (resumable). Permission: `approval.hold`.
```json
{ "comments": "Clarify specs", "version": 2 }
```
**200** → status `on_hold`.

### POST /approvals/{entity_type}/{entity_id}/approve_with_exception
Approve override for critical-risk PR. Permission: `approval.approve_with_exception`. Higher authority required.
```json
{ "comments": "Override", "exception_reason": "Strategic purchase", "financial_snapshot": {}, "version": 2 }
```
**200** → status `approved`; **400** → missing `exception_reason` (FR-005).

### POST /approvals/{entity_type}/{entity_id}/resume  (P2.4)
Resume held PR. Permission: `approval.resume`.
```json
{ "comments": "Resolved", "version": 2 }
```
**200** → status `under_review`, current step re-evaluated, financial validation recalculated (US5). **400** → not `on_hold`; **403** → not authorized at step.

### GET /approvals/{entity_type}/{entity_id}/history
Approval history (FR-007, US3). **200** → chronological decision list incl. approver, timestamp, step, comments, financial_snapshot, exception_reason, risk_level (US3 #2). Pending step also surfaced (US3 #3).

### GET /approvals/{entity_type}/{entity_id}/financial-summary
Live validation summary (delegates to `003-financial-engine`). **200** → `{ available, projected_position, risk_level, budget: {...} }`.

### GET /approvals/workflows
List workflows. **200** → `[WorkflowResponse]`.

### POST /approvals/workflows
Create workflow. Permission: `approval.configure_workflow` (org owner).
```json
{ "name": "Standard", "description": "...", "is_active": true }
```
**201** → `WorkflowResponse`.

### POST /approvals/workflows/{workflow_id}/steps
Add ordered step. Body: `{ "step_order": 1, "role_id": "uuid", "max_amount": 500000 }`
**201** → `WorkflowStepResponse`.

### POST /approvals/workflows/{workflow_id}/rules
Add matching rule. Body: `{ "min_amount": 0, "max_amount": 100000, "category": "office_supplies" }`
**201** → `WorkflowRuleResponse`.

### PATCH/PUT /approvals/workflows/{workflow_id}  (P2.5)
Update workflow name/description/active. Permission: `approval.configure_workflow`. **200** → updated.

### DELETE /approvals/workflows/{workflow_id}  (P2.5)
Soft delete → `is_active=false`. **400** → if PRs currently `under_review` in this workflow. **200** → `{ "message": "Workflow deactivated" }`.

### PUT/DELETE /approvals/workflows/{workflow_id}/steps/{step_id}  (P2.5)
Update step (role/user/max_amount) or delete step → remaining steps re-indexed (`step_order`).

### PUT/DELETE /approvals/workflows/{workflow_id}/rules/{rule_id}  (P2.5)
Update or delete a rule.

## Permission enforcement (P2.6)

All workflow mutation endpoints require `approval.configure_workflow` via `RBACService.check_permission`. Actor (non-mutation) actions use `approval.approve`/`reject`/`hold`/`approve_with_exception`/`resume`. Unauthorized user → **403** (test T.0xx in tasks.md).