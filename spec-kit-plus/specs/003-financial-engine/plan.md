# Implementation Plan: Financial Engine

**Branch**: `003-financial-engine` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/spec-kit-plus/specs/003-financial-engine/spec.md`

**Note**: This template is filled in by the `/sp.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Primary requirement: real-time available funds (`Current Funds − Commitments − Obligations − Pending Payments`, FR-001), commitment tracking auto-created on PR approval (idempotent, full/partial release), live financial validation at the moment of final approval with risk classification (safe/warning/critical), budget validation with warning thresholds, manual current-funds entry (mandatory reason + audit), concurrent-approval protection, and a financial dashboard.

Technical approach: FastAPI modular monolith; `financial_service.py` owns all money math (funds calc, commitments, validation, budget checks). Calculation is synchronous and uncached (FR-002); correctness under concurrency via `SELECT FOR UPDATE` row locks (budget lines, commitments, current funds), optimistic-lock CAS on the PR `version` at the approval step, org-level advisory lock around available-funds calculation, and idempotent commitment creation (partial unique index on active `(entity_type, entity_id)`). Obligations/pending payments are returned as `0` until their modules exist (spec Assumptions). Manual current-funds entry replaced the hardcoded `100000.0` baseline (P1.2).

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: FastAPI, SQLAlchemy 2.0 (async, asyncpg), Pydantic v2
**Storage**: PostgreSQL 16
**Testing**: pytest + pytest-asyncio
**Target Platform**: Linux server (Docker)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: available-funds calc < 1s (SC-001); commitment created < 1s after final approval (SC-002)
**Constraints**: 100% approved PRs have active commitment (SC-003); zero stale data (SC-004); risk classification blocks normal approval 100% when negative projection (SC-005); budget warnings accurate within 1% (SC-006)
**Scale/Scope**: Multi-tenant; single base currency; obligations/pending payments = 0 until built

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Tenant isolation**: all financial tables carry `organization_id` (PASS)
- **Test-first**: acceptance scenarios → tests before implementation (PASS)
- **Integration-first**: real PostgreSQL + real transaction/concurrency in financial tests (PASS)
- **Simplicity (≤3 projects)**: single backend + frontend (PASS)
- **Anti-abstraction**: financial domain logic is explicit, not generic ledger abstraction (PASS)
- **Audit compliance**: every fund entry / commitment change / adjustment audit-logged (FR-013, PASS)
- **No silent deletion**: financial records never deleted — reverse/adjust only (PASS)

No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
spec-kit-plus/specs/003-financial-engine/
├── spec.md               # Feature spec
├── plan.md               # This file
├── research.md           # Phase 0 tech decisions
├── data-model.md         # Phase 1 entities
├── quickstart.md         # Run/validate locally
├── contracts/            # Phase 1 API contracts
└── tasks.md              # Phase 2 task list
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── models/financial.py       # CurrentFund, FinancialCommitment, Budget, BudgetLine, BudgetAdjustment
│   ├── schemas/financial.py      # funds/commitment/budget/validation/dashboard schemas
│   ├── services/financial_service.py
│   ├── services/budget_service.py
│   ├── api/financial.py
│   └── events/bus.py             # commitment.created events (consumers: dashboard/notifications)
├── alembic/versions/             # -> current_funds, notifications migrations
└── tests/
    ├── contract/
    ├── integration/              # incl. concurrency tests
    └── unit/

frontend/
├── src/
│   ├── pages/finance/
│   └── services/
└── tests/
```

**Structure Decision**: Web application structure per existing repository layout. Money math is centralized in `financial_service.py` and must never be duplicated in other services (`002` approval calls it, `001` PO conversion calls it).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |