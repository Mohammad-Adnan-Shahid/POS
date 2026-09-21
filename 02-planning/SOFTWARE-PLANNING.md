# Software Planning Document

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

**Created**: 2026-09-21
**Status**: Draft
**Source**: Feature specifications in `specs/` (purchase-request, approval-workflow, financial-engine)
**Canonical**: this document

---

## 1. Project Overview

POS is a multi-tenant SaaS procurement system defined by three feature specifications:

| Spec | Scope |
|---|---|
| `specs/001-purchase-request/spec.md` | Purchase request creation, submission, lifecycle management, duplicate detection |
| `specs/002-approval-workflow/spec.md` | Configurable multi-step approval workflow with SoD, authority limits, and financial validation |
| `specs/003-financial-engine/spec.md` | Real-time available funds calculation, commitment tracking, budget validation, and risk assessment |

**Core principles (from all three specs):**

- **Multi-tenant SaaS:** every organization has isolated workflows, financial data, and PR data via `organization_id`.
- **Financial visibility:** Available Funds = Current Funds − Existing Commitments − Upcoming Obligations − Pending Payments.
- **Governance:** no self-approval (SoD), step-based authority limits, live financial validation at the moment of final approval.
- **Auditability:** every decision records an immutable approval history with a financial snapshot; all state transitions logged.
- **Concurrency safety:** optimistic locking (version fields) and in-flight protection prevent double-approval and over-commitment.

---

## 2. Goals & Objectives

| Goal | Description |
|---|---|
| **Procurement Governance** | Every purchase request routes through a configurable, authority-based approval chain (so no unauthorized purchase) |
| **Financial Discipline** | Approvals are always based on the real-time financial position; critical positions require approved exceptions |
| **Real-Time Visibility** | Available funds, commitments, budget utilization, and risk level are computed live, never from cached values |
| **Audit Compliance** | 100% of approval decisions have an audit trail with a financial snapshot (SC-002/SC-003 in each spec) |
| **Multi-Tenant Integrity** | Strict isolation of PRs, workflows, and financial data per organization |
| **Configurability** | Owners configure workflows (steps, roles, amount limits, matching rules) without code changes |
| **Duplicate Prevention** | Duplicate purchases detected at submission time (same category, amount within 10%) |

**Success criteria these objectives are measured against:**

- Purchase Request: create+submit with 5 items < 3 min; duplicate detection ≥ 95%; recall < 10s; list filter < 2s (1,000 PRs); edit < 2s; concurrent-edit conflict 100%.
- Approval Workflow: decisions < 5s incl. financial validation; 100% audit trail; 100% SoD catch; real-time validation; pending queue < 2s (500 items).
- Financial Engine: available-funds calc < 1s; commitment < 1s after final approval; 100% of approved PRs have active commitment; 0 stale data; risk classification blocks normal approval 100% on negative projection; budget warnings within 1% of allocated.

---

## 3. Scope

### In Scope

- Purchase request management (create, submit, recall, edit draft, list/filter, convert to PO)
- Duplicate detection at PR submission
- Configurable approval workflows (multi-step, roles, authority limits, matching rules)
- Approval actions: approve, reject, hold, approve-with-exception, resume
- Approval history and audit trail
- Pending approvals queue (role/step filtered)
- Real-time available funds calculation
- Financial commitment tracking (create, full/partial release, idempotent)
- Budget validation and Safe/Warning/Critical risk classification
- Manual current-funds entry (with mandatory reason and audit)
- Financial dashboard
- In-app notifications to PR creator on approval decisions
- Creator notifications (approve, reject, hold, exception, resume)

### Out of Scope (spec Assumptions)

- Supplier module (preferred_supplier reference is a UUID; supplier registry managed separately)
- Upcoming obligations and pending payments modules (return 0 until implemented)
- Bank feed / bank integration (current funds manually entered)
- Branch/department management (data managed separately)
- Multi-currency (single base currency for initial implementation)
- RBAC module internals (roles/permissions managed by an RBAC module; this project consumes it)
- Payment, receiving, invoicing, and three-way matching flows (future phases)

---

## 4. MVP Definition

The MVP is the three spec features fully functional end to end:

1. **Purchase Request:** coordinator creates a PR with items + budget category, edits draft (header + items with optimistic locking), submits (min 1 item, category linked, duplicate check), recalls before approval starts, views team PRs filtered by status, and converts an approved PR to a PO.
2. **Approval Workflow:** owner configures workflows (steps with role/user + max_amount, matching rules), approvers act (approve / reject / hold / approve_with_exception), SoD and authority enforced, live financial validation at final step, pending queue filtered by role+step, held requests resume, creator notified of decisions, full history with financial snapshots.
3. **Financial Engine:** current funds entry (manual, audited), available funds recalculation in real time, auto-commitment on approval (idempotent, with full/partial release), budget checks with warnings, risk classification (safe/warning/critical) that blocks normal approval on critical, financial dashboard, and financial summary for any entity type.

**Priority split (from spec user stories):**

| Priority | Purchase Request | Approval Workflow | Financial Engine |
|---|---|---|---|
| P1 | Create/Submit PR | Process Approval Decisions, Pending Queue | Available Funds, Commitments, Financial Validation |
| P2 | Recall, Edit Draft, Duplicate Detection, List/Filter | Workflow Configuration, History & Audit | Budget Validation & Warnings |
| P3 | Convert to PO | Resume Held Requests | Financial Dashboard |

---

## 5. Module Breakdown

```
Approval Workflow Engine
├── Workflow CRUD (name, description, is_active)
├── Workflow Steps (step_order, role_id, user_id, max_amount)
├── Matching Rules (min/max amount, category, branch, department)
├── Routing (first matching rule; default workflow if no rules)
├── Step Skip/ Escalate (amount exceeds step max_amount)
├── Approval Actions (approve, reject, hold, approve_with_exception, resume)
├── SoD enforcement (no self-approval)
├── Authority enforcement (per-step max_amount)
├── Pending Queue (role + current-step filtered)
├── Approval History (immutable, with financial_snapshot)
├── Notifications (creator on decisions)

Financial Engine
├── Available Funds (current − commitments − obligations − pending)
├── Current Fund entry (manual, reason mandatory, audited)
├── Financial Commitment (auto-create on final approval, idempotent)
├── Commitment Release (full / partial)
├── Budget Validation (allocated, used, committed, remaining, warning)
├── Risk Classification (safe / warning / critical)
├── Financial Snapshot (captured with every decision)
├── Concurrent Approval Protection (in-flight)
└── Financial Dashboard

Purchase Request
├── PR CRUD (draft, header + items)
├── Auto request numbers (PR-000001 per org, sequential)
├── Line & PR totals (qty × price, sum of lines)
├── Submit (min 1 item, budget category linked, duplicate check)
├── Recall to draft (only submitted, no approvals started)
├── Duplicate Detection (same category, ±10%, match score)
├── List / Filter / Paginate by status
└── Convert approved PR → PO (item carryover, commitment)
```

### Dependency Order

```
Financial Engine (foundation — validation/commitments feed approvals)
        |
        v
Purchase Request (produces the entities that get approved)
        |
        v
Approval Workflow (consumes PRs + financial validation; creates commitments)
```

No module may be used before its dependencies are stable.

---

## 6. User & Role Planning

Roles referenced by the three specs (actual assignment/permission management handled by the RBAC module; see Assumptions):

| Role | Responsibility (per specs) | Key Operations |
|---|---|---|
| **Department Coordinator** | Creates and submits purchase requests | Create PR, edit draft, submit, recall |
| **Approver** (role-assigned at workflow steps) | Acts on PRs pending their step | Approve, reject, hold, approve_with_exception, resume |
| **Organization Owner** | Configures the governance model | Create/configure workflows, steps, rules; view dashboard |
| **Finance Manager** | Financial oversight and audit | View approval history, financial summaries, dashboard; enter current funds |

Additional actors implied by the specs:

| Actor | Responsibility |
|---|---|
| **Procurement Officer** | Converts approved PRs to purchase orders |
| **PR Creator** | Recipient of decision notifications; creator-only recall/edit |

**Rules involving actors:**

- Only the PR creator can recall or edit a PR (`BR-01`, `BR-02`).
- A user who is the creator of a PR can never approve it (SoD, FR-002 approval-workflow).
- Approvers at step N must hold the step's role (or be the step's assigned user) to act or see it in their queue.
- Workflow configuration is an org-owner activity.

---

## 7. Permission/RBAC Plan

Multi-tenant: `organization_id` scopes every role, workflow, and data query. Permission codes are consumed from the RBAC module; this plan defines the required surface.

### Required Permission Surface

| Permission | Used By | Purpose |
|---|---|---|
| `purchase_request.create` | Coordinator | Create PR |
| `purchase_request.edit` | Coordinator (creator) | Edit draft header/items |
| `purchase_request.submit` | Coordinator (creator) | Submit PR |
| `purchase_request.recall` | Coordinator (creator) | Recall submitted PR |
| `purchase_request.view` | Dept Manager etc. | List/filter PRs |
| `purchase_order.create` | Procurement Officer | Convert approved PR to PO |
| `approval.view` | Approvers | View pending queue / history |
| `approval.approve` / `approval.reject` / `approval.hold` | Approver | Take approval actions |
| `approval.approve_with_exception` | Approver | Approve critical-risk PRs with reason |
| `approval.resume` | Approver | Resume held PRs |
| `approval.configure_workflow` | Org Owner | Workflow CRUD |
| `financial.manage_current_funds` | Finance Manager+ | Manual current-funds entry (reason mandatory) |
| `commitment.adjust` | Finance Manager+ | Manual commitment adjustment |
| `financial.view` | Finance Manager | Dashboard, summaries, available funds |

### Authorization Rules

- **SoD (FR-002):** approver ≠ PR creator; violation → rejection with SoD message.
- **Authority (FR-003):** PR total must be ≤ current step's `max_amount`; otherwise rejected with "authority insufficient" or escalated/skipped to the next qualifying step.
- **Critical risk (FR-005):** final-step normal approval blocked when projected position is negative; only `approve_with_exception` with mandatory reason proceeds.
- **Step assignment:** an approver is valid for a step only if their role matches `step.role_id` or they are `step.user_id`.
- **Creator-only actions:** edit and recall restricted to `requested_by`.

---

## 8. Business Workflow Planning

### 8.1 Purchase Request Lifecycle

```
draft ──submit──> submitted ──route──> under_review ──approve(final)──> approved
  ^                     │                    │   ──reject──> rejected
  └────recall───────────┘                    │   ──hold──> on_hold ──resume──> under_review
        (submitted only,                      └──(exception)──> approved
         no approvals started)

approved ──convert to PO──> purchase_ordered (commitment created)
```

| Transition | Trigger | Validation / Checks | Audit |
|---|---|---|---|
| draft → draft | Edit header/items | Status = draft, user = creator, version match (409 otherwise) | Yes (version bump) |
| draft → submitted | Submit | ≥ 1 item, budget category linked, duplicate check passed, user = creator | Yes |
| submitted → draft | Recall | Status = submitted, user = creator, no ApprovalHistory records | "submitted → draft" |
| submitted → under_review | Auto-routing | Workflow matched, first qualifying step resolved | Yes |
| under_review → approved/(rejected/on_hold) | Approver action | SoD, authority, step assignment, financial validation at final step | Yes + snapshot |
| on_hold → under_review | Resume | Authorized approver, status = on_hold | Yes |
| approved → purchase_ordered | PO creation | Status = approved, PO linked, commitment created | Yes |

### 8.2 Approval Workflow Routing

1. On submission, `find_matching_workflow` evaluates rules (min/max amount, category, branch, department) in order; workflow with **no rules = default** (matches all).
2. `resolve_current_step` returns the first step not yet approved; steps whose `max_amount` is exceeded by the PR total are **skipped** (warning logged); steps referencing deleted roles are skipped with a warning.
3. The current step's assigned role/user determines who sees the PR in their **pending queue**.

### 8.3 Approval Actions

| Action | Effect on PR | Constraints |
|---|---|---|
| `approve` | Advance to next step; `approved` if final | SoD, authority, step assignment; if final + critical risk → blocked |
| `approve_with_exception` | Advance/`approved` even on critical risk | Mandatory `exception_reason`; financial snapshot recorded |
| `reject` | `rejected` | Reason/comment expected; creator notified |
| `hold` | `on_hold` (resumable) | Reason/comment expected |
| `resume` | `under_review`; step re-evaluated | Authorized approver; financial validation recalculated at next step |

### 8.4 Financial Workflows

- **Commitment lifecycle:** final approval creates active commitment (idempotent per entity) → partial payment = `partially_released` → full = `fully_released`; PR cancellation releases fully; reversal reinstates.
- **Validation-on-approval:** at final step, validation runs at the moment of approval: projected = available − new purchase; risk = `safe` (positive) → `warning` (<20% remaining) → `critical` (< 0 or budget overrun).
- **Budget check:** when PR category links to an active budget line: warning `safe` (>50% remaining) / `warning` (20–50%) / `critical` (<20%); no budget line → null, never blocks.

---

## 9. System Architecture Plan

```
React.js Frontend (SPA)
        |
        | HTTPS (JSON)
        v
FastAPI REST API
        |  - JWT auth / tenant context resolution
        |  - Pydantic validation, error handling
        v
Application / Business Services Layer
        |  - procurement_service, approval_service, financial_service,
        |    budget_service, audit_service, rbac_service, notification_service
        v
Data Access Layer (SQLAlchemy async ORM)
        |  - tenant-scoped queries (organization_id mandatory)
        |  - optimistic locking (version), row locks, advisory locks for funds
        v
PostgreSQL
```

### Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Modular monolith (FastAPI) | Three features are tightly coupled via the financial graph; avoids premature microservices |
| PostgreSQL + async SQLAlchemy | Strong ACID for financial integrity; async for concurrency |
| Tenant context from JWT | No endpoint accepts `organization_id` from the client |
| Backend-enforced authorization | Frontend is never the security boundary |
| UUID primary keys | No sequential IDs leaking across tenants |
| Append-only audit + approval history | Spec SC-002/003 require 100% coverage |
| Event-driven notifications | Existing `app/events/bus.py` event bus publishes decisions to notification service |
| Optimistic + advisory locking | Prevents concurrent double-approval and fund over-commitment |

