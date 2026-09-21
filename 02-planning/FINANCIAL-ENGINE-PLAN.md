# Financial Engine Planning

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/purchase-request, specs/approval-workflow, specs/financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. Core Financial Concept

The financial engine answers two questions at any moment:

1. **How much money does the organization have?**
2. **How much is actually free to spend?**

Every module in the system feeds into or queries from this engine.

---

## 2. Available Funds Formula

```
Available Funds = Current Funds
                 - Existing Commitments
                 - Upcoming Obligations
                 - Pending Payments
```

### Component Definitions

| Component | Definition | Source |
|---|---|---|
| Current Funds | Actual balance held by the organization | Manual entry (P1.2). Bank feed integration deferred |
| Existing Commitments | Funds tied to approved purchase requests/POs | financial_commitments table (active status) |
| Upcoming Obligations | Amounts due from liability occurrences not yet paid | Not yet built — return 0 until implemented (per spec) |
| Pending Payments | Payments approved but not yet executed | Not yet built — return 0 until implemented (per spec) |
| Available Funds | Genuinely free balance | Computed in real time |

### Example

```
Current Funds:            100,000
Existing Commitments:     -70,000  (approved PO)
Upcoming Obligations:          0  (module not built)
Pending Payments:               0  (module not built)
---------------------------------
Available Funds:           30,000
```

The system must never present the raw current funds as available in any approval or dashboard context once commitments exist.

---

## 3. Financial Commitment Management

### Commitment Creation

A financial commitment is created automatically when:

1. A purchase request reaches approved status
2. A purchase order is created/approved

### Idempotency (P1.3)

- A commitment is created **at most once** per source entity — unique partial index on (entity_type, entity_id) where status = active
- Retries of the same approval action never create a second commitment

### Commitment Amount

- For request/PO-based commitments: the request/PO total amount
- Commitments are always in the organization's base currency

### Commitment Release

A commitment is released when:

1. The PO/Request is cancelled: full release for unfulfilled portion
2. A commitment is explicitly adjusted (P1.4): partial or full release with audited reason
3. The associated invoice is fully paid: full release — deferred until payments module is built (spec: releases happen on payment once available)

### Partial Release

When a commitment is partially released:

- Only the released amount is tracked; remaining_amount = amount - released_amount
- Status becomes partially_released until full release
- Example: commitment $70,000, $20,000 released -> released = 20,000, remaining = 50,000

### Commitment Recalculation

Commitments/available funds are recalculated in real time whenever:

- An approval occurs
- A cancellation occurs
- A manual adjustment occurs (P1.4)

### Multi-Currency Commitments

> Deferred: base-currency-only for the current scope. FX handling and exchange-rate policy return when invoices/payments are built.

---

## 4. Budget Validation

### Pre-Approval Budget Check

Before any purchase can be approved:

1. Identify the budget category linked to the purchase request
2. Retrieve the budget line for that category, branch, and department
3. Calculate: Allocated - Used - Committed
4. If the remaining amount is less than the requested amount: flag as over-budget
5. Over-budget approval requires approve_with_exception

### Budget Line Components

```
Allocated:    50,000
Used:         15,000  (actual spend recorded)
Committed:    20,000  (approved-but-unpaid)
Remaining:    15,000  (Allocated - Used - Committed)
```

### Budget Warnings

| Condition | Warning Level | Action Required |
|---|---|---|
| Remaining > 50% of Allocated | Safe | None |
| Remaining 20-50% of Allocated | Warning | Notify Finance Manager |
| Remaining < 20% of Allocated | Critical | Mandatory alert to Finance Manager and Owner |
| Used + Committed > Allocated | Critical | Block normal approval; require exception |

### Budget Adjustments

- Manual changes to Allocated amount require reason and approval above threshold
- Budget transfers between lines require approval on both source and destination
- All adjustments are audit-logged

---

## 5. Financial Validation Before Approval

### Validation Checks Performed

| Check | Source | Description |
|---|---|---|
| Available funds | Commitment Service | Is the projected position positive after this approval? |
| Budget availability | Budget Service | Is there remaining budget in the linked category? |
| Existing commitments | Commitment Service | What is already committed? |
| Approval authority | Approval Service | Does the approver have authority for this amount? |
| Duplicate transactions | Duplicate Detection | Are there similar existing transactions? |

