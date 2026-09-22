# Research: Purchase Request Management

**Branch**: `001-purchase-request` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: `spec-kit-plus/specs/001-purchase-request/spec.md` — Phase 0 output (/sp.plan command)

## Decision / Rationale / Alternatives considered

### D-001: Modular monolith (FastAPI) — not microservices
- **Decision**: Single FastAPI application with domain service modules (`procurement_service`, `approval_service`, `financial_service`).
- **Rationale**: The three features (PR, approval, financial) are tightly coupled via the financial graph (commitment on approval, funds validation). One transaction must span PR + approval + commitment.
- **Alternatives considered**: Microservices per feature — rejected: distributed transactions across services would need sagas; complexity not justified at this scale.

### D-002: Async SQLAlchemy 2.0 + asyncpg
- **Decision**: Async ORM and driver throughout.
- **Rationale**: Handles concurrent approvals/edits without blocking threads; matches existing `backend/app/database.py` use.
- **Alternatives considered**: Sync SQLAlchemy + psycopg2 — rejected: would serialize concurrent operations; TortoiseORM — rejected: weaker typing and migration story.

### D-003: `organization_id` from JWT tenant context
- **Decision**: Tenant is resolved server-side from the authenticated JWT org claim.
- **Rationale**: Prevents cross-tenant data leaks; client never supplies an org hint.
- **Alternatives considered**: Client-supplied `X-Org-Id` header — rejected: spoofable; per-request allowed-org check — rejected: more surface area.

### D-004: Sequential per-org request numbers with conflict retry
- **Decision**: `PR-#######` derived from per-org counter, generated inside a transaction with unique `(organization_id, request_number)` constraint.
- **Rationale**: FR-001 requires sequential tenant-unique numbers; DB constraint guarantees uniqueness under concurrency; retry on conflict.
- **Alternatives considered**: Global sequence — rejected: leaks ordering across tenants; UUID for display — rejected: spec demands human-readable sequential PR-xxxxxx.

### D-005: Optimistic locking via `version` column (compare-and-swap)
- **Decision**: `version` integer on `purchase_requests`; every draft edit/submit/recall filters `WHERE id = :id AND version = :expected` and increments on success; 0 rows affected → 409.
- **Rationale**: SC-007 requires 100% concurrent-conflict detection; matches FR-008c and DB transaction rules in `data-model.md`.
- **Alternatives considered**: Pessimistic `SELECT FOR UPDATE` on PR rows — rejected: holds locks too long for interactive editing; acceptable for approval (used there) but not for draft editing.

### D-006: Receipt-based duplicate detection (category + ±10% total)
- **Decision**: At submit, compare against recent PRs in same `organization_id` and `category` where `abs(new - existing) <= 0.10 * existing`; produce `duplicate_detection_log` rows with `match_score` and `match_reason`.
- **Rationale**: FR-006 defines the detection rule; spec US3 requires match details and scores in the response.
- **Alternatives considered**: Embedding/vector similarity on descriptions — rejected: over-engineered, not required; exact-match only — rejected: misses near-duplicates the spec demands.

### D-007: PR item totals as generated columns
- **Decision**: `total_price` computed as `quantity * unit_price` (generated column / recomputed in service); PR total = `SUM(items.total_price)`.
- **Rationale**: FR-002; avoids drift between item inputs and stored totals.
- **Alternatives considered**: Storing user-supplied total — rejected: allows inconsistent totals.

### D-008: PO conversion creates commitment via financial service (no direct table writes)
- **Decision**: `convert_to_po` calls `financial_service.create_commitment` and sets PR status to `purchase_ordered` in the same transaction (P3.1).
- **Rationale**: FR-011/FR-012; keeps financial invariants (idempotency FR-005) inside one module.
- **Alternatives considered**: Direct commitment insert in procurement service — rejected: bypasses idempotency + audit guarantees.

## Adoption / References

- **Input**: `spec-kit-plus/specs/001-purchase-request/spec.md`, `data-model.md`, `contracts/api-spec.md`
- **Gap tasks**: materialized in `tasks.md` (P1.1, P2.1, P2.2, P3.1)