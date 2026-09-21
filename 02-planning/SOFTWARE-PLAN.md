# Master Software Plan

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> **SUPERSEDED AS CANONICAL.** The authoritative, spec-based plan for this product is `SOFTWARE-PLANNING.md`. This file is retained as a compact pointer/reference only. Full German Gym-era history remains in git.

---

## 1. Product Identity

- **Product:** POS — Multi-Tenant Procurement & Financial Controls (SaaS)
- **Source of truth:** the three specs under `specs/` — `purchase-request/spec.md`, `approval-workflow/spec.md`, `financial-engine/spec.md`
- **Not German Gym:** this is a generic multi-tenant SaaS procurement + financial-controls product. All planning is derived strictly from the three specs.

---

## 2. Canonical Documents

| Document | Purpose |
|---|---|
| **SOFTWARE-PLANNING.md** | The 21-section consolidated plan (scope, MVP, modules, rules, DB, API, security, phases, tasks, priorities, testing, deployment, risks, future) |
| **SPEC-GAPS-PLAN.md** | The 13 gap-closure tasks (P1.1–P3.3) with execution order (batches A–E) and testing approach |
| API-PLAN.md | REST API boundary (aligned to 3-spec scope) |
| DATABASE-PLAN.md | Entity/table design (aligned to 3-spec scope) |
| RBAC-PLAN.md | Roles/permissions/authority (aligned to 3-spec scope) |
| SECURITY-PLAN.md | Security controls (aligned to 3-spec scope) |
| WORKFLOW-PLAN.md | State machines for PR, approval, PO, commitments (aligned) |
| FINANCIAL-ENGINE-PLAN.md | Available funds, commitments, budget validation (aligned) |
| SAAS-PLAN.md | Multi-tenancy model, tenant isolation (aligned) |
| BACKGROUND-JOBS-PLAN.md | Background jobs (aligned to in-scope jobs) |
| ARCHITECTURE-PLAN.md | High-level architecture (aligned to in-scope services) |
| MODULE-DEPENDENCIES.md | Implementation dependency order (aligned to in-scope modules) |
| IMPLEMENTATION-PHASES.md | Phases mapped to spec-gap batches |

> Deferred modules (suppliers, receiving, invoices, matching, liabilities, AP, payments, cash flow, accounting, full reports, subscription, platform admin, module entitlements) are clearly marked as "Deferred" within each document and remain in the roadmap.

---

## 3. Product Scope (Summary)

### In Scope

- Multi-tenant SaaS foundation (organization isolation, branches, departments, users, RBAC)
- Purchase request workflow (create, submit, recall, edit draft, cancel) with duplicate detection
- Configurable approval workflows with authority limits, SoD, and exceptions
- Available funds engine (current funds − commitments), budget validation
- Financial commitments (idempotent create, cancel/adjustment release with audit)
- PR → PO conversion
- Financial dashboard
- Notifications
- Append-only audit trail

### Out of Scope for Current Specs

Suppliers module (only PR/PO link field), receiving, invoices, three-way matching, liabilities, recurring liabilities, accounts payable, payments, cash-flow projection, double-entry accounting, subscriptions/entitlements, platform super admin, report suite — all Deferred (future roadmap).

---

## 4. Architecture Direction (Summary)

Modular monolith: React.js SPA → FastAPI REST API → business services → SQLAlchemy (async) → PostgreSQL, shared schema with organization_id isolation, in-process domain event bus, in-process background scheduler, JWT auth, backend-enforced RBAC. Details in ARCHITECTURE-PLAN.md.

## 5. Stack (Summary)

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| API | FastAPI (Python, async) |
| ORM | SQLAlchemy 2.0 (async) + Pydantic |
| DB | PostgreSQL 16 (docker-compose) |
| Auth | JWT |
| Tests | pytest + pytest-asyncio |

## 6. Key Principles (Carried Forward)

- React is never the security boundary
- Tenant isolation enforced at data-access layer on every query
- Financial data never silently deleted; only reversed/adjusted
- Available funds always computed live (never cached)
- Audit trail append-only and indefinite
- Optimistic locking + advisory locks protect concurrent financial operations
- Reference: `SOFTWARE-PLANNING.md`, `FINANCIAL-ENGINE-PLAN.md`, `SECURITY-PLAN.md`

---

*This document now points to the canonical SaaS POS planning. See SOFTWARE-PLANNING.md for the complete plan.*