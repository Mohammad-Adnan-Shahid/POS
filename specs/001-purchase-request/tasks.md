# Tasks: Purchase Request Management

**Input**: Design documents from `/specs/001-purchase-request/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — pytest + pytest-asyncio per spec acceptance scenarios.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

> Reference: `02-planning/SPEC-GAPS-PLAN.md` — this file materializes P1.1, P2.1, P2.2, P3.1.
> Existing baseline (already implemented, verified in tests): create PR, submit, duplicate detection, list/filter, cancel.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test harness + code-quality config for this feature

- [ ] T001 Create `backend/tests/conftest.py` with fixtures: test PostgreSQL DB, app client, org/user/coordinator
- [ ] T002 [P] Configure pytest/pytest-asyncio and DB migration runner for tests in `backend/pyproject.toml`
- [ ] T003 [P] Configure ruff + mypy for `backend/app/services/procurement_service.py`, `api/procurement.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data + migration primitives every story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Add `version` CAS helper (compare-and-swap) + optimistic-lock error mapping in `backend/app/models/base.py`
- [ ] T005 [P] Ensure `audit_logs`/`log_action` util usable from procurement service (`backend/app/services/audit_service.py`)
- [ ] T006 Add registration mapping for PR/PO/duplicate models in `backend/app/models/__init__.py`
- [ ] T007 Verify tenant-scope dependency (`app/dependencies.py`) applied to all procurement routes

**Checkpoint**: Foundation ready — user story implementation can begin in parallel

---

## Phase 3: User Story 1 - Create and Submit Purchase Requests (Priority: P1) 🎯 MVP

**Goal**: Draft PR with auto request number + line totals, submit with min-item + budget-category validation.

**Independent Test**: Create PR with 3 items, link budget category, submit → appears in approval queue.

### Tests for User Story 1 ⚠️

> **NOTE: Write these FIRST, ensure they FAIL before implementation**

- [ ] T008 [P] [US1] Contract test for POST /purchase-requests in `backend/tests/contract/test_procurement_api.py`
- [ ] T009 [P] [US1] Integration test: create→submit→routed in `backend/tests/integration/test_pr_lifecycle.py`

### Implementation for User Story 1

- [ ] T010 [P] [US1] Ensure `generate_request_number` returns per-org sequential `PR-000000` with retry in `backend/app/services/procurement_service.py`
- [ ] T011 [P] [US1] Fix/verify item `total_price` + PR total computation in `backend/app/services/procurement_service.py` (FR-002)
- [ ] T012 [US1] P1.1 Implement min-1-item validation in `submit_purchase_request` before duplicate check (`backend/app/services/procurement_service.py`) — FR-003
- [ ] T013 [US1] Add missing item/duplicate warning fields (zero price flagged) to `backend/app/schemas/procurement.py` + service (spec Edge Cases)
- [ ] T014 [US1] Wire financial impact view to financial service in `GET /purchase-requests/{pr_id}/financial-impact` (`backend/app/api/procurement.py`)

**Checkpoint**: US1 functional + testable independently (create, submit, validate MVP).

---

## Phase 4: User Story 2 - Recall Purchase Request to Draft (Priority: P2)

**Goal**: Creator recalls submitted (unprocessed) PR to draft.

**Independent Test**: Submit PR, verify no approvals, recall → draft with editable items.

### Tests for User Story 2 ⚠️

- [ ] T015 [P] [US2] Contract test for POST /purchase-requests/{pr_id}/recall in `backend/tests/contract/test_procurement_api.py`
- [ ] T016 [P] [US2] Integration test submit→recall→resubmit trail in `backend/tests/integration/test_pr_lifecycle.py`

### Implementation for User Story 2

- [ ] T017 [P] [US2] Create `recall_purchase_request` in `backend/app/services/procurement_service.py` (P2.1: status=submitted, creator-only, no approval_history, set draft, audit `submitted → draft`)
- [ ] T018 [US2] Add `POST /{pr_id}/recall` route with permission `purchase_request.recall` in `backend/app/api/procurement.py`
- [ ] T019 [US2] Map 400/403/409 responses (BR-01..BR-06) in route + validation

**Checkpoint**: US1 AND US2 independently functional.

---

## Phase 5: User Story 3 - Duplicate Detection at Submission (Priority: P2)

**Goal**: Same-category ±10% duplicate flagged at submit with match score.

**Independent Test**: Two PRs same category within 10% → second blocked.

### Tests for User Story 3 ⚠️

- [ ] T020 [P] [US3] Contract test for submit duplicate path in `backend/tests/contract/test_procurement_api.py`
- [ ] T021 [P] [US3] Unit test `check_duplicates` thresholds in `backend/tests/unit/test_duplicates.py`

### Implementation for User Story 3

- [ ] T022 [P] [US3] Harden `check_duplicates` to write `duplicate_detection_log` rows (FR-006) in `backend/app/services/procurement_service.py`
- [ ] T023 [US3] Return match details in submit conflict response (US3 #3) in `backend/app/schemas/procurement.py`

**Checkpoint**: US1–US3 independently functional.

---

## Phase 6: User Story 6 - Edit Draft Purchase Request (Priority: P2)

**Goal**: Creator edits draft header + items with optimistic locking + recalculation.

**Independent Test**: Draft → update header, add/update/delete items → totals recalc; concurrent edit → 409.

### Tests for User Story 6 ⚠️

- [ ] T024 [P] [US6] Contract tests for PATCH PR + item CRUD in `backend/tests/contract/test_procurement_api.py`
- [ ] T025 [P] [US6] Integration test concurrent edit → 409 in `backend/tests/integration/test_pr_lifecycle.py`

### Implementation for User Story 6

- [ ] T026 [P] [US6] Implement `update_purchase_request` (header, draft-only, creator) in `backend/app/services/procurement_service.py` — P2.2, FR-008a
- [ ] T027 [P] [US6] Implement item add/update/delete with recompute in `backend/app/services/procurement_service.py` — FR-008b
- [ ] T028 [US6] Apply optimistic locking (version CAS) on all draft mutations — FR-008c, SC-007
- [ ] T029 [US6] Add PATCH PR + item routes in `backend/app/api/procurement.py` with 400/403/409 mapping (BR-01..BR-07)

**Checkpoint**: US1–US3, US6 independently functional.

---

## Phase 7: User Story 4 - List and Filter Purchase Requests (Priority: P2)

**Goal**: Org PR list, status filter, nearest-first pagination.

**Independent Test**: PRs in different statuses → filtered lists correct.

### Tests for User Story 4 ⚠️

- [ ] T030 [P] [US4] API test for status filter + pagination in `backend/tests/integration/test_pr_lifecycle.py`

### Implementation for User Story 4

- [ ] T031 [P] [US4] Add status/branch/department/date-range filters + pagination in `list_purchase_requests` (`backend/app/services/procurement_service.py`) — FR-010, SC-005

**Checkpoint**: US1–US4, US6 functional.

---

## Phase 8: User Story 5 - Convert Approved PR to Purchase Order (Priority: P3)

**Goal**: Approved PR → PO (items copied, supplier linked, commitment created, PR → purchase_ordered).

**Independent Test**: Approve through all steps, create PO, verify linkage + commitment.

### Tests for User Story 5 ⚠️

- [ ] T032 [P] [US5] Contract test POST /purchase-requests/{pr_id}/convert-to-po in `backend/tests/contract/test_procurement_api.py`
- [ ] T033 [P] [US5] Integration test PR→PO→commitment in `backend/tests/integration/test_po_conversion.py`

### Implementation for User Story 5

- [ ] T034 [P] [US5] Implement `convert_to_po` (copy items, link PR + supplier, status → purchase_ordered) in `backend/app/services/procurement_service.py` — P3.1, FR-012
- [ ] T035 [US5] Create commitment via financial service in same transaction (FR-011) — requires `003-financial-engine` idempotency (P1.3)
- [ ] T036 [US5] Add `POST /{pr_id}/convert-to-po` route + schemas (`POCreate`, `POResponse`) in `backend/app/api/procurement.py`

**Checkpoint**: All purchase-request user stories independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Consistency, performance, security

- [ ] T037 [P] Run quickstart validation (see `quickstart.md`)
- [ ] T038 Verify tenant isolation on all new endpoints (automated cross-tenant test)
- [ ] T039 [P] Index check: `(organization_id, status, created_at)` on purchase_requests (SC-005)
- [ ] T040 Performance pass: list <2s @1000 PRs
- [ ] T041 Audit coverage: every transition has `audit_logs` row (FR-009)

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup → Foundational → User stories → Polish
- **US5 (P3)** depends on final approval (approval + financial features) + P1.3 idempotency

### User Story Dependencies

- US1: foundational only
- US2/US3/US4/US6: independently implementable after foundational (may integrate with US1)
- US5: after US1 + final-approval/commitment from other features

### Within Each User Story

- Tests written first (FAIL) → models → services → endpoints
- Commit after each task/logical group; stop at checkpoints to validate independently

---

## Implementation Strategy

### MVP First (US1 only)
1. Phase 1 + 2 complete; 2. US1 (create/submit/validate); 3. **STOP + VALIDATE**; 4. deploy/demo.

### Incremental Delivery
US1 → US2 → US3 → US6 → US4 → US5, each independently tested before the next.

### Parallel Opportunities
- All [P]-marked tasks parallel (different files)
- US2/US3/US4/US6 can start in parallel once foundational completes (staff permitting)
- US5 blocks on financial-engine P1.3 (commitment idempotency)

---

## Notes

- Existing baseline must NOT be regressed: create/submit/duplicate/list already pass
- New endpoints must enforce `organization_id` from JWT (never client-supplied)
- Zero-price items allowed but flagged (spec Edge Cases) — completed in T013
- Version CAS failures → HTTP 409 with message "Version conflict — PR was modified by another user"