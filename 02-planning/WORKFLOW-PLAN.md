# Workflow Planning

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/001-purchase-request, specs/002-approval-workflow, specs/003-financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. Overview

Every business entity in the system has a defined lifecycle with states, allowed transitions, required permissions, validation rules, financial checks, and audit requirements. No workflow state may be skipped.

---

## 2. Purchase Request Workflow

### States

```
draft -> submitted -> under_review -> approved / rejected / on_hold
    -> purchase_ordered -> cancelled
```

> Deferred: received -> invoiced -> paid -> closed reflect the invoice/payment modules (return 0 / not built per financial spec).

### Transitions

| From | To | Trigger | Required Permission | Validation | Financial Check | Audit |
|---|---|---|---|---|---|---|
| (new) | draft | Create | purchase_request.create | At least one item required (P1.1) | None | Log creation |
| draft | submitted | Submit | purchase_request.submit | Required fields complete, budget category linked, duplicate check passed | None | Log submission + duplicate results |
| submitted | under_review | Auto (on first approval step) | system | Workflow step assigned | None | Log routing |
| under_review | approved | Approve (final step) | approval.approve | All prior steps approved | Financial validation passed; commitment created (P1.3) | Log approval + financial snapshot |
| under_review | rejected | Reject | approval.reject | Rejection reason provided | None | Log rejection |
| under_review | on_hold | Hold | approval.hold | Hold reason provided | None | Log hold |
| on_hold | under_review | Resume | approval.resume | Recalculate financial validation | Revalidate available funds (P2.4) | Log resume |
| under_review | draft | Edit after submission | purchase_request.edit | Prior approvals invalidated (P2.2) | Recompute financial impact | Log edit + version bump |
| submitted or under_review | draft | Recall | purchase_request.recall | Only before approval begins (P2.1) | None | Log recall |
| any (before purchase_ordered) | cancelled | Cancel | purchase_request.cancel | Cancellation reason | Release any commitment | Log cancellation |

### Business Rules

- A request cannot be edited (item, quantity, price) once submitted, except by recalling to draft (only before approval begins) (P2.1, P2.2)
- Every request must reference a budget category before approval
- Duplicate detection runs at submission time
- Concurrent transitions are protected by optimistic locking + advisory lock; first valid action wins (P2.3)
- A request draft must contain at least one item before submission (P1.1)

---

## 3. Approval Workflow

### States

```
pending -> in_progress -> approved / rejected / held / exception_approved
```

### Approval Step Lifecycle

| From | To | Trigger | Validation | Audit |
|---|---|---|---|---|
| pending | in_progress | Workflow routing | Correct step identified (role/user match, P2.6) | Log routing |
| in_progress | approved | Approver action | Authority limit check, SoD check | Log decision + financial snapshot |
| in_progress | rejected | Approver action | Rejection reason | Log rejection |
| in_progress | held | Approver action | Hold reason | Log hold |
| in_progress | exception_approved | Approver action | Exception reason, higher authority | Log exception + financial impact |

### Approval Authority Checks

Before any approval action:

1. Verify approver has the required permission (approval.approve)
2. Verify approver has authority for this transaction amount
3. Verify approver has authority for this branch/department scope
4. Verify SoD: approver is not the request creator
5. Verify the user is the assigned role/user for the current workflow step (P2.6)
6. If authority insufficient, escalate to next qualifying level

### Financial Validation at Approval Time

Before final approval:

1. Calculate current available funds (live, not cached)
2. Check budget availability for the linked budget category
3. Check existing commitments
4. Check upcoming obligations (returns 0 until built, per spec)
5. Check pending payments (returns 0 until built, per spec)
6. Calculate projected position after this approval
7. If projected position is negative: require approve_with_exception
8. Present financial impact summary to approver

### Exception Approval

When financial validation triggers a warning:

1. Normal approve action is disabled or requires re-confirmation
2. Approver must use approve_with_exception action
3. Exception requires: mandatory reason, higher authority level
4. Exception is permanently logged with full financial snapshot
5. Exception does not change the numbers; projected negative position is tracked as real

---

## 4. Purchase Order Workflow (PR to PO conversion, P3.1)

### States

```
draft -> sent -> cancelled
```

> Deferred: pending_approval -> approved and receiving/invoicing/completion states belong to the deferred receiving & invoice modules.

### Transitions

| From | To | Trigger | Required Permission | Validation | Financial Check | Audit |
|---|---|---|---|---|---|---|
| (new) | draft | Create from approved PR | purchase_order.create | PR is approved; items copied; supplier assigned | Commitment exists for the request | Log creation |
| draft | sent | Mark as sent to supplier | purchase_order.create | Supplier reference set | None | Log sent |
| any (before completion) | cancelled | Cancel | purchase_order.cancel (finance sign-off if above threshold) | Cancellation reason | Commitment released for unfulfilled portion | Log cancellation |

### Business Rules

- PO must trace back to an approved Purchase Request
- Item quantities/prices copied from the PR; no amendment workflow in this scope (deferred PO lifecycle)

---

## 5. Financial Commitment Workflow

### States

```
active -> partially_released -> fully_released
```

### Transitions

| From | To | Trigger | Validation | Audit |
|---|---|---|---|---|
| (new) | active | Approval of PR (PO creation) | Amount validated; idempotent create (P1.3) | Log creation |
| active | partially_released | Partial release (cancellation or manual adjust) | Released amount tracked | Log partial release |
| partially_released | fully_released | Full release (cancellation or manual adjust, P1.4) | All amount released | Log full release |
| active | fully_released | Full release | All amount released | Log full release |

### Business Rules

- Created automatically and at most once on approval (idempotency, P1.3)
- Released when the PO/Request is cancelled or explicitly adjusted (P1.4; invoice-payment release deferred until payments built)
- Recalculated in real time on any change
- Manual adjustment requires Finance Manager+ and mandatory reason; audited
- Commitment release is recorded in audit with release reason

---

## 6. Deferred Workflows (Future Roadmap)

The following state machines are preserved from the original plan but are **not part of the 3-spec scope**:

- **Receiving workflow** (recorded -> confirmed -> adjusted)
- **Invoice workflow** (draft -> submitted -> matched -> approved_for_payment -> paid)
- **Three-way matching workflow** (pending -> matched / variance_flagged -> exception_approved / failed)
- **Liability workflow** (active -> inactive/terminated; occurrences upcoming -> due -> overdue -> paid)
- **Payment workflow** (draft -> pending_approval -> approved -> executed -> failed)
- **Supplier workflow** (draft -> pending_verification -> active -> suspended/blacklisted -> inactive)
- **Subscription workflow** (trial -> active -> suspended -> expired -> closed)
- **Accounting entry workflow** (draft -> posted -> reversed)

These return to the roadmap when the corresponding modules (suppliers, receiving, invoices, payments, liabilities, subscriptions, accounting) are implemented.

---

*This document defines the workflow and state machine planning for all major business entities.*