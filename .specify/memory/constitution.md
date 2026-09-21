<!--
Sync Impact Report v1.0:
- Version change: (template) → 1.0.0
- Principles defined: 7 (Tenant Isolation, Test-First, Integration-First, Structural Simplicity, Audit Compliance, No Silent Deletion, Financial Integrity)
- Added sections: Technical Standards, Multi-Tenant SaaS Requirements, Development Workflow & Quality Gates, Governance
- Templates sync check: plan-template (Constitution Check + Complexity sections) ✅ aligned; spec-template (scope only, no principle refs) ✅; tasks-template (TDD task categories) ✅
-->
# POS Constitution

**Project**: POS — Multi-Tenant Procurement & Financial Controls (SaaS)
<!-- Generic multi-tenant SaaS procurement + financial-controls product, derived strictly from the three specs: 001-purchase-request, 002-approval-workflow, 003-financial-engine. Not German Gym. -->

## Core Principles

### I. Tenant Isolation (NON-NEGOTIABLE)

Every business entity is scoped by `organization_id` resolved from Authenticated Principal / JWT context — never from client input, subdomain prefixes, or headers placed by the client. All queries, inserts, and updates MUST include `organization_id`; all cross-tenant data access MUST be prevented. Audit records are tenant-scoped by `organization_id` and never cross-tenant. Platform-level (cross-tenant) data is out of scope for the three specs and MUST NOT be introduced implicitly.

### II. Test-First (NON-NEGOTIABLE)

TDD is mandatory: Tests MUST be written and approved BEFORE implementation. Red-Green-Refactor cycle is strictly enforced. Tests MUST cover: unit behavior per service function, API/contract per endpoint (using JSON Schema contracts), and integration for financial/approval/procurement interactions. A feature/task is not done until its tests pass.

### III. Integration-First (NON-NEGOTIABLE)

Real PostgreSQL integration tests are REQUIRED for NEW service contracts, inter-service communication (procurement ↔ approval ↔ financial), shared schemas, and any change that alters data flow between services. Backend test suite runs against PostgreSQL; if a test touches more than one service or a financial invariant, it is an integration test.

### IV. Structural Simplicity

Simplest structure that works; MAX 3 interdependent projects (backend + frontend, single deployable). No generic "entity service" abstraction. Direct service-layer calls between services; feature logic lives in the domain service layer (e.g., `procurement_service.py`, `approval_service.py`, `financial_service.py`). No over-engineered layers, no speculative abstractions.

### V. Audit Compliance

Every state transition MUST be recorded in an append-only audit log. Append-only means: audit entries are NEVER updated or deleted; no mechanism to modify audit history; tenant-isolated by `organization_id`; retained indefinitely even after organization closure. Mandatory: reason for every manual/override/release/current-funds action. Also required for soD-behaviorable approvals (e.g., escalation, duplicate override).

### VI. No Silent Deletion

No hard deletes of business/financial/audit records. Soft deletes via status / `is_deleted` where lifecycle allows. Financial records (commitments, current funds, releases) and audit logs MUST NEVER be deleted. Business-rule terminations require a mandatory reason and are audit-logged.

### VII. Financial Integrity

Obligations and pending-payments return 0 until their modules are actually built; never fake/leak financial figures. Available funds MUST equal ledger start + current-funds entry − commitments retained. Commitments are idempotent: a create is applied at most once per business action; releases applied at most once per audit action. Every financial action is a first-class, audited transaction with mandatory reason.

## Technical Standards

- **Language/Platform**: Python 3.11+ on backend; FastAPI, async SQLAlchemy 2.0 + PostgreSQL 16, Pydantic v2, JWT (python-jose).
- **Frontend**: React SPA consuming the REST API.
- **Testing**: pytest + pytest-asyncio; contract tests validate JSON Schema payloads (`contracts/schemas/*.json`).
- **Storage invariants**: `audit_logs` table has no UPDATE/DELETE permissions (append-only); optimistic locking via `version` column on concurrent-editable entities (conflict → 409).
- **Deployment**: Docker; backend + frontend as separate services behind one compose file.

## Multi-Tenant SaaS Requirements

- RBAC: role-based access; Auditor = read-only; approval escalation and SoD override require explicit, audited opt-in per organization policy.
- Notifications (approval tasks, escalations) are per-tenant and auditable.
- Concurrency: PR edit conflicts of 100% detected; available-funds checks run within a single DB transaction with row-level locking to prevent overspend.

## Development Workflow & Quality Gates

- Feature branch per spec feature (`001-*`, `002-*`, `003-*`); branch, `specs/<feature>/`, and `history/prompts/<feature>/` share the short-name.
- Phased gate per spec: Constitution Check PASS → Phase 0 research → Phase 1 design → Phase 2 tasks → Phase 3 test-first implementation per User Story.
- /sp.implement executes per `/sp.tasks` grouping ordered by User Story; tasks runnable in parallel are marked `[P]`; checkpoints validate each User Story independently.
- A commit that introduces code MUST include its tests; a code-review gate verifies constitution compliance.
- No silent scope creep: out-of-scope modules go to a Deferred section, never silently half-built.

## Governance

The Constitution supersedes all other practices for this project. Amendments require: documented change, explicit user approval, and migration of dependent artifacts (spec/plan/tasks) via the Sync Impact Report. Complexity MUST be justified in the plan's Complexity Tracking table; unjustified complexity is rejected. Code-review/analyze runs MUST flag constitution conflicts as CRITICAL — resolved by adjusting the artifact, not by diluting the principle.

**Version**: 1.0.0 | **Ratified**: 2026-09-21 | **Last Amended**: 2026-09-21