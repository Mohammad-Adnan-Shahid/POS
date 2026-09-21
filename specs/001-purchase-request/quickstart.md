# Quickstart: Purchase Request Management

**Branch**: `001-purchase-request` | **Date**: 2026-09-21

How to run and validate this feature locally.

## Prerequisites

- Docker (docker-compose for PostgreSQL 16 + backend per root `docker-compose.yml`)
- Python 3.11
- Backend deps installed: `cd backend && pip install -e ".[dev]"`

## Start

```bash
docker compose up -d postgres
cd backend
alembic upgrade head
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

## Validate

1. **Create + submit (US1/P1.1)**: login → `POST /api/v1/purchase-requests` with 2 items →
   verify `request_number` = `PR-000001`, totals computed → `POST /{pr_id}/submit`.
   Empty-items submit must return 422.
2. **Recall (US2)**: `POST /{pr_id}/recall` → status `draft`, items editable; resubmit → fresh trail.
3. **Duplicate detection (US3)**: create 2nd PR same category within 10% → submit returns
   `DUPLICATE_DETECTED` with match score.
4. **Edit draft (US6/P2.2)**: PATCH header, add/update/delete items → totals recalc;
   concurrent edit (change expected `version`) → 409.
5. **List/filter (US4)**: `GET /purchase-requests?status=...&page=&per_page=` → filtered, newest-first.
6. **Convert to PO (US5/P3.1)**: approve via approval feature → `POST /{pr_id}/convert-to-po` →
   PR `purchase_ordered`, commitment created (financial feature).
7. **Audit**: every transition appears in `GET /api/v1/audit` for the PR.

## Tests

```bash
cd backend && pytest -q            # contract + integration + unit suites
```