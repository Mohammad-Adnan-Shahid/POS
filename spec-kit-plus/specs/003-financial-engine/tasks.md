---

description: "Implementation tasks for Financial Engine feature"
---

# Tasks: Financial Engine

**Input**: Design documents from `/spec-kit-plus/specs/003-financial-engine/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — pytest + pytest-asyncio.

**Organization**: Tasks grouped by user story.

> Baseline already implemented (verified): commitment create/release, budget validation, risk classification, available-funds calc (hardcoded funds).

## Path Conventions

- **Web app**: `backend/app/` (services, models, api, schemas, events), `backend/tests/` (integration, contract, unit)
- Money math lives ONLY in `backend/app/services/financial_service.py`
- Frontend SPA code lives under `frontend/src/`
- Adjust paths below per plan.md structure

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Add `test_financial.py` fixtures (org, current funds, budget lines) to `backend/tests/conftest.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work until complete

- [ ] T002 Create `CurrentFund` model + migration (`current_funds` table) in `backend/app/models/financial.py` / `backend/alembic/versions/` — P1.2
- [ ] T003 Update `get_current_funds` to read latest entry (remove hardcoded `100000.0`) in `backend/app/services/financial_service.py`
- [ ] T004 Ensure `audit_service.log_action` usable from financial service (`backend/app/services/audit_service.py`)

**Checkpoint**: Foundation ready.

---

## Phase 3: User Story 1 - Calculate Available Funds in Real Time (Priority: P1) 🎯 MVP

**Goal**: Real-time `current − commitments − obligations − pending`.

**Independent Test**: 100k current, 20k commitments, 5k obligations → 75k available.

### Tests ⚠️
- [ ] T005 [P] [US1] Unit test available-funds formula incl. zero-pending path in `backend/tests/unit/test_financial.py`
- [ ] T006 [P] [US1] Integration test manual fund entry → available updates immediately in `backend/tests/integration/test_financial.py`

### Implementation
- [ ] T007 [P] [US1] Implement `POST /financial/funds` (amount + mandatory reason, Finance Manager+ permission, audit log) in `backend/app/api/financial.py` — P1.2, FR-012
- [ ] T008 [P] [US1] Wire `calculate_available_funds` to real current-funds + commitments (obligations/pending = 0) in `backend/app/services/financial_service.py` — FR-001/FR-002

**Checkpoint**: US1 functional (real funds, real-time).

---

## Phase 4: User Story 2 - Track Financial Commitments (Priority: P1)

**Goal**: Auto-create on approval (idempotent), full/partial release with audit + API.

**Independent Test**: Approve PR 10k → active commitment; cancel → fully_released.

### Tests ⚠️
- [ ] T009 [P] [US2] Contract test POST /financial/commitments/{id}/release in `backend/tests/contract/test_financial_api.py`
- [ ] T010 [P] [US2] Integration test double-approval → single commitment (idempotency) in `backend/tests/integration/test_financial.py`
- [ ] T011 [P] [US2] Integration test partial release → release audit entry in `backend/tests/integration/test_financial.py`

### Implementation
- [ ] T012 [P] [US2] Harden `create_commitment` idempotency (partial unique index on active entity) in `backend/app/services/financial_service.py` — P1.3, FR-005
- [ ] T013 [P] [US2] Implement release audit + `POST /financial/commitments/{id}/release` and `/adjust` endpoints in `backend/app/services/financial_service.py` / `backend/app/api/financial.py` — P1.4, FR-004/FR-013
- [ ] T014 [US2] Add `FinancialCommitmentResponse` + release/adjust schemas in `backend/app/schemas/financial.py`

**Checkpoint**: US1 + US2 functional.

---

## Phase 5: User Story 3 - Validate Financial Position Before Approval (Priority: P1)

**Goal**: Projected position + risk at final approval; budget overrun escalates to critical.

**Independent Test**: 100k available, PR 120k → projected −20k, critical.

### Tests ⚠️
- [ ] T015 [P] [US3] Unit test risk thresholds (70→safe, 95→warning, 120→critical) in `backend/tests/unit/test_financial.py`
- [ ] T016 [P] [US3] Integration test budget overrun → critical regardless of funds in `backend/tests/integration/test_financial.py`

### Implementation
- [ ] T017 [P] [US3] Verify `validate_financial_position` returns projected + budget block + escalation in `backend/app/services/financial_service.py` — FR-006/007/008/009
- [ ] T018 [US3] Wire `FinancialImpactSummary` response_model (fixes unused schema in `backend/app/schemas/approval.py`) — KII #1 in SPEC-GAPS-PLAN

**Checkpoint**: US1–US3 functional.

---

## Phase 6: User Story 4 - Budget Validation and Warnings (Priority: P2)

**Goal**: Warning thresholds; over-budget surfaced; no-line → null, never blocks.

**Independent Test**: 50k allocated; remaining 10k → critical; 25k → warning; 40k → safe.

### Tests ⚠️
- [ ] T019 [P] [US4] Unit test `_budget_warning_level` thresholds in `backend/tests/unit/test_financial.py`
- [ ] T020 [P] [US4] Integration test null budget line does not block in `backend/tests/integration/test_financial.py`

