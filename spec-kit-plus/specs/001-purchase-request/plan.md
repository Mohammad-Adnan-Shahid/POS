# Implementation Plan: Purchase Request Management

**Branch**: `001-purchase-request` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/spec-kit-plus/specs/001-purchase-request/spec.md`

**Note**: This template is filled in by the `/sp.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Primary requirement: department coordinators can create purchase requests with line items, link a budget category, edit draft PRs (header + items) with optimistic locking, submit for approval (min 1 item, linked category, duplicate detection within ±10% of same-category totals), recall an unprocessed submitted PR to draft, list/filter PRs by status, and convert an approved PR into a Purchase Order.

Technical approach: modular FastAPI monolith with async SQLAlchemy 2.0 + PostgreSQL, tenant-scoped via `organization_id` from JWT context, Pydantic v2 validation, optimistic locking via `version` column, sequential per-org request numbers (`PR-000001`), duplicate detection at submit using normalized category + total similarity. FR-011 (commitment on full approval) is delegated to the `002-approval-workflow` + `003-financial-engine` features via the approval and financial services.

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: FastAPI, SQLAlchemy 2.0 (async, asyncpg), Pydantic v2, python-jose (JWT)
**Storage**: PostgreSQL 16
**Testing**: pytest + pytest-asyncio
**Target Platform**: Linux server (Docker)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: PR list with filter < 2s (1,000 PRs); draft edit (header + items) < 2s; recall < 10s
**Constraints**: < 409 version-conflict on concurrent edits (100% detection, SC-007); submission blocked without ≥1 item and linked budget category
**Scale/Scope**: Multi-tenant; up to ~1,000 PRs per org baseline; single base currency

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Tenant isolation**: all PR/PO/duplicate tables carry `organization_id`; org resolved from JWT, never from client (PASS)
- **Test-first**: unit/API tests for each acceptance scenario before implementation (PASS — required)
- **Integration-first**: real PostgreSQL in tests where financial/approval interactions occur (PASS — required)
- **Simplicity (≤3 projects)**: single backend + single frontend (PASS)
- **Anti-abstraction**: direct service-layer calls; no generic "entity service" abstraction (PASS)
- **Audit compliance**: all state transitions logged to append-only `audit_logs` (PASS — FR-009)
- **No silent deletion**: soft deletes via status/`is_deleted`; financial records never deleted (PASS)

No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
spec-kit-plus/specs/001-purchase-request/
├── spec.md              # Feature spec (user stories, FRs, success criteria)
├── plan.md              # This file
├── research.md          # Phase 0 research (tech decisions + rationale)
├── data-model.md        # Phase 1 entities, fields, validation
├── quickstart.md        # How to run/validate the feature locally
├── contracts/           # Phase 1 API contracts
└── tasks.md             # Phase 2 task list (/sp.tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── models/procurement.py      # PurchaseRequest, PurchaseRequestItem, PurchaseOrder, PurchaseOrderItem, DuplicateDetectionLog
│   ├── schemas/procurement.py     # PR/PO/item request+response schemas
│   ├── services/procurement_service.py
│   ├── api/procurement.py
│   └── main.py
├── alembic/versions/              # migrations
└── tests/
    ├── conftest.py
    ├── unit/
    ├── integration/
    └── contract/

frontend/
├── src/
│   ├── pages/purchase-requests/
│   ├── components/
│   └── services/api.ts
└── tests/
```

**Structure Decision**: Web application structure (backend + frontend) matching the existing repository layout. Feature logic lives in the backend service layer (`procurement_service.py`), exposed via REST in `api/procurement.py`, consumed by the React SPA.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |