# Quickstart: Approval Workflow Engine

**Branch**: `002-approval-workflow` | **Date**: 2026-09-21

How to run and validate this feature locally.

## Prerequisites

- Docker (PostgreSQL 16 per root `docker-compose.yml`), Python 3.11
- Backend deps: `cd backend && pip install -e ".[dev]"`

## Start

```bash
docker compose up -d postgres   # or backend per compose
cd backend
alembic upgrade head
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

## Validate

1. **Queue (US4)**: create PR (001 feature) + submit → creator sees it in `GET /api/v1/approvals/pending` only if role matches step 1.
2. **Decisions (US1)**: `POST /approvals/{purchase_request}/{pr_id}/approve` at step 1 → advance; at final step with critical risk → 403 `CRITICAL_RISK`; `approve_with_exception` (with exception_reason) → approved + commitment created (financial feature).
3. **SoD**: PR creator approving own PR → 403 `APPROVER_IS_CREATOR`.
4. **Config (US2)**: create workflow + steps + rules via `POST /approvals/workflows/...`; verify routing by amount; user without `approval.configure_workflow` → 403.
5. **History (US3)**: `GET /approvals/{entity_type}/{entity_id}/history` → chronological decisions with snapshots.
6. **Resume (US5/P2.4)**: hold a PR → `POST .../resume` → `under_review`; change financials → re-validation at next step.
7. **Notifications (P3.3)**: approve/reject → creator has unread notification (`GET /api/v1/notifications`).

## Tests

```bash
cd backend && pytest -q
```