### Tenancy Model

- Every business table carries `organization_id` (FK → organizations).
- Workflows, rules, steps, PRs, commitments, budgets, notifications all isolated by org.
- Default workflow (no rules) acts as fallback per org.

---

## 10. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18, Vite, TypeScript, react-router-dom, axios | `frontend/` |
| Backend API | FastAPI (Python 3.11) | `backend/app/` |
| ORM | SQLAlchemy 2.0 (async) | asyncpg driver |
| Validation | Pydantic v2 | request/response schemas |
| Auth | JWT (python-jose), passlib/bcrypt | short-lived access token |
| Database | PostgreSQL 16 | docker-compose service |
| Migrations | Alembic | `backend/alembic/` |
| Testing | pytest + pytest-asyncio | declared in `backend/pyproject.toml` |
| Lint/Static | ruff, mypy | declared as dev deps |
| Deployment | Docker, docker-compose | root `docker-compose.yml` |

---

## 11. Database Planning

### Design Principles

- UUID primary keys; `organization_id` FK on every tenant table; status as string enums; JSONB for snapshots; `version` for optimistic locking; financial amounts as `NUMERIC(15,2)`; append-only audit.

### Core Entities (from the three specs)

| Entity | Key Fields | Notes |
|---|---|---|
| `purchase_requests` | request_number, branch, department, category, priority, budget_category_id, status, version | request_number unique per org (PR-000001) |
| `purchase_request_items` | description, quantity, unit_price, total_price | total = qty × price; ≥ 1 at submit |
| `duplicate_detection_log` | entity_pair, match_score, match_reason | FR-006 (10% tolerance) |
| `approval_workflows` | name, description, is_active, org | |
| `approval_workflow_steps` | step_order, role_id, user_id, max_amount | ordered; role- or user-assigned |
| `approval_workflow_rules` | min/max_amount, category, branch, department | empty = default workflow |
| `approval_history` | entity_type, entity_id, approver, action, comments, financial_snapshot (JSONB), exception_reason | immutable; snapshot on every decision |
| `notifications` | user_id, type, entity_type, entity_id, message, read | creator notifications |
| `current_funds` | org, amount, reason (NOT NULL), created_by | manual entry, audited |
| `financial_commitments` | entity_type, entity_id, amount, released_amount, remaining, status | idempotent per entity |
| `budgets` | name, status, period | |
| `budget_lines` | category, allocated, used, committed, remaining, warning_threshold_pct | remaining = allocated − used − committed |
| `audit_logs` | user, action, entity, previous/new (JSONB), context | append-only, cross-cutting |

### Concurrency Strategy

- **PR edits / recall:** `version` compare-and-swap → `409 Version conflict` on mismatch (SC-007).
- **Final approval + commitment:** row lock on PR + org-level advisory lock during validation/commitment creation (FR-011) so two simultaneous approvals cannot over-commit.
- **Commitment idempotency:** unique active commitment per entity_type+entity_id (FR-005).
- **Budget lines:** lock line row when updating committed/remaining during approval.

### Indexing Priorities

- `(organization_id, status, created_at)` on PRs for filtered lists (SC-005).
- `(organization_id, entity_type, entity_id)` on approval_history and audit_logs.
- `(organization_id, status)` on commitments; `(organization_id, user_id, is_read)` on notifications; `(organization_id, category)` on budget_lines.

---

## 12. API Planning

### Conventions

- RESTful JSON; tenant context from JWT (never from request body).
- Status semantics: `400` business-rule violation, `403` authorization, `404` not found, **`409` concurrency conflict**, `200/201` success.
- Router prefixes (existing): `/api/purchase-requests`, `/api/approvals`, `/api/financial`, plus planned `/api/purchase-orders` and `/api/notifications`.

### Purchase Request Endpoints

| Method & Path | Purpose | Success / Errors (from spec) |
|---|---|---|
| `POST /api/purchase-requests` | Create draft PR | 201 |
| `GET /api/purchase-requests?status=&skip=&limit=` | List/filter/paginate | 200 |
| `GET /api/purchase-requests/{id}` | Detail with items | 200 / 404 |
| `POST /api/purchase-requests/{id}/submit` | Submit | 200 / 400 |
| `PUT /api/purchase-requests/{id}` | Update draft header | 200 / 400 / 409 |
| `POST /api/purchase-requests/{id}/items` | Add item | 201 |
| `PUT /api/purchase-requests/{id}/items/{item_id}` | Update item | 200 |
| `DELETE /api/purchase-requests/{id}/items/{item_id}` | Delete item | 200 |
| `POST /api/purchase-requests/{id}/recall` | Recall to draft | 200 / 400 / 403 |
| `GET /api/purchase-requests/{id}/financial-impact` | Financial summary | 200 |
| `GET /api/purchase-requests/{id}/duplicates` | Duplicate check | 200 |
| `POST /api/purchase-orders` | Convert approved PR → PO | 201 / 400 |

### Approval Endpoints

| Method & Path | Purpose |
|---|---|
| `GET /api/approvals/pending` | Pending queue for current user |
| `POST /api/approvals/{type}/{id}/approve` | Approve |
| `POST /api/approvals/{type}/{id}/reject` | Reject (reason) |
| `POST /api/approvals/{type}/{id}/hold` | Hold (reason) |
| `POST /api/approvals/{type}/{id}/approve_with_exception` | Approve with exception (reason mandatory) |
| `POST /api/approvals/{type}/{id}/resume` | Resume held |
| `GET /api/approvals/{type}/{id}/history` | Audit trail |
| `GET /api/approvals/{type}/{id}/financial-summary` | Financial impact summary |
| `GET/POST /api/approvals/workflows(+/{id}/steps, +/{id}/rules)` | Workflow configuration |

### Financial Endpoints

| Method & Path | Purpose |
|---|---|
| `GET /api/financial/available-funds` | Live available funds |
| `POST/PUT /api/financial/current-funds` | Manual funds entry (reason + audit) |
| `GET /api/financial/commitments` | Commitment list |
| `POST /api/financial/commitments/{id}/release` | Full/partial release (audited) |
| `POST /api/financial/commitments/{id}/adjust` | Manual adjustment (Finance Manager+, reason) |
| `GET /api/financial/validation/{type}/{id}` | Financial validation for entity |
| `GET/POST /api/financial/budgets(+/{id}/lines)` | Budget CRUD |
| `GET /api/financial/dashboard` | Dashboard summary + risk indicator |

### Notifications Endpoints

| Method & Path | Purpose |
|---|---|
| `GET /api/notifications` | Current user's notifications |
| `GET /api/notifications/unread-count` | Unread badge |
| `PATCH /api/notifications/{id}/read` | Mark read |

---

## 13. Security Plan

### Authentication

- JWT (short-lived access token) via `python-jose`; refresh flow per SECURITY-PLAN conventions; tenant resolved from JWT claims.

### Authorization Chain

1. Authenticate (JWT) → 2. Resolve org from token → 3. Tenant isolation → 4. Module entitlement (RBAC module) → 5. Permission check → 6. Scope check → 7. Approval authority (step `max_amount`) → 8. Business rules (SoD, workflow, critical risk).

### Control Points Specific to These Features

| Control | Enforcement |
|---|---|
| SoD (FR-002) | Backend: approver ≠ created_by → rejected with SoD message |
| Authority limits (FR-003) | Step `max_amount` vs PR total |
| Critical-risk block (FR-005) | Normal approval rejected on `critical`; only `approve_with_exception` with mandatory reason |
| Creator-only edit/recall | `requested_by == current_user` else 403 |
| Mandatory reasons | Current-funds entry, commitment adjust, exception approval, reject/hold comments |
| Optimistic locking | `version` on PR edit/recall/approval → 409 on conflict |
| Tenant isolation | `organization_id` filter on every query; JWT-bound org |
| Audit | Every financial action logged (audit_logs); every decision in approval_history with snapshot |

### Financial Operation Safety

- Final-approval validation + commitment creation run in one transaction under org-level advisory lock (prevents over-commitment).
- No silent deletes; financial records are released/adjusted with audit, never hard-deleted.

---

## 14. UI/UX Structure

### Current Frontend Inventory (`frontend/src`)

| File | Purpose |
|---|---|
| `App.tsx` | Route map (react-router): `/login`, `/` (Dashboard), `/suppliers`, `/procurement/requests`, `/procurement/requests/:id`, `/approvals` |
| `api/client.ts` | Axios instance, base URL `/api`, JWT interceptor, 401 → redirect to `/login` |
| `context/AuthContext.tsx` | User session state |
| `components/Layout.tsx` | App shell: brand header, sidebar nav (Dashboard, Purchase Requests, Approvals, Suppliers), user info + logout |
| `pages/*` | LoginPage, DashboardPage, PurchaseRequestsPage, PRDetailPage, ApprovalsPage, SuppliersPage |

### Navigation Map (target)

```
Login ──> Layout
           ├── Dashboard
           ├── Purchase Requests
           │     ├── List (filters: status; pagination)
           │     └── PR Detail (items, financial impact, history, actions)
           ├── Approvals (pending queue + act per step)
           ├── Suppliers (existing reference data)
           ├── Financial (planned)
           │     ├── Dashboard (available funds, commitments, risk indicator)
           │     ├── Current Funds entry
           │     └── Budgets
           └── Workflow Configuration (planned, owner only)
```

### Page-by-Page Breakdown

| Screen | Key Elements | Data / APIs | Roles |
|---|---|---|---|
| Login | Email/password | `/api/auth/login` | All |
| Dashboard | Available funds, commitments, obligations, pending, risk badge | `/api/financial/dashboard` | Finance+ |
| PR List | Table: request number, date, category, total, status; status filter; paginate | `GET /purchase-requests` | Dept Manager+ |
| PR Create/Edit | Header form + line items grid; live totals; version-aware save | `POST/PUT /purchase-requests`, `/items` | Coordinator creator |
| PR Detail | Items, totals, financial impact, approval history, action buttons | detail + `/financial-impact` + `/history` | Depends on role |
| Approvals Queue | Pending PRs: request number, total, category, requester; act (approve/reject/hold/exception/resume) | `GET /approvals/pending`, action endpoints | Approver |
| Workflow Config | Workflow list, steps editor (order, role, limit), rules editor | `/approvals/workflows` | Org Owner |
| Financial Dashboard | Current funds, commitments, budgets, risk indicator (Safe/Warning/Critical) | `/api/financial/*` | Finance Manager+ |

### UI Patterns

- **Risk indicators:** Safe (green) / Warning (amber) / Critical (red) on financial summaries and dashboard (financial-engine US5).
- **Status badges** for PR/approval states in lists.
- **Empty state message** for empty pending queue ("No requests pending your approval" — approval US4-3).
- **Dialog/confirm** for destructive actions (recall, reject, hold, exception) with mandatory reason fields.
- **Role-based / entitlement-based menu visibility** (backend remains the authority).
- **Table + pagination** for PR lists and approval history.

---

## 15. Development Phases

Build against spec feature branches; each phase stable + tested before the next.

```
Phase 0 — Foundation        Auth (JWT), org/tenant context, RBAC wiring, audit, event bus, DB schema
Phase 1 — Purchase Request  PR CRUD, items, totals, submit, duplicate detection, list/filter
Phase 2 — Financial Engine  Current funds, available funds, commitments, budget validation, risk
Phase 3 — Approval Workflow Routing, 4 actions, SoD, authority, history, queue, resume, notifications
Phase 4 — Gap Closure       Recall, draft edit + versioning, PO conversion, dashboard, tests
Phase 5 — Hardening         Concurrency tests, tenant isolation tests, performance, edge cases
```

**Current focus:** Phase 4 gap closure per `SPEC-GAPS-PLAN.md`, delivered end to end.

---

## 16. Task Breakdown

### Phase 0 — Foundation

- [ ] JWT auth + tenant resolution middleware
- [ ] Organization/user models + RBAC wiring (service layer)
- [ ] Audit service (`log_action`) + event bus (`events/bus.py`)

### Phase 1 — Purchase Request (core + gaps)

- [ ] PR create with auto request number (PR-000001, per-org sequential)
- [ ] Line/PR totals computation (qty × price; sum of lines)
- [ ] Submit validation: min 1 item (P1.1), budget category linked, duplicate check
- [ ] Duplicate detection within 10% tolerance + `duplicate_detection_log`
- [ ] List/filter by status with pagination
- [ ] **P2.1** Recall to draft (`submitted` only, creator only, no ApprovalHistory)
- [ ] **P2.2** Draft edit endpoints (header `PUT`, items `POST`/`PUT`/`DELETE`) + version 409 (incl. zero-price warning)
- [ ] **P3.1** Convert approved PR → PO (item carryover, `purchase_ordered`)
- [ ] PR financial-impact endpoint

### Phase 2 — Financial Engine (core + gaps)

- [ ] Available funds formula (FR-001), real-time (no caching)
- [ ] **P1.2** Current funds entry (manual, reason mandatory, audit)
- [ ] **P1.3** Commitment idempotency (FR-005)
- [ ] **P1.4** Commitment release API + audit on release (FR-013)
- [ ] Attachment of commitment → budget line committed/remaining update
- [ ] Budget validation + risk classification (safe/warning/critical) (FR-007/008/009)
- [ ] Financial snapshot capture with every decision (FR-010)
- [ ] **P2.3** Concurrent approval protection (advisory lock + version) (FR-011)
- [ ] **P3.2** Financial dashboard (US5)

### Phase 3 — Approval Workflow (core + gaps)

- [ ] Workflow matching + routing (FR-001)
- [ ] `resolve_current_step` w/ max_amount skip + deleted-role skip (US2-6)
- [ ] 4 actions + step-assignment enforcement (SoD FR-002, authority FR-003)
- [ ] Live financial validation at final step (FR-004/005/006)
- [ ] Pending queue by role/step (FR-011) — incl. user-assigned steps
- [ ] Approval history (FR-007)
- [ ] **P2.4** Resume held requests (FR-013)
- [ ] **P2.5** Workflow CRUD update/delete (soft) (FR-009)
- [ ] **P2.6** Permission checks on workflow management
- [ ] **P3.3** Notifications to creator (FR-014) + notifications API

