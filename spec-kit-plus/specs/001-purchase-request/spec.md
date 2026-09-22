# Feature Specification: Purchase Request Management

**Feature Branch**: `001-purchase-request`
**Created**: 2026-09-15
**Status**: Draft
**Input**: User description: "Purchase request creation, submission, lifecycle management, and duplicate detection for a multi-tenant SaaS POS procurement system"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Submit Purchase Requests (Priority: P1)

As a department coordinator, I want to create purchase requests with line items, link them to a budget category, and submit them for approval, so that procurement needs are formally documented and routed for review.

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
4. **Given** a PR is "submitted" and non-creator attempts recall, **When** recall is attempted, **Then** 403 Forbidden is returned.
5. **Given** a PR is already "draft", **When** creator attempts recall, **Then** 400 "Already in draft" is returned.
6. **Given** a PR is "submitted" and ApprovalHistory records exist, **When** creator recalls, **Then** recall is blocked — approval already started.

---

### User Story 3 - Duplicate Detection at Submission (Priority: P2)

As a finance manager, I want duplicate PRs detected at submission, so unintentional duplicate spending is prevented.

**Why this priority**: Critical control alongside P1 — prevents accidental double-spending on the same category.

**Independent Test**: Create two PRs in same category with similar totals (within 10%), verify second is flagged.

**Acceptance Scenarios**:

1. **Given** existing PR in same category with total within 10%, **When** new PR submitted, **Then** submission blocked with duplicate details and match scores.
2. **Given** no matching PRs, **When** submitted, **Then** proceeds normally.
3. **Given** duplicate detected, **When** viewing details, **Then** user sees matching PR number, total, and similarity score.

---

### User Story 4 - List and Filter Purchase Requests (Priority: P2)

As a department manager, I want to view all PRs with status filtering, so I can monitor procurement activity.

**Why this priority**: Enables monitoring and oversight; depends on PRs existing (P1).

**Independent Test**: Create PRs in different statuses, verify filtered lists work correctly.

**Acceptance Scenarios**:

1. **Given** multiple PRs exist, **When** viewing list, **Then** all org PRs shown with request number, date, category, total, status.
2. **Given** status filter applied, **When** list loads, **Then** only matching PRs shown.
3. **Given** PRs exist, **When** viewing list, **Then** sorted by creation date (newest first) with pagination.

---

### User Story 5 - Convert Approved PR to Purchase Order (Priority: P3)

As a procurement officer, I want to convert an approved PR into a PO linked to a supplier, so formal procurement begins.

**Why this priority**: Downstream of full approval lifecycle; only valuable once approvals are complete.

**Independent Test**: Approve PR through all steps, create PO, verify linkage.

**Acceptance Scenarios**:

1. **Given** PR is "approved", **When** officer creates PO, **Then** PO created with items copied, linked to PR, assigned to supplier.
2. **Given** PR is not "approved", **When** PO creation attempted, **Then** rejected.
3. **Given** PO created from PR, **When** saved, **Then** PR status changes to "purchase_ordered" and commitment created.

---

### User Story 6 - Edit Draft Purchase Request (Priority: P2)

As a department coordinator, I want to edit my draft PR's header fields and line items, so I can fix mistakes and update requirements before submission.

**Why this priority**: PR banate waqt galti hona common hai. Items add/remove karna zaroori hai. Bina edit ke har baar naya PR banana padega = data pollution.

**Independent Test**: Create draft PR, update header, add/update/delete items, verify totals recalculate correctly.

**Acceptance Scenarios**:

1. **Given** a PR is in "draft", **When** creator updates header fields (category, priority, justification, budget_category, required_by_date), **Then** fields updated and version incremented.
2. **Given** a PR is in "draft", **When** creator adds new item, **Then** item added and PR total recalculated.
3. **Given** a PR is in "draft", **When** creator updates existing item (quantity, unit_price, description), **Then** item updated and PR total recalculated.
4. **Given** a PR is in "draft", **When** creator deletes item, **Then** item removed and PR total recalculated.
5. **Given** a PR is "submitted", **When** anyone attempts edit, **Then** 400 "Only draft requests can be edited".
6. **Given** a PR is in "draft", **When** two users edit simultaneously and second saves, **Then** version conflict error (409).
7. **Given** a PR has 1 item, **When** creator deletes last item, **Then** allowed (but submission will fail — min 1 item validation).
8. **Given** a PR is in "draft", **When** creator updates budget_category_id, **Then** updated and linked to financial validation.

---

### Edge Cases

- PR with zero items: submission rejected (min 1 item).
- Unit price of zero: allowed but flagged as warning.
- Budget category deactivated before approval: validation catches and rejects.
- Two users simultaneously submit same PR: optimistic locking via version field.
- Recall attempted while approval in progress: blocked.
- Recall after partial approval → blocked — ApprovalHistory exists.
- Creator left the company → no one can recall (only creator can).
- PR status changes during recall attempt → reject with current status message.
- Edit submitted PR → 400 "Only draft requests can be edited".
- Concurrent edit → version conflict 409.
- Delete last item → allowed (submission blocks separately).
- Update all fields → version increments correctly.

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
- **FR-008a**: System MUST allow draft PR header updates (category, priority, justification, budget_category, required_by_date).
- **FR-008b**: System MUST allow draft PR item add/update/delete with total recalculation.
- **FR-008c**: System MUST enforce optimistic locking on all draft edits via version field.
- **FR-009**: System MUST log all state transitions with user, timestamp, context.
- **FR-010**: System MUST support filtering PRs by status with pagination.
- **FR-011**: System MUST create financial commitment on full approval.
- **FR-012**: System MUST support converting approved PRs to POs with item carryover.

### Business Rules

- **BR-001 (US2)**: Only the PR creator can recall (not manager, not admin).
- **BR-002 (US2)**: Only "submitted" status PRs can be recalled.
- **BR-003 (US2)**: If ANY ApprovalHistory record exists → block recall.
- **BR-004 (US2)**: Recall logs audit event: "submitted → draft" with timestamp.
- **BR-005 (US2)**: After recall, PR items become editable again.
- **BR-006 (US2)**: Resubmitting after recall starts fresh approval trail.
- **BR-007 (US6)**: Only "draft" status PRs can be edited.
- **BR-008 (US6)**: Only the PR creator can edit.
- **BR-009 (US6)**: Optimistic locking via `version` field — check before write, increment on success.
- **BR-010 (US6)**: Every item change must recalculate `total_price` (qty × unit_price).
- **BR-011 (US6)**: Every item mutation must recalculate PR total (sum of all items).
- **BR-012 (US6)**: Header updates and item updates are separate endpoints.
- **BR-013 (US6)**: Item deletion with zero items allowed (submission will block separately via FR-003).

### Key Entities *(include if feature involves data)*

- **Purchase Request**: request_number, branch, department, category, priority, status, budget_category, justification, preferred_supplier.
- **Purchase Request Item**: description, quantity, unit_price, total_price, notes.
- **Duplicate Detection Log**: entity_pair, match_score, match_reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Create + submit PR with 5 items in under 3 minutes.
- **SC-002**: Duplicate detection catches 95% of unintentional duplicates.
- **SC-003**: PR recall (pre-approval) completes in under 10 seconds with audit trail.
- **SC-004**: 100% of submitted PRs have linked budget category.
- **SC-005**: PR list with filter loads in under 2 seconds (1,000 PRs).
- **SC-006**: Draft PR edit (header + item changes) completes in under 2 seconds.
- **SC-007**: Concurrent edit conflict detected 100% of the time via version field.

## Assumptions

- Multi-tenant SaaS: each organization has isolated data via `organization_id` on all tables.
- Branch/department data exists (managed separately).
- Budget categories/lines managed by financial engine.
- Approval workflows configured separately.
- Supplier data managed by supplier module.
- Single currency (base) for initial implementation.
