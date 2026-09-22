# API Contracts: Purchase Request Management

**Branch**: `001-purchase-request` | **Date**: 2026-09-21 | **Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

Base path: `/api/v1` | Auth: Bearer JWT (tenant resolved from token) | Content-Type: `application/json`

## Conventions

- List endpoints: paginated `?page=&per_page=` (defaults 1/20); filters via query params.
- Response envelope:
  ```json
  { "data": { ... }, "meta": { "page": 1, "per_page": 20, "total": 150, "total_pages": 8 } }
  ```
- Error envelope:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
  ```
- All writes return `409` on version conflict; `403` on permission/SoD/authority failure; `400` on invalid state transition.

## Endpoints

### POST /purchase-requests
Create draft PR. Permission: `purchase_request.create`.
```json
{
  "branch_id": "uuid", "department_id": "uuid",
  "category": "office_supplies", "priority": "normal",
  "justification": "Need chairs", "required_by_date": "2026-10-01",
  "budget_category_id": "uuid", "preferred_supplier_id": "uuid",
  "items": [{ "description": "Office chairs", "quantity": 10, "unit_price": 5000, "notes": "Ergonomic" }]
}
```
**201** → `PurchaseRequestResponse` (request_number `PR-000001`, status `draft`, computed totals).
**400** → no items (FR-003) / invalid state; **403** → no permission.

### GET /purchase-requests
List org PRs. Permission: `purchase_request.view`.
Query: `?status=draft&department_id=&branch_id=&from=&to=&page=1&per_page=20`
**200** → `{ data: PurchaseRequestResponse[], meta }` sorted newest-first (SC-005).

### GET /purchase-requests/{pr_id}
Detail with items. Permission: `purchase_request.view`.
**200** → `PurchaseRequestResponse` incl. item list + financial impact block (FR-002).

### PATCH /purchase-requests/{pr_id}
Update draft header. Permission: `purchase_request.edit` (creator only).
```json
{ "category": "office_supplies", "priority": "urgent", "justification": "Updated",
  "budget_category_id": "uuid", "required_by_date": "2026-10-01" }
```
Body MUST include `version`. **200** → updated PR (version incremented; BR-06 US6).
**400** → not draft ("Only draft requests can be edited"); **409** → version conflict; **403** → not creator.

### POST /purchase-requests/{pr_id}/items
Add item to draft PR. Permission: `purchase_request.edit`.
```json
{ "description": "Monitor", "quantity": 2, "unit_price": 15000, "notes": "" }
```
**201** → created item with `total_price`; PR total recalculated. **400/403/409** as above.

### PUT /purchase-requests/{pr_id}/items/{item_id}
Update item. Body: `{ "quantity": 15, "unit_price": 4500, "version": 3 }`
**200** → updated item, totals recalculated. **400/403/409** as above.

### DELETE /purchase-requests/{pr_id}/items/{item_id}
Delete item. Body: `{ "version": 3 }`
**200** → `{ "message": "Item deleted" }`. Last item deletion allowed (FR-003 blocks at submit).
**403/409** as above.

### POST /purchase-requests/{pr_id}/submit
Submit for approval. Permission: `purchase_request.submit` (creator). Body: `{ "version": 2 }`
Synchronous checks: ≥1 item (P1.1), linked category (FR-004), duplicate detection (FR-006).
**200** → status `submitted`, entered routing (approval feature). 
**422** → `{ "error": { "code": "INVALID_ITEMS", "message": "At least one line item is required" } }`
**409** → duplicate detected: `{ "error": { "code": "DUPLICATE_DETECTED",
  "details": { "matches": [{ "pr_id": "uuid", "request_number": "PR-000007", "total": 48000, "match_score": 0.91 }] } } }`

### POST /purchase-requests/{pr_id}/recall
Recall submitted PR to draft. Permission: `purchase_request.recall` (creator only; BR-01/BR-02 US2). Body: `{ "version": 2 }`
**200** → `{ "id": "...", "request_number": "PR-000001", "status": "draft", "message": "Recalled to draft successfully" }`; audit `submitted → draft` (BR-04); items editable again (BR-05); resubmit starts fresh trail (BR-06).
**400** → not submitted / already draft / approvals processed (BR-03); **403** → not creator; **409** → version conflict.
Cross-check: blocks if any `approval_history` row exists.

### POST /purchase-requests/{pr_id}/cancel
Cancel request. Permission: `purchase_request.cancel`; mandatory reason.
```json
{ "reason": "No longer needed", "version": 3 }
```
**200** → status `cancelled`; financial commitment released via financial service. **400/403/409** as above.

### GET /purchase-requests/{pr_id}/financial-impact
Approver-facing summary. Permission: `approval.view`.
**200** → `{ "current_funds", "commitments", "obligations": 0, "pending_payments": 0, "available", "projected_position", "risk_level" }`
(obligations/pending = 0 until those modules are built.)

### GET /purchase-requests/{pr_id}/duplicates
Run/return duplicate check without submitting. **200** → `{ "matches": [...] }`.

### GET /purchase-requests/{pr_id}/approvals
Approval history for this PR (delegates to `002-approval-workflow`). **200** → chronological decision list.

### POST /purchase-requests/{pr_id}/convert-to-po  (P3.1)
Convert approved PR → PO. Permission: `purchase_order.create`.
```json
{ "supplier_id": "uuid", "delivery_date": "2026-11-15" }
```
**201** → `PurchaseOrderResponse` (items copied, linked to PR + supplier); PR status → `purchase_ordered`; commitment created (FR-011).
**400** → PR not `approved` ("Only approved requests can be converted"); **403** → no permission.