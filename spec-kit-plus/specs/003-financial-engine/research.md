# Research: Financial Engine

**Branch**: `003-financial-engine` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: `spec-kit-plus/specs/003-financial-engine/spec.md` — Phase 0 output (/sp.plan command)

## Decision / Rationale / Alternatives considered

### D-001: Uncached synchronous calculation
- **Decision**: `calculate_available_funds` recomputes from source rows on every call; no cache/TTL.
- **Rationale**: FR-002 + SC-004 require real-time position; a stale cache could approve an overcommitment.
- **Alternatives considered**: In-memory cache with invalidation — rejected: invalidation correctness is hard and SC-004 forbids stale data.

### D-002: `SELECT FOR UPDATE` on financial rows being modified
- **Decision**: Commitments, budget lines, and current-funds rows are locked with `SELECT ... FOR UPDATE` inside the transaction when updated/adjusted.
- **Rationale**: Prevents two concurrent adjustments to the same financial record (spec Edge Cases: simultaneous approvals, manual adjustments).
- **Alternatives considered**: Optimistic locking only — rejected: insufficient for the funds-calculation race spanning multiple rows.

### D-003: Org-level advisory lock for cross-record funds calculation at final approval
- **Decision**: Around final-approval validation + commitment creation, take a Postgres advisory lock keyed to the organization; serialize concurrent approvals that touch shared funds.
- **Rationale**: Two different PRs approved simultaneously must not jointly over-commit funds (FR-011, P2.3).
- **Alternatives considered**: Lock every commitment row — rejected: over-locking and deadlock-prone; application serialization — rejected: not robust across processes.

### D-004: Idempotent commitment creation via partial unique index
- **Decision**: Partial unique index on `financial_commitments(organization_id, entity_type, entity_id) WHERE status = 'active'`; `create_commitment` returns the existing active commitment when present.
- **Rationale**: FR-005 (idempotency) + DB-level guarantee (P1.3); double-approval cannot create duplicates.
- **Alternatives considered**: Application-level check only — rejected: race still possible; no index — rejected: duplicates proliferate.

### D-005: Available-funds formula with obligations/payments = 0
- **Decision**: `available = current_funds − active_commitments_total − 0 − 0` where obligations (FR: `get_upcoming_obligations_total`) and pending payments return `0` until those modules exist (spec Assumptions).
- **Rationale**: Spec explicitly states the modules "return 0 until implemented"; formula stays forward-compatible.
- **Alternatives considered**: Omitting the two terms — rejected: spec formula is explicit and must render in the response.

### D-006: Manual current-funds entry replacing hardcoded value
- **Decision**: `current_funds` table stores per-org entries; `PUT`/`POST` funds requires mandatory `reason` and a Finance Manager+ role; every entry audit-logged (P1.2, FR-012). `get_current_funds` no longer returns the hardcoded `100000.0`.
- **Rationale**: FR-012 US1 AC3; spec assumptions (bank feed = future).
- **Alternatives considered**: Bank feed integration — rejected: explicitly out of scope.

### D-007: Validation risk classification + budget escalation
- **Decision**: `validate_financial_position` computes projected position (`available − new amount`); risk = `safe` (projected ≥20% remaining) → `warning` (<20%) → `critical` (<0). Budget-linked over-budget escalates to `critical` regardless of funds. No budget line → budget check returns null, never blocks.
- **Rationale**: FR-007/FR-008/FR-009, US3/US4 threshold scenarios.
- **Alternatives considered**: Single global risk from funds only — rejected: misses budget-driven critical (FR-009).

### D-008: Release mutates via adjustment + audit
- **Decision**: `release_commitment` supports full/partial release (`released_amount`), audit-logs every release (`commitment.released`) with before/after, and is exposed over an API endpoint (P1.4, FR-004/FR-013). Manual adjustment requires `commitment.adjust` + mandatory reason (spec Edge Cases).
- **Rationale**: Baseline release wrote no audit and had no endpoint; spec SC-002/FR-013.
- **Alternatives considered**: Direct amount mutation without audit — rejected: violates FR-013.

## Adoption / References

- **Input**: `spec-kit-plus/specs/003-financial-engine/spec.md`, `data-model.md`, `contracts/api-spec.md`
- **Gap tasks**: materialized in `tasks.md` — P1.2, P1.3, P1.4, P2.3, P3.2