### Phase 4 — Gap Closure (consolidated, from SPEC-GAPS-PLAN)

| ID | Task | Effort |
|---|---|---|
| P1.1 | Min-item validation on submit | S |
| P1.2 | Current funds entry | M |
| P1.3 | Commitment idempotency | S |
| P1.4 | Audit on release + release API | S |
| P2.1 | Recall to draft | S |
| P2.2 | Draft PR/items editing + versioning | M |
| P2.3 | Concurrent approval protection | M |
| P2.4 | Resume held requests | S |
| P2.5 | Workflow CRUD update/delete | M |
| P2.6 | Permission checks on workflow mgmt | S |
| P3.1 | PR → PO conversion | L |
| P3.2 | Financial dashboard | S |
| P3.3 | Creator notifications | M |

### Phase 5 — Hardening

- [ ] Concurrency tests (double approval, double edit, double recall)
- [ ] Tenant isolation tests
- [ ] Performance checks (funds calc < 1s, queue < 2s/500, list < 2s/1,000)

---

## 17. Priorities

### Priority Matrix (spec P1/P2/P3 ↔ task IDs)

| Spec | P1 (must-have) | P2 (should) | P3 (nice-to-have) |
|---|---|---|---|
| Purchase Request | Create/Submit (P1.1) | Recall (P2.1), Edit (P2.2), Duplicate Detection, List/Filter | Convert to PO (P3.1) |
| Approval Workflow | Process Decisions, Pending Queue | Workflow Config (P2.5/P2.6), History & Audit | Resume (P2.4) |
| Financial Engine | Funds calc, Commitments (P1.2/P1.3), Validation | Budget checks, Release API (P1.4), Concurrency (P2.3) | Dashboard (P3.2), Notifications (P3.3) |

### Execution Order

```
Batch A (independent)      : P1.1, P1.2, P1.3, P1.4, P2.1, P2.4, P2.5, P2.6
Batch B (after P2.1)       : P2.2 edit/items
Batch C (after P1.2)       : P2.3 concurrent protection, P3.2 dashboard
Batch D (after P1.2)       : P3.3 notifications
Batch E (after P2.1+P2.2)  : P3.1 PO conversion
```

### MVP Definition by Priority

MVP = all P1 + P2 items across the three specs. P3 items (PO conversion, dashboard, notifications, resume) are included in the current gap-closure scope.

---

## 18. Testing Strategy

The specs mandate user scenarios + acceptance scenarios; each is converted to an automated test.

### Test Levels

| Level | Coverage | Example |
|---|---|---|
| **Unit / Service** | Financial math, validation, workflow state transitions | Available funds = 100k − 20k − 5k = 75k; committed sum for active/partially_released |
| **API Integration** | Contract per endpoint incl. error codes | Recall: 200 / 400 (already draft) / 403 (non-creator); edit: 400 / 409 (version) |
| **Financial Integrity** | Atomicity, idempotency, release math | Approve twice → 1 commitment; partial release 3k → remaining 7k |
| **Concurrency** | Double-approval, double-edit, double-recall | Second actor gets conflict (409 / advisory-lock rejection) |
| **Security / Tenant** | SoD, authority, cross-tenant isolation | Creator approving own PR → rejected; step max_amount exceeded → rejected; org B cannot read org A PR |
| **Performance** | Budget-line verification vs SC targets | Funds calc < 1s; queue < 2s (500); list < 2s (1,000) |

### Test Infrastructure

```
backend/tests/
├── conftest.py              # async fixtures: test DB (per-org), users/roles, auth client
├── test_procurement.py      # P1.1, P2.1, P2.2, P3.1
├── test_approval.py         # actions, SoD, authority, routing, resume, workflow CRUD
├── test_financial.py        # funds calc, P1.2, P1.3, P1.4, P2.3, budget warnings, dashboard
└── test_notifications.py    # P3.3
```

- `pytest` + `pytest-asyncio` (already declared in `pyproject.toml`).
- Given-state helpers mirror spec "Given …" clauses (seed org, funds, commitments, workflows, PRs).
- Run: `pytest` from `backend/`.

### Exit Criteria (from spec Success Criteria)

- PR: create+submit 5 items < 3 min; dup-catch ≥ 95%; recall < 10s+audit; 100% submitted PRs have budget category; list filter < 2s (1,000); edit < 2s; concurrent edit conflict 100%.
- Approval: decisions < 5s incl. financial validation; 100% audit w/ snapshot; SoD caught 100%; real-time validation; workflow changes immediate; queue < 2s (500).
- Financial: funds calc < 1s; commitment < 1s after final approval; 100% approved PRs have active commitment; 0 stale data; critical blocks normal approval 100%; budget warnings within 1%.

