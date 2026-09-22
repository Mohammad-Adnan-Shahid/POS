# Quickstart: Financial Engine

**Branch**: `003-financial-engine` | **Date**: 2026-09-21

How to run and validate this feature locally.

## Prerequisites

- Docker (PostgreSQL 16 per root `docker-compose.yml`), Python 3.11
- Backend deps: `cd backend && pip install -e ".[dev]"`

## Start

```bash
docker compose up -d postgres
cd backend
alembic upgrade head
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

## Validate

1. **Funds entry (US1/P1.2)**: `POST /api/v1/financial/funds` `{ "amount": 150000, "reason": "Top-up" }` → `GET /available-funds` reflects it immediately. Missing `reason` → 400. Non-Finance-Manager → 403.
2. **Commitments (US2/P1.3/P1.4)**: approve a PR (via `002` feature) → `GET /commitments` shows active commitment; approve again → only one commitment (idempotency); `POST /commitments/{id}/release` `{ "amount": 3000, "reason": "Partial payment" }` → `partially_released`, audit entry present.
3. **Validation (US3)**: `GET /validation/purchase_request/{pr_id}` → projected position + risk level; budget overrun → critical.
4. **Budget warnings (US4)**: line with 50k allocated → remaining 10k = critical, 25k = warning, 40k = safe; no line → `budget: null`, never blocks.
5. **Dashboard (US5/P3.2)**: `GET /financial/dashboard` → all fields freshly calculated; critical highlighted.
6. **Concurrency (P2.3)**: two simultaneous final approvals exceeding funds → second rejected (409/conflict).

## Tests

```bash
cd backend && pytest -q            # incl. concurrency suite (tests/integration/test_financial.py)
```