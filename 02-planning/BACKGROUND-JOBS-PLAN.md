# Background Job Planning

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/001-purchase-request, specs/002-approval-workflow, specs/003-financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. Background Job Architecture

### Initial Implementation

In-process background scheduler (APScheduler or custom) running within the FastAPI application. Suitable for MVP and early production.

### Future Scaling

Background jobs can be migrated to a distributed task queue (e.g., Celery with Redis/RabbitMQ) if scale requires. The architectural separation allows this migration without changing business logic.

### Tenant Isolation

Every background job carries tenant context. Jobs are executed per-tenant, never across tenants. A job processing Organization A's data never accesses Organization B's data.

### Concurrency and Error Handling (applies to all in-scope jobs)

- Jobs are executed per-tenant, one tenant at a time
- If a job fails for one tenant, it does not affect other tenants
- Failed jobs are retried up to a configurable number of times
- All job execution is audit-logged
- All jobs must be idempotent: running the same job twice produces the same result
- Job failures are logged with full error details
- Job execution history is maintained for debugging

---

## 2. Financial Alerts Check (In-Scope)

### Job: Check Financial Thresholds

| Property | Value |
|---|---|
| Schedule | Every 4 hours (configurable) |
| Tenant Scope | Per-organization |
| Purpose | Check and alert on financial risk conditions |

### Checks Performed

1. **Low Budget Warning:** Budget lines where remaining < warning_threshold_pct of allocated
2. **Over-Budget Alert:** Budget lines where used + committed > allocated
3. **High-Value Pending Approvals:** Requests above configurable threshold awaiting approval

> Deferred: negative cash-flow projection and overdue invoices/liabilities checks (modules not built).

### Notifications

- Low budget: Warning to Finance Manager and Department Manager
- Over budget: Critical to Finance Manager, Owner
- High-value pending: Alert to appropriate approvers

---

## 3. Notification Dispatch (In-Scope)

### Job: Send Pending Notifications

| Property | Value |
|---|---|
| Schedule | Every 5 minutes |
| Tenant Scope | Per-organization |
| Purpose | Dispatch pending notifications via configured channels |

### Logic

1. Query notifications where is_read = FALSE and channel != 'in_app'
2. For each notification:
   - Check user's notification preferences
   - If email configured: queue email for sending
   - If WhatsApp configured: queue WhatsApp message
3. Mark notification as dispatched
4. Handle delivery failures gracefully (retry, log, don't block)

### Escalation

- Critical financial warnings not acknowledged within configurable time window: escalate to next authority level
- Escalation notifications are themselves auditable

---

## 4. Cleanup Job (In-Scope)

### Job: Clean Expired Notifications

| Property | Value |
|---|---|
| Schedule | Weekly |
| Tenant Scope | Per-organization |
| Purpose | Remove old read notifications |

### Logic

1. Delete notifications where is_read = TRUE and created_at > 90 days ago
2. Never delete unread notifications
3. Never delete critical financial notifications regardless of age

---

## 5. Commitment Release Processing (In-Scope)

### Job: Process Pending Commitment Releases

| Property | Value |
|---|---|
| Schedule | Every 15 minutes (or event-triggered) |
| Tenant Scope | Per-organization |
| Purpose | Apply queued commitment releases from cancellations/adjustments to available funds |

### Logic

1. Pick up commitments marked for release (request/PO cancelled, manual release P1.4)
2. Release the unfulfilled portion and update released_amount / status
3. Recalculate available funds
4. Idempotent: a release is applied at most once per audit action (P1.3)

---

## 6. Deferred Jobs (Future Roadmap)

The following background jobs are preserved but **not part of the 3-spec scope**; they activate when the related modules are built:

- **Recurring liability generation** (liabilities module)
- **Due-date / overdue processing** for invoices and PO delivery (invoices/receiving modules)
- **Accounts payable aging recalculation** (AP module)
- **Subscription status validation** (subscription/billing)
- **Scheduled report generation** (reporting module)
- **Export processing** (reporting module)
- **Archive old data** (archiving after subscription policies exist)

---

## 7. Job Schedule Summary (In-Scope)

| Job | Frequency | Priority |
|---|---|---|
| Check Financial Thresholds | Every 4 hours | High |
| Send Pending Notifications | Every 5 minutes | High |
| Process Pending Commitment Releases | Every 15 minutes / event-triggered | High |
| Clean Expired Notifications | Weekly | Low |

---

*This document defines the background job planning. Implementation will derive the exact scheduling and execution logic from this plan.*