---

## 19. Deployment Plan

### Environments

| Env | Purpose | Stack |
|---|---|---|
| Dev | Local iteration | `docker-compose.yml`: postgres (5434) + backend (8000) + frontend (3000) |
| Staging | Pre-prod validation | Managed Postgres + containerized API/SPA, CI/CD deploy |
| Production | Live | Managed Postgres (HA), containerized API + static SPA build behind CDN/proxy |

### Containerization & Services

- **postgres:** `postgres:16-alpine`, volume-backed, healthcheck-gated.
- **backend:** Python 3.11 slim, uvicorn on 8000; mounts `./backend` for dev reload.
- **frontend:** Vite build → nginx (or Vercel/static host). *Action item: `frontend/Dockerfile` referenced by docker-compose but not yet created.*

### CI/CD Pipeline (GitHub Actions — recommended)

```
Push → lint (ruff) → typecheck (mypy) → tests (pytest) → build images → migrate DB (alembic up head) → deploy
```

- Migrations run as a separate step before app rollout.
- Secrets (SECRET_KEY, DATABASE_URL) via environment secrets, never in repo.

### Database

- Schema created by SQLAlchemy `create_all` (dev) / Alembic migrations (staging+prod).
- Backup: managed PG scheduled snapshots + nightly `pg_dump`; restore drill tested for staging.
- No destructive migrations on financial tables; additive + data-preserving.

### Operational Concerns

| Concern | Approach |
|---|---|
| Rollback | Frontend: redeploy previous image; Backend: keep release pin + reversible alembic steps |
| Monitoring | `/api/health` heartbeat; structured logs for services; alert on failed jobs |
| Rate limiting | Enforced per tenant/user at API layer; CORS restricted per environment |
| Secrets | `.env` per environment, excluded from git |

---

## 20. Risks & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | Concurrent approvals exceed available funds | Financial over-commitment | High | Org-level advisory lock around final validation + commitment creation; in-flight tracking; SC-005 block on critical |
| 2 | Commitment duplication | Inflated commitments, wrong available funds | Medium | Idempotent `create_commitment` (unique active per entity) + test (FR-005) |
| 3 | SoD bypass (self-approval) | Governance/compliance failure | Medium | Backend SoD check before every approval; SC-003; tests |
| 4 | Approval by wrong step/user | Unauthorized decisions | Medium | Step-assignment enforcement (role/user match) + authority limit + permission |
| 5 | Workflow misconfiguration (no matching workflow) | Stuck PRs | Low | Default workflow (no rules = match all); step-skip with warning logs |
| 6 | Held PRs dead-end | Abandoned procurement | Medium | Resume action returns to under_review; step re-evaluated; creator notified |
| 7 | Stale financial validation | Wrong approval | High | Real-time calc at the moment of final approval; no caching of funds |
| 8 | Tenant data leakage | Critical breach | Low | `organization_id` mandatory filter at data layer; JWT-derived tenant; isolation tests |
| 9 | Version conflicts handled poorly | Lost edits / frustrated users | Medium | Explicit 409 + clear messages; retry against fresh version |
| 10 | Budget line not updated on commitment | Budget warnings wrong | Medium | Update committed/remaining atomically with commitment creation; tests |
| 11 | Current-funds misuse | Manipulated position | Medium | Finance Manager+ only, mandatory reason, audited |
| 12 | Deployment gap (`frontend/Dockerfile` missing) | Broken docker-compose flow | Medium | Create frontend Dockerfile (nginx static) as part of Phase 4 |
| 13 | Duplicate detection false positives | Legit purchases blocked | Low | 10% tolerance + match score surfaced; override logging per spec |

---

## 21. Future Enhancements

Explicitly deferred in the specs (Assumptions) and of interest for later phases:

- **Upcoming Obligations module** — replaces the `0.0` placeholder in available funds (financial-engine assumption).
- **Pending Payments module** — same, currently `0.0`.
- **Bank feed** — automate current-funds entry instead of manual.
- **Supplier module** — full registry; `preferred_supplier_id` currently a bare UUID reference.
- **Branch / Department management** — full CRUD and scoping backend.
- **Multi-currency** — base-currency only today.
- **Email / WhatsApp notification dispatch** — in-app only today.
- **Payments, Receiving, Invoicing, Three-Way Matching** — downstream procurement lifecycle phases.
- **RBAC full module** — permission catalog, role management, module entitlements enforcement across the API.

---

*This document defines the POS software planning for the three feature specs. Detailed gap-closure tasks, current state, and migration requirements are tracked in `SPEC-GAPS-PLAN.md`.*