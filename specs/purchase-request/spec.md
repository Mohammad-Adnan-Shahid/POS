# Feature Specification: Purchase Request Management

**Feature Branch**: `001-purchase-request`
**Created**: 2026-09-15
**Status**: Draft
**Input**: User description: "Purchase request creation, submission, lifecycle management, and duplicate detection for a gym procurement system"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Submit Purchase Requests (Priority: P1)

As a gym department coordinator, I want to create purchase requests with line items, link them to a budget category, and submit them for approval, so that procurement needs are formally documented and routed for review.

**Why this priority**: Foundational entry point for all procurement activity. Delivers viable MVP for tracking procurement intent.

**Independent Test**: Create a PR with 3 items, link budget category, submit, verify it appears in approval queue with correct totals.

**Acceptance Scenarios**:

1. **Given** a coordinator is logged in, **When** they create a PR with branch, department, category, priority, and 2+ items, **Then** a PR is saved in draft status with auto-generated request number (PR-000001) and computed line totals.
2. **Given** a PR is in draft, **When** the creator submits it, **Then** status changes to "submitted" and it appears in approval queue.
3. **Given** a PR is in draft, **When** submitted without a linked budget category, **Then** submission is rejected.
4. **Given** a PR is in draft, **When** a non-creator attempts to submit, **Then** submission is rejected.
5. **Given** a PR is submitted, **When** viewed, **Then** total = sum of (quantity x unit price) for all items.
6. **Given** the user is on PR detail, **When** viewing financial impact, **Then** they see current funds, commitments, obligations, pending payments, and projected position.

---

### User Story 2 - Recall Purchase Request to Draft (Priority: P2)

As a coordinator who submitted a PR, I want to recall it to draft before any approval step, so I can correct errors without creating a new request.

**Why this priority**: Prevents duplicate PRs from mistakes. Must come after P1.

**Independent Test**: Submit a PR, verify no approval processed, recall, confirm it returns to draft with items editable.

**Acceptance Scenarios**:

1. **Given** a PR is "submitted" and no approvals processed, **When** creator recalls, **Then** status returns to "draft" and items are editable.
2. **Given** a PR is "under_review", **When** anyone recalls, **Then** recall is rejected.
3. **Given** a PR is recalled, **When** resubmitted, **Then** it re-enters approval with fresh audit trail.

---

### User Story 3 - Duplicate Detection at Submission (Priority: P2)

As a finance manager, I want duplicate PRs detected at submission, so unintentional duplicate spending is prevented.

**Why this priority**: Critical control alongside P1.

**Independent Test**: Create two PRs in same category with similar totals (within 10%), verify second is flagged.

**Acceptance Scenarios**:

1. **Given** existing PR in same category with total within 10%, **When** new PR submitted, **Then** submission blocked with duplicate details and match scores.
2. **Given** no matching PRs, **When** submitted, **Then** proceeds normally.
3. **Given** duplicate detected, **When** viewing details, **Then** user sees matching PR number, total, and similarity score.

---

### User Story 4 - List and Filter Purchase Requests (Priority: P2)

As a department manager, I want to view all PRs with status filtering, so I can monitor procurement activity.

**Independent Test**: Create PRs in different statuses, verify filtered lists work correctly.

**Acceptance Scenarios**:

1. **Given** multiple PRs exist, **When** viewing list, **Then** all org PRs shown with request number, date, category, total, status.
2. **Given** status filter applied, **When** list loads, **Then** only matching PRs shown.
3. **Given** PRs exist, **When** viewing list, **Then** sorted by creation date (newest first) with pagination.

---

### User Story 5 - Convert Approved PR to Purchase Order (Priority: P3)

As a procurement officer, I want to convert an approved PR into a PO linked to a supplier, so formal procurement begins.

**Independent Test**: Approve PR through all steps, create PO, verify linkage.

**Acceptance Scenarios**:

1. **Given** PR is "approved", **When** officer creates PO, **Then** PO created with items copied, linked to PR, assigned to supplier.
2. **Given** PR is not "approved", **When** PO creation attempted, **Then** rejected.
3. **Given** PO created from PR, **When** saved, **Then** PR status changes to "purchase_ordered" and commitment created.

---

### Edge Cases

- PR with zero items: submission rejected (min 1 item).
- Unit price of zero: allowed but flagged as warning.
- Budget category deactivated before approval: validation catches and rejects.
- Two users simultaneously submit same PR: optimistic locking via version field.
- Recall attempted while approval in progress: blocked.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST auto-generate sequential request numbers per org (PR-000001).
- **FR-002**: System MUST compute line totals (qty x unit price) and PR total (sum of lines).
- **FR-003**: System MUST require at least 1 line item before submission.
- **FR-004**: System MUST require linked budget category before submission.
- **FR-005**: System MUST restrict submission to PR creator only.
- **FR-006**: System MUST block submission on duplicate detection (same category, amount within 10%).
- **FR-007**: System MUST allow recall to draft only when "submitted" and no approvals processed.
- **FR-008**: System MUST prevent item editing after submission (except via recall).
- **FR-009**: System MUST log all state transitions with user, timestamp, context.
- **FR-010**: System MUST support filtering PRs by status with pagination.
- **FR-011**: System MUST create financial commitment on full approval.
- **FR-012**: System MUST support converting approved PRs to POs with item carryover.

### Key Entities

- **Purchase Request**: request_number, branch, department, category, priority, status, budget_category, justification, preferred_supplier.
- **Purchase Request Item**: description, quantity, unit_price, total_price, notes.
- **Duplicate Detection Log**: entity_pair, match_score, match_reason.

## Success Criteria *(mandatory)*

- **SC-001**: Create + submit PR with 5 items in under 3 minutes.
- **SC-002**: Duplicate detection catches 95% of unintentional duplicates.
- **SC-003**: PR recall (pre-approval) completes in under 10 seconds with audit trail.
- **SC-004**: 100% of submitted PRs have linked budget category.
- **SC-005**: PR list with filter loads in under 2 seconds (1,000 PRs).

## Assumptions

- Branch/department data exists (managed separately).
- Budget categories/lines managed by financial engine.
- Approval workflows configured separately.
- Supplier data managed by supplier module.
- Single currency (base) for initial implementation.