### Implementation
- [ ] T021 [P] [US4] Confirm budget check returns allocated/used/committed/remaining/warning/over_budget in `validate_financial_position` (`backend/app/services/financial_service.py`) — FR-008
- [ ] T022 [US4] Add budget adjust/transfer endpoints + schemas in `backend/app/api/financial.py` / `backend/app/schemas/financial.py` (FR-013 audit) — `budget.adjust`/`budget.transfer` permissions

**Checkpoint**: US1–US4 functional.

---

## Phase 7: Concurrency - Concurrent Approval Protection (FR-011, P2.3)

**Goal**: Simultaneous approvals cannot over-commit funds.

**Independent Test**: Two concurrent final approvals on different PRs exceeding funds → second rejected.

### Tests ⚠️
- [ ] T023 [P] [P2.3] Concurrency integration test (asyncio gather, two approvals) in `backend/tests/integration/test_financial.py`

### Implementation
- [ ] T024 [P] [P2.3] Add org-level advisory lock around funds validation + commitment creation; `SELECT FOR UPDATE` on affected rows in `backend/app/services/financial_service.py`
- [ ] T025 [P] [P2.3] Verify PR `version` CAS at approval entry in `process_approval` (`backend/app/services/approval_service.py`) → 409 on mismatch

**Checkpoint**: US1–US4 + concurrency safe.

---

## Phase 8: User Story 5 - View Financial Dashboard (Priority: P3 → gap P3.2)

**Goal**: At-a-glance financial position; freshly calculated; critical highlighted.

**Independent Test**: Known data → dashboard correct.

### Tests ⚠️
- [ ] T026 [P] [US5] Contract test GET /financial/dashboard in `backend/tests/contract/test_financial_api.py`
- [ ] T027 [P] [US5] Integration test dashboard values match individual calculations in `backend/tests/integration/test_financial.py`

### Implementation
- [ ] T028 [P] [US5] Implement `GET /financial/dashboard` (aggregate, fresh calc, risk_level) in `backend/app/api/financial.py` — P3.2
- [ ] T029 [US5] Add `DashboardResponse` schema + critical visual key in `backend/app/schemas/financial.py`

**Checkpoint**: All financial-engine user stories functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Run quickstart validation (see `quickstart.md`)
- [ ] T031 Verify tenant isolation on funds/commitments/budgets (automated cross-tenant test)
- [ ] T032 Index check: active-commitment partial unique index; `(org, category, department_id)` budget lookup
- [ ] T033 Performance: available-funds calc <1s (SC-001); commitment <1s after final approval (SC-002)
- [ ] T034 Audit coverage: every fund/commitment/budget mutation logged (FR-013, SC-002/SC-004)
- [ ] T035 Financial integrity: no financial record ever hard-deleted (Constitution + DATABASE-PLAN §7)

---

## Dependencies & Execution Order

### Phase Dependencies
- US1 depends on P1.2 (real funds data) — T003/T007
- US3 depends on US1; US2 commitment idempotency (P1.3) blocks `002` final-step commitment
- Concurrency (P2.3) depends on P1.2 real funds
- Dashboard (P3.2) depends on P1.2 + US2

### User Story Dependencies
- US1 → US2 → US3 → US4 → dashboard; concurrency after US1

### Within Each Story
- Tests first (FAIL) → service math → API → schema

### Parallel Opportunities
- US2/US4 tests parallel; all [P] tasks parallel (disjoint files)
- Concurrency (P2.3) can parallel with US4 after US1 foundation

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "Unit test available-funds formula incl. zero-pending path in backend/tests/unit/test_financial.py"
Task: "Integration test manual fund entry → available updates immediately in backend/tests/integration/test_financial.py"

# Launch API/service tasks for User Story 1 together:
Task: "Implement POST /financial/funds (amount + mandatory reason, permission, audit log) — FR-012"
Task: "Wire calculate_available_funds to real current-funds + commitments (FR-001/FR-002)"
```

---

## Implementation Strategy

### MVP First
1. Foundational (P1.2); 2. US1 available funds (real); 3. US2 commitments (idempotent + release); 4. US3 validation; 5. STOP + VALIDATE.

### Incremental Delivery
US1 → US2 → US3 → US4 → concurrency → dashboard.

### Parallel Team Strategy

With multiple developers:

1. Team completes Foundational (P1.2) together
2. Once Foundational is done:
   - Developer A: US1 (available funds) → US3 (validation)
   - Developer B: US2 (commitments) → Concurrency (P2.3)
   - Developer C: US4 (budget warnings) → US5 (dashboard)
3. US3 validation and US2 release API both depend on US1 funds calc

---

## Notes

- Money math lives ONLY in `financial_service.py` — `002` and `001` must call it, never replicate formulas
- Obligations + pending payments return 0 until their modules are built (spec Assumptions) — keep the terms in the formula
- Zero/negative current funds allowed (overdraft); manual adjustment requires Finance Manager+ + mandatory reason
- Do not regress baseline: commitment create/release, budget validation, risk classification already pass