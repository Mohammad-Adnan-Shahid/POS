# Implementation Plan: Approval Workflow Engine

**Branch**: `002-approval-workflow` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-approval-workflow/spec.md`

**Note**: This template is filled in by the `/sp.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Primary requirement: configurable multi-step approval for purchase requests — workflows with ordered steps (role- or user-assigned, per-step `max_amount` authority limit) and matching rules (min/max amount, category, branch, department); routing to the first matching workflow (empty rules = default). Approvers act with four actions (`approve`, `reject`, `hold`, `approve_with_exception`) plus `resume` for held requests. Governance enforced: SoD (no self-approval), authority limits, live financial validation at the final step (blocking normal approval on "critical" risk), financial snapshot on every decision, immutable audit trail, role+step filtered pending queue, and creator notifications.

Technical approach: FastAPI modular monolith; approval routing/decision logic in `approval_service.py`; financial validation + commitment creation delegated to `003-financial-engine` in the same transaction (row lock on PR + advisory lock). Concurrency protected by optimistic locking on the PR `version` and in-flight commitment tracking (FR-011). Events published on `app/events/bus.py` so the notification service (P3.3) reacts to decisions.

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: FastAPI, SQLAlchemy 2.0 (async, asyncpg), Pydantic v2, python-jose (JWT)
**Storage**: PostgreSQL 16
**Testing**: pytest + pytest-asyncio
**Target Platform**: Linux server (Docker)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: approval decision (incl. financial validation) < 5s (SC-001); pending queue < 2s (500 items, SC-006)
**Constraints**: 100% decisions have audit trail + snapshot (SC-002); 100% SoD catch (SC-003); real-time validation, never cached (SC-004); config changes effective immediately for new PRs (SC-005)
**Scale/Scope**: Multi-tenant; ~500 pending items per org baseline

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Tenant isolation**: workflows/rules/steps/history/notifications carry `organization_id` (PASS)
- **Test-first**: acceptance scenarios → tests before implementation (PASS — required)
- **Integration-first**: real PostgreSQL; approval tests run with real financial validation (PASS)
- **Simplicity (≤3 projects)**: single backend + frontend (PASS)
- **Anti-abstraction**: workflow engine is domain logic, not a generic BPM abstraction (PASS)
- **Audit compliance**: append-only approval history; financial snapshot on every decision (FR-006/FR-007, PASS)
- **No silent deletion**: workflow deactivation is soft (`is_active=false`), reject/hold keep history (PASS)

No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/002-approval-workflow/
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
│   ├── models/approval.py       # ApprovalWorkflow, Step, Rule, ApprovalHistory, (Notification → P3.3)
│   ├── schemas/approval.py      # workflow/step/rule/history schemas (incl. FinancialImpactSummary)
│   ├── services/approval_service.py
│   ├── services/notification_service.py   # P3.3
│   ├── api/approval.py
│   └── events/bus.py            # decision events → notifications
├── alembic/versions/
└── tests/
    ├── contract/
    ├── integration/
    └── unit/

frontend/
├── src/
│   ├── pages/approvals/
│   └── services/
└── tests/
```

**Structure Decision**: Web application structure per existing repository layout. Workflow engine = service-layer domain logic in `approval_service.py`; REST in `api/approval.py`; events via existing `events/bus.py`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |