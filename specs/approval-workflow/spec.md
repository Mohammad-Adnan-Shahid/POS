# Feature Specification: Approval Workflow Engine

**Feature Branch**: `002-approval-workflow`
**Created**: 2026-09-15
**Status**: Draft
**Input**: User description: "Configurable multi-step approval workflow with SoD, authority limits, and financial validation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Process Approval Decisions (Priority: P1)

As an approver, I want to approve, reject, hold, or approve-with-exception a PR pending my review, so procurement moves through governance.

**Why this priority**: Core action driving the entire approval lifecycle. Delivers minimum viable approval loop.

**Independent Test**: Submit PR, approver at step 1 approves, verify advance to next step or "approved", audit trail recorded.

**Acceptance Scenarios**:

1. **Given** PR is "submitted" and routed to approver's role at step 1, **When** approver approves with comments, **Then** approval recorded with financial snapshot, PR advances (or "approved" if final), audit entry created.
2. **Given** PR pending decision, **When** approver rejects with reason, **Then** status changes to "rejected", logged, creator notified.
3. **Given** PR pending decision, **When** approver places on hold with reason, **Then** status changes to "on_hold", resumable later.
4. **Given** PR at final step with "critical" financial risk, **When** normal approval attempted, **Then** blocked; must use approve_with_exception with mandatory reason.
5. **Given** PR pending and approver is PR creator, **When** approval attempted, **Then** rejected with SoD violation.
6. **Given** PR exceeds approver's step authority limit, **When** approval attempted, **Then** rejected with authority insufficient message.

---

### User Story 2 - Configure Approval Workflows (Priority: P2)

As an org owner, I want to configure workflows with multiple steps, role assignments, amount limits, and matching rules, so each purchase type routes through the right chain.

**Why this priority**: Configurability makes system adaptable. Must come after P1.

**Independent Test**: Create workflow with 3 steps (Coordinator, Manager, Finance), set thresholds, verify routing by amount.

**Acceptance Scenarios**:

1. **Given** owner logged in, **When** creating workflow with name/description, **Then** saved in active status.
2. **Given** workflow exists, **When** adding steps (step_order, role_id, max_amount), **Then** saved and ordered correctly.
3. **Given** workflow exists, **When** adding rules (min/max_amount, category, branch, department), **Then** saved and used for matching.
4. **Given** multiple workflows, **When** PR submitted, **Then** first matching workflow found by rules and routes accordingly.
5. **Given** workflow steps have role assignments, **When** PR submitted, **Then** only users with matching role at current step see it in queue.
6. **Given** step has max_amount, **When** PR exceeds it, **Then** step skipped or escalated to next qualifying step.

---

### User Story 3 - View Approval History and Audit Trail (Priority: P2)

As a finance manager, I want complete approval history for any PR: who approved, when, financial snapshot, exception reasons, for audit compliance.

**Independent Test**: Process multiple steps, verify history shows all decisions with timestamps and financial data.

**Acceptance Scenarios**:

1. **Given** PR through multiple steps, **When** viewing history, **Then** chronological list of decisions with approver, timestamp, step, comments, financial snapshot.
2. **Given** PR approved with exception at final step, **When** viewing history, **Then** exception reason, financial position, and risk level shown.
3. **Given** PR pending approval, **When** viewing history, **Then** completed steps and current pending step shown.

---

### User Story 4 - View Pending Approvals Queue (Priority: P1)

As an approver, I want to see all PRs pending my approval, so I can process my workload efficiently.

**Independent Test**: Multiple PRs at different steps for different roles, verify each approver sees only their relevant PRs.

**Acceptance Scenarios**:

1. **Given** multiple PRs "under_review", **When** approver views queue, **Then** only PRs where their role matches current step shown.
2. **Given** PR pending at step 2 and approver's role matches step 2, **When** viewing queue, **Then** PR appears with request number, total, category, requester.
3. **Given** no PRs match approver's role, **When** viewing queue, **Then** empty queue message shown.

---

### User Story 5 - Resume Held Requests (Priority: P3)

As an approver, I want to resume a held PR after the hold reason is resolved, so procurement continues.

**Independent Test**: Hold a PR, resolve reason, resume back to "under_review".

**Acceptance Scenarios**:

1. **Given** PR is "on_hold", **When** authorized approver resumes, **Then** returns to "under_review" and current step re-evaluated.
2. **Given** PR resumed, **When** financial position changed since hold, **Then** financial validation recalculated at next step.

---

### Edge Cases

- All approvers at a step have same role as creator: SoD blocks all; allow escalation or admin override.
- Workflow has no matching rules: route to default workflow (no rules = match all).
- Step references deleted role: skip step with warning logged.
- Two approvers approve same PR simultaneously: optimistic locking; second gets conflict error.
- Financial position changes between submission and final approval: validation runs at moment of approval.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST route PRs to correct workflow by matching rules (amount, category, branch, department).
- **FR-002**: System MUST enforce SoD: no self-approval.
- **FR-003**: System MUST enforce authority limits per step.
- **FR-004**: System MUST perform live financial validation at final approval step.
- **FR-005**: System MUST block normal approval on "critical" risk; require approve_with_exception.
- **FR-006**: System MUST capture financial snapshot with every decision.
- **FR-007**: System MUST record immutable audit trail (timestamp, approver, action, comments, financial data).
- **FR-008**: System MUST support four actions: approve, reject, hold, approve_with_exception.
- **FR-009**: System MUST allow workflow CRUD: create workflows, add ordered steps, add matching rules.
- **FR-010**: System MUST support role-based and user-specific step assignments.
- **FR-011**: System MUST provide pending queue filtered by role and current step.
- **FR-012**: System MUST allow held requests to resume, re-entering approval flow.
- **FR-013**: System MUST create financial commitment on final approval.
- **FR-014**: System MUST notify PR creator of decisions.

### Key Entities

- **Approval Workflow**: name, description, is_active, organization_id.
- **Approval Workflow Step**: step_order, role_id, user_id, max_amount.
- **Approval Workflow Rule**: min_amount, max_amount, category, branch_id, department_id.
- **Approval History**: entity_type, entity_id, approver_id, action, comments, financial_snapshot, exception_reason.

## Success Criteria *(mandatory)*

- **SC-001**: Approval decisions complete in under 5 seconds including financial validation.
- **SC-002**: 100% of decisions have audit trail with financial snapshot.
- **SC-003**: SoD violations caught 100% of the time.
- **SC-004**: Financial validation reflects real-time position (not cached).
- **SC-005**: Workflow config changes effective immediately for new PRs.
- **SC-006**: Pending queue loads in under 2 seconds (500 pending items).

## Assumptions

- Roles/permissions managed by RBAC module.
- Financial engine provides real-time available funds.
- PR lifecycle handled by purchase-request feature.
- At least one active workflow exists before PRs can be submitted.
- Default workflow (no rules) acts as fallback.