> Deferred: upcoming obligations (Liability Service), pending payments (Payment Service), outstanding invoices (AP), cash-flow impact — all return 0/not-built until their modules exist (per spec).

### Validation Timing

Validation results are recalculated at the **moment of approval action**, not cached from request-creation time. Financial conditions can change while a request is pending approval.

### Financial Impact Summary

Before final approval, the approver sees:

```
Current Funds:           100,000
Existing Commitments:     20,000
Upcoming Obligations:          0  (module not built)
Pending Payments:              0  (module not built)
New Purchase:             70,000
---------------------------------
Projected Position:       10,000
```

### Risk Levels

| Level | Condition | Approval Behavior |
|---|---|---|
| Safe | Projected position > 0, budget within threshold | Normal approval |
| Warning | Projected position tight, budget near limit | Approval with visible warning |
| Critical | Projected position negative, budget breached | Normal approval disabled; require approve_with_exception |

---

## 6. Over-Budget Purchases

### Handling

1. Over-budget detection triggers a Critical Financial Warning
2. Normal approve action is disabled or requires explicit re-confirmation
3. Approver must use approve_with_exception action
4. Exception captures: reason, authorized user, financial impact snapshot, timestamp
5. Exception is permanently audit-logged
6. The over-budget amount is tracked as real (not waived)

---

## 7. Concurrent Approval Protection

### Problem

Multiple requests individually pass validation but collectively exceed available funds.

### Solution

When validating a new approval:

1. Calculate current available funds
2. Subtract commitments from already-approved transactions
3. **Also subtract amounts from requests currently in-flight** (pending approval)
4. Only if the projected position remains positive (or exception approved) can the new approval proceed

### Implementation (P2.3)

- In-flight amounts are tracked as "soft commitments" during the approval process
- Database-level locking (SELECT FOR UPDATE on current funds row + advisory lock) prevents two approvals from reading the same available-funds value simultaneously
- Optimistic locking (version column) rejects the second concurrent transition with a clear message
- If a race condition is detected, the second approval is rejected with a clear message

---

## 8. Financial Record Integrity

### Non-Deletion Principle

Financial records are never silently deleted. All corrections occur through:

1. **Cancellation** - for records that never should have proceeded (before financial effect)
2. **Reversal** - for records that did take financial effect (creates offsetting entry)
3. **Adjustment** - for records needing value correction (preserves original, creates adjusting entry)

Each action is itself a first-class, audited transaction type.

---

## 9. Idempotency for Financial Operations

Financial operations must be idempotent where possible:

- Commitment creation: if a commitment for the same source entity already exists (active), do not create another (P1.3)
- Release application: a release is applied at most once per audit action (P1.4)
- Available funds calculation: serialized via advisory lock; repeated calculations produce the same result

> Deferred: payment creation, liability occurrence generation, duplicate-detection-log idempotency patterns return with those modules.

---

## 10. Concurrency in Financial Operations

### Protected Operations

| Operation | Protection Mechanism |
|---|---|
| Approval + commitment creation | SELECT FOR UPDATE on organization's current funds + advisory lock (P1.3, P2.3) |
| Budget check + reserve | SELECT FOR UPDATE on the budget line |
| Available funds calculation | Advisory lock or serialized validation |
| Concurrent approvals | In-flight amount tracking + optimistic locking (version) |

### Rollback Strategy

If a financial operation fails at any step:

1. The entire database transaction rolls back
2. No partial state is committed
3. The user receives a clear error message
4. The operation can be retried

---

## 11. Deferred Financial Controls (Future Roadmap)

The following financial modules and controls are **outside the 3-spec scope** and preserved for the future roadmap:

- **Payment validation** (amount <= invoice outstanding, authority, duplicate hard-block, batch traceability)
- **Invoice balance validation** (outstanding = total - paid)
- **Duplicate payment protection** (exact/near/suspicious matching)
- **Financial overrides catalog** (payment/matching exceptions)
- **Cash-flow projection** (30/90/365-day horizons)
- **Accounts payable aging** — deferred
- **Accounting entry balance enforcement** (debit = credit)
- **Multi-currency / FX policy**

---

*This document defines the financial engine planning. The implementation will derive the exact calculation logic and validation rules from this plan.*