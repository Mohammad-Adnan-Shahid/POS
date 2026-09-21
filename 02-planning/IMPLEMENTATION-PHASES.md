# Implementation Phases

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/purchase-request, specs/approval-workflow, specs/financial-engine. Canonical plan: SOFTWARE-PLANNING.md. Execution tasks: SPEC-GAPS-PLAN.md.

---

## Overview

The system is implemented in phases derived from the spec gap-closure plan (`SPEC-GAPS-PLAN.md`). Deliverables are organized into execution batches (A–E) and later phases for deployment/testing. Each batch builds on the previous batch's stable foundation.

---

## Phase 1 — Foundation (Existing Core)

**Goal:** Confirm the running baseline that already covers the spec's happy paths, then close the critical messages/data gaps.

### What already exists (baseline)

| Area | Baseline capability |
|---|---|
| Procurement | PR create (draft), submit, duplicate detection, cancel, status transitions |
| Approval | Rule-based workflow matching, 4 actions (approve/reject/hold/exception), SoD, authority checks |
| Financial | Commitment create on approval, release on cancel, available funds, budget lines/validation |
| Auth/RBAC | JWT login, org-scoped models, permission checks |

### Batch A — Critical Gaps (P1 + P2 subset)

From `SPEC-GAPS-PLAN.md`, execution order:

1. **P1.1** — Minimum item validation on PR creation/submission (FR-003)
2. **P1.2** — Manual current funds entry with mandatory reason + audit (FR-012)
3. **P1.3** — Commitment idempotency (FR-005): create at most once per source entity
4. **P1.4** — Audit trail on commitment release + release API endpoint (FR-013)
5. **P2.1** — Recall submitted PR to draft (FR-007)
6. **P2.4** — Resume held requests (FR-012)
7. **P2.5** — Workflow CRUD update/delete (FR-009)
8. **P2.6** — Permission checks on workflow management

### Batch B — Draft Editing (P2.2)

Depends on P2.1. Update draft PR and items (FR-008), version-gated.

### Batch C — Concurrency + Dashboard (P2.3, P3.2)

Depends on P1.2 (real funds data).

- **P2.3** — Concurrent approval protection (FR-011): optimistic locking + advisory lock
- **P3.2** — Financial dashboard (current funds, total commitments, available funds)

### Batch D — Notifications (P3.3)

Depends on P1.2. Creator notification on approval decisions (FR-014).

### Batch E — PO Conversion (P3.1)

Depends on P2.1 + P2.2. Convert approved PR to Purchase Order (copy items, link PR, assign supplier).

### Testing (Phase 1)

- P1.1: submission without items returns 422
- P1.3: double approval does not create duplicate commitment
- P2.3: two simultaneous approvals — second rejected with 409
- P2.2: edit after submit resets to draft and invalidates prior approvals
- P1.4 / P1.2: release and fund entries appear in audit trail
- P3.1: PO creation from approved PR succeeds and links items + supplier
- P3.2: dashboard figures consistent with underlying modules
- Tenant isolation and RBAC on all new endpoints

### Exit Criteria (Phase 1)

- All 13 gap tasks (P1.1–P3.3) implemented and tested
- `pytest` suite green (pytest + pytest-asyncio, as declared in backend/pyproject.toml)
- Automated tests cover the spec acceptance scenarios in SOFTWARE-PLANNING §18
- Docker compose runs postgres + backend + frontend (note: frontend/Dockerfile must be created)

---

## Phase 2 — Hardening and Release Readiness

**Goal:** Security verification, concurrency stress, performance, and production readiness.

### Activities

| Activity | Description |
|---|---|
| Security Testing | Authentication bypass, authorization escalation, injection attacks |
| Tenant Isolation Testing | Cross-tenant data access attempts (automated) |
| RBAC Testing | Permission boundary + workflow step assignment (P2.6) testing |
| Financial Integrity Testing | Commitment idempotency, balance enforcement, concurrent operations (P1.3, P2.3) |
| Concurrency Testing | Race condition detection and handling |
| Audit Testing | Audit trail completeness and immutability (P1.2, P1.4) |
| Edge-Case Testing | All spec acceptance scenarios validated (SOFTWARE-PLANNING §18) |
| Performance Testing | Load testing, query optimization, index verification |

### Exit Criteria

- All security and tenant-isolation tests pass
- Financial integrity verified under concurrent conditions
- Performance meets requirements
- Production deployment ready (Docker, env config, migrations)

---

## Phase 3 — Deferred Roadmap (Future Phases)

The following modules are **outside the 3-spec scope** and preserved for the future roadmap:

| Phase (future) | Modules |
|---|---|
| Supplier Management | Supplier registry, contacts, documents, bank accounts, 360 view, merge |
| Receiving & Invoices | Receiving, invoices, three-way matching |
| Financial Expansion | Liabilities, recurring liabilities, accounts payable, cash flow, payments |
| Reporting & Intelligence | Full report suite, analytics, export processing |
| SaaS Layer | Subscription plans, module catalog, entitlements, platform super admin |

These map to the deferred sections in MODULE-DEPENDENCIES.md, API-PLAN.md, DATABASE-PLAN.md, FINANCIAL-ENGINE-PLAN.md, SAAS-PLAN.md, WORKFLOW-PLAN.md, and BACKGROUND-JOBS-PLAN.md.

---

## Phase Summary

| Phase | Name | Focus |
|---|---|---|
| 1 | Foundation + Gap Closure | Baseline core + batches A–E (P1.1–P3.3) |
| 2 | Hardening | Security, tenant isolation, financial integrity, concurrency, performance |
| 3+ | Deferred Roadmap | Suppliers, receiving/invoices, liabilities/payments, reporting, SaaS |

---

## Development Principles

1. Each batch must be fully tested and stable before the next batch begins
2. All financial operations must be transactional and auditable from Phase 1 onward
3. Tenant isolation must be enforced from Phase 1 onward
4. RBAC must be enforced from Phase 1 onward
5. Audit trail must capture all actions from Phase 1 onward
6. No financial record may be silently deleted at any phase
7. Each batch should include integration tests covering the full workflow up to that point

---

*This document defines the implementation phase planning. Each phase builds on the previous phase's stable foundation, following the spec gap-closure execution order.*