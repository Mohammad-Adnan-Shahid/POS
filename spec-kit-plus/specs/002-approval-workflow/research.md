# Research: Approval Workflow Engine

**Branch**: `002-approval-workflow` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: `spec-kit-plus/specs/002-approval-workflow/spec.md` — Phase 0 output (/sp.plan command)

## Decision / Rationale / Alternatives considered

### D-001: Rule-based workflow routing with first-match + default
- **Decision**: Evaluate `approval_workflow_rules` (min/max amount, category, branch, department) in definition order; first workflow whose rules match routes the PR. A workflow with **no rules** is the default (matches all).
- **Rationale**: FR-001 + spec US2 ("first matching workflow"). No rules → default fallback avoids PRs being unroutable.
- **Alternatives considered**: Scoring/weighted routing — rejected: not required, adds ambiguity; per-item rules — rejected: spec defines PR-level rules.

### D-002: Step resolution with skip/escalate on `max_amount`
- **Decision**: `resolve_current_step` returns the first non-completed step; if PR total exceeds the step's `max_amount`, skip it (warning logged) or escalate to the next qualifying step (FR/US2 AC6).
- **Rationale**: Authority-limit enforcement (FR-003) while keeping workflows runnable when a step lacks authority.
- **Alternatives considered**: Block entire workflow — rejected: dead-ends purchases; manual override — rejected: weakens authority model.

### D-003: Synchronous live validation at final step, in one DB transaction
- **Decision**: At final approval, call `financial_service.validate_financial_position` at the moment of approval within the same DB transaction that records the decision and creates the commitment.
- **Rationale**: FR-004/SC-004 (real-time position, never cached); spec US1 AC4 (critical blocks normal approval).
- **Alternatives considered**: Pre-approval snapshot only — rejected: position can change between submission and final approval (spec Edge Cases); async validation — rejected: race with concurrent approvals.

### D-004: Optimistic lock on PR version + DB-level advisory lock for concurrent approvals
- **Decision**: Each approval operation loads PR with `version`; on write, `UPDATE ... WHERE id AND version = expected` (0 rows → 409). For the final step, a Postgres advisory lock on the org key serializes fund validation + commitment creation (P2.3, FR-011).
- **Rationale**: Two approvers acting concurrently must not double-approve or over-commit (spec Edge Cases; financial FR-011).
- **Alternatives considered**: Sole optimistic locking — rejected: does not protect the funds calculation race; row-lock only PR — rejected: two different PRs could still over-commit funds.

### D-005: SoD + authority as service-level checks before `process_approval`
- **Decision**: Before any action: (1) approver ≠ `requested_by` (FR-002), (2) approver holds current step's role/user assignment, (3) PR total ≤ step `max_amount` (FR-003). Failure → typed error → `403`/`400`.
- **Rationale**: 100% SoD catch (SC-003); authority limits per step.
- **Alternatives considered**: Rely on the frontend to hide actions — rejected: backend is the security boundary (Constitution).

### D-006: Event-driven notifications
- **Decision**: Approval decisions publish events on `app/events/bus.py`; `notification_service` (P3.3) consumes them to create in-app notifications for the PR creator.
- **Rationale**: FR-014; decouples decision logic from delivery; existing bus already present.
- **Alternatives considered**: Direct DB write from approval service — rejected: couples concerns; //todo sender (email/whatsapp) future.

### D-007: Approval history as append-only with JSONB snapshot
- **Decision**: `approval_history` rows are immutable; `financial_snapshot` JSONB captured at decision time; exception workflow requires `exception_reason`.
- **Rationale**: FR-006/FR-007, SC-002; audit compliance.
- **Alternatives considered**: Mutating a single "latest state" record — rejected: destroys audit trail.

## Adoption / References

- **Data**: `data-model.md` (workflows/steps/rules/history), transactions & concurrency design
- **API**: `contracts/api-spec.md` (approval endpoints)
- **Gap tasks**: materialized in `tasks.md` — P2.4 (resume), P2.5 (workflow CRUD), P2.6 (permissions), P3.3 (notifications)