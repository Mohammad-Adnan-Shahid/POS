# Tasks: Approval Workflow Engine

**Input**: Design documents from `/specs/002-approval-workflow/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — pytest + pytest-asyncio.

**Organization**: Tasks grouped by user story.

> Reference: `02-planning/SPEC-GAPS-PLAN.md` — materializes P2.4, P2.5, P2.6, P3.3.
> Baseline already implemented (verified): workflow matching + routing, 4 actions, SoD, authority, history read.

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Add `test_approval.py` fixtures (org owner, approvers, workflows) to `backend/tests/conftest.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work until complete

- [ ] T002 Add `resume` to approval action enum in `backend/app/models/approval.py` / DDL
- [ ] T003 Ensure decision events published on `backend/app/events/bus.py` (topic `approval.decision`)
- [ ] T004 Confirm `RBACService.check_permission` helper available for `approval.configure_workflow` and action permissions

**Checkpoint**: Foundation ready.

---

## Phase 3: User Story 4 - View Pending Approvals Queue (Priority: P1) 🎯 MVP

**Goal**: Role/step-filtered pending queue.

**Independent Test**: PRs at different roles → each approver sees only theirs.

### Tests ⚠️
- [ ] T005 [P] [US4] Integration test queue filtering in `backend/tests/integration/test_approval.py`

### Implementation
- [ ] T006 [P] [US4] Harden `get_pending_approvals` to filter by current-step role/user + org (`backend/app/services/approval_service.py`) — FR-011
- [ ] T007 [US4] Return request_number/total/category/requester/current_step in queue response (`backend/app/schemas/approval.py`)

**Checkpoint**: US4 functional (queue MVP).

---

## Phase 4: User Story 1 - Process Approval Decisions (Priority: P1)

**Goal**: Approve/reject/hold/exception with SoD, authority, live financial validation at final step.

**Independent Test**: Approve at step 1 → advance; final step critical → blocked normal, exception proceeds.

### Tests ⚠️
- [ ] T008 [P] [US1] Contract tests for 4 action endpoints in `backend/tests/contract/test_approval_api.py`
- [ ] T009 [P] [US1] Integration test final-step critical → 403 → exception → approved in `backend/tests/integration/test_approval.py`

### Implementation
- [ ] T010 [P] [US1] Verify SoD + authority checks in `process_approval` (`backend/app/services/approval_service.py`) — FR-002/FR-003
- [ ] T011 [US1] Wire live financial validation at final step via financial service — FR-004/FR-005, SC-004
- [ ] T012 [US1] Capture + persist `financial_snapshot` on every decision — FR-006
- [ ] T013 [US1] Create financial commitment on final approval in same tx (via `003-financial-engine` create_commitment, idempotent) — FR-013 (depends on P1.3)

**Checkpoint**: US1 + US4 functional.

---

## Phase 5: User Story 2 - Configure Approval Workflows (Priority: P2)

**Goal**: Workflow CRUD (create + update/delete = P2.5), steps, rules; permission-gated (P2.6).

**Independent Test**: Create 3-step workflow w/ thresholds → routing by amount.

### Tests ⚠️
- [ ] T014 [P] [US2] Contract tests workflow/step/rule CRUD in `backend/tests/contract/test_approval_api.py`
- [ ] T015 [P] [US2] Integration test P2.6: user without `approval.configure_workflow` → 403
- [ ] T016 [P] [US2] Integration test deactivate workflow with `under_review` PRs → 400 (P2.5)

### Implementation
- [ ] T017 [P] [US2] Implement `update_workflow` / soft `delete_workflow` (is_active=false; block if under_review PRs) in `backend/app/services/approval_service.py` — P2.5, FR-009
- [ ] T018 [P] [US2] Implement step update/delete with re-index (`step_order`) in `backend/app/services/approval_service.py`
- [ ] T019 [P] [US2] Implement rule update/delete in `backend/app/services/approval_service.py`
- [ ] T020 [US2] Add PUT/DELETE workflow, step, rule routes in `backend/app/api/approval.py`
- [ ] T021 [US2] Add `RBACService.check_permission("approval.configure_workflow")` on all workflow mutation routes — P2.6
- [ ] T022 [US2] Add `WorkflowUpdate`, `WorkflowStepUpdate`, `WorkflowRuleUpdate` schemas in `backend/app/schemas/approval.py`

**Checkpoint**: US1, US2, US4 functional.

---

## Phase 6: User Story 3 - View Approval History and Audit Trail (Priority: P2)

**Goal**: Immutable chronological history with snapshots + exception detail.

**Independent Test**: Process steps → complete history shown.

### Tests ⚠️
- [ ] T023 [P] [US3] Integration test history completeness + exception detail in `backend/tests/integration/test_approval.py`

### Implementation
- [ ] T024 [P] [US3] Ensure `get_approval_history` returns snapshot, exception_reason, risk_level (`backend/app/services/approval_service.py`) — FR-007, US3
- [ ] T025 [US3] Surface current pending step alongside completed steps in response schema

**Checkpoint**: US1–US4 functional.

---

## Phase 7: User Story 5 - Resume Held Requests (Priority: P3 → P2 gap)

**Goal**: Resume `on_hold` → `under_review` with step re-evaluation + re-validation.

**Independent Test**: Hold → resolve → resume → under_review.

### Tests ⚠️
- [ ] T026 [P] [US5] Contract test POST .../resume in `backend/tests/contract/test_approval_api.py`
- [ ] T027 [P] [US5] Integration test resume with changed financials → revalidation in `backend/tests/integration/test_approval.py`

### Implementation
- [ ] T028 [P] [US5] Implement `resume_approval` (status on_hold → under_review, re-evaluate step, revalidate) in `backend/app/services/approval_service.py` — P2.4, FR-012
- [ ] T029 [US5] Add `POST /approvals/{entity_type}/{entity_id}/resume` route + permission `approval.resume` in `backend/app/api/approval.py`

**Checkpoint**: US1–US5 functional.

---

## Phase 8: Notifications on Decisions (P3.3) — cross-cutting (FR-014)

**Goal**: Creator gets in-app notification on approve/reject/hold/exception.

### Tests ⚠️
- [ ] T030 [P] [FR] Unit test notification_service in `backend/tests/unit/test_notifications.py`
- [ ] T031 [P] [FR] Integration test approve PR → creator has notification in `backend/tests/integration/test_approval.py`

### Implementation
- [ ] T032 [P] [FR] Create `backend/app/services/notification_service.py` + `Notification` model + migration (`notifications` table)
- [ ] T033 [FR] Subscribe decision events (`events/bus.py`) → create in-app notification for PR creator

**Checkpoint**: All approval stories + notifications functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Run quickstart validation (see `quickstart.md`)
- [ ] T035 Verify tenant isolation on workflows/rules/steps/history/notifications (automated)
- [ ] T036 Index check: approval_history `(org, entity_type, entity_id)`; partial exception index
- [ ] T037 Performance: decisions <5s incl. financial validation (SC-001); queue <2s @500 (SC-006)
- [ ] T038 Audit coverage: every action → audit_logs + approval_history (SC-002)

---

## Dependencies & Execution Order

### Phase Dependencies
- US5 (P2.4) + financial revalidation depends on `003-financial-engine`
- US1 final-step commitment (T013) depends on commitment idempotency (financial P1.3)
- Notifications (P3.3) standalone after decision events exist (T003)

### User Story Dependencies
- US1 & US4: foundational only; US2/US3 independent after US1
- US5 after US1; notifications after US1

### Within Each Story
- Tests first (FAIL) → service → route → schema

---

## Implementation Strategy

### MVP First
1. Foundational; 2. US4 queue; 3. US1 decisions (approve/reject/hold/exception + validation); 4. STOP + VALIDATE.

### Incremental Delivery
US4 → US1 → US2 (config) → US3 (history) → US5 (resume) → notifications.

### Parallel Opportunities
- US2/US3/US5 after US1 foundation (staff permitting)
- All [P] tasks parallel (disjoint files)

---

## Notes

- Do not regress baseline: routing, 4 actions, SoD, authority, history already pass
- All workflow mutation endpoints permission-gated (P2.6) — no org member may configure workflows
- Soft-delete only for workflows; approval_history rows never updated/deleted
- Financial validation MUST be live (SC-004) — no cached position