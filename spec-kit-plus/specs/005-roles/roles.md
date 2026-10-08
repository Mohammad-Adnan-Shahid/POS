# Roles & Assignment Rules: Creating and Approving Purchase Requests

**Feature Branch**: `005-roles`
**Created**: 2026-10-07
**Status**: Draft
**Input**: "Define the roles — the super admin assigns which person can create the purchase request and which person approves it."

## Purpose & Scope

Single source of truth for:

1. Which roles exist in the procurement system and what each may do.
2. How the **super admin** (`org_admin`) assigns **who can create** a purchase request (PR).
3. How the **super admin** assigns **who approves** a PR.

**Out of scope**: purchase execution (converting an approved PR into a Purchase Order — future work, §9), budget/funds administration semantics (owned by `003-financial-engine`), auth flows (owned by `004-auth`), and the approval mechanics themselves (owned by `002-approval-workflow`). This doc only defines *who* holds each power and *how the super admin assigns them*.

---

## 1. Roles

Roles are the `RoleName` union in `frontend/src/types.ts:50`, seeded per user in `frontend/src/mockApi.ts:64`.

| Role | Purpose | Held by (demo seed) |
|---|---|---|
| `org_admin` | **Super admin.** Assigns PR creators and approvers; holds `['*']` (`mockApi.ts:66`) | Demo Admin |
| `dept_coordinator` | Default role for users who raise and submit purchase requests | Coordinator One, Coordinator Two |
| `approver` | Decides on PRs pending at their workflow step | Approver One (Manager), Approver Two (Finance) |
| `finance_manager` | Owns funds, commitments, budgets | Finance Manager |
| `auditor` | Read-only oversight of PRs and audit trail | Auditor |

> **Note on `org_admin` as super admin**: `org_admin` is the assignment authority by virtue of `['*']` (`mockApi.ts:66`, honored by `requirePermission` at `mockApi.ts:265`). No separate `super_admin` role is introduced.

---

## 2. Permission Matrix

Only permission strings that exist in the codebase are listed (verified against `mockApi.ts:64-116` and `hasPermission`/`requirePermission` call sites).

| Permission | org_admin | dept_coordinator | approver | finance_manager | auditor |
|---|:-:|:-:|:-:|:-:|:-:|
| `purchase_request.create` | ✅ (`*`) | ✅ | — | — | — |
| `purchase_request.edit` | ✅ (`*`) | ✅ | — | — | — |
| `purchase_request.submit` | ✅ (`*`) | ✅ | — | — | — |
| `purchase_request.recall` | ✅ (`*`) | ✅ | — | — | — |
| `purchase_request.cancel` | ✅ (`*`) | ✅ | — | — | — |
| `purchase_request.view` | ✅ (`*`) | ✅ | ✅ | ✅ | ✅ |
| `approval.view` | ✅ (`*`) | ✅ | ✅ | ✅ | ✅ |
| `approval.approve` / `reject` / `hold` | ✅ (`*`) | — | ✅ | — | — |
| `approval.approve_with_exception` / `resume` | ✅ (`*`) | — | ✅\* | — | — |
| `approval.configure_workflow` | ✅ (`*`) | — | — | — | — |
| `purchase_order.create` | ✅ (`*`) | ✅ | — | — | — |
| `financial.manage_current_funds` | ✅ (`*`) | — | — | ✅ | — |
| `commitment.adjust` | ✅ (`*`) | — | — | ✅ | — |
| `budget.create` / `adjust` / `transfer` | ✅ (`*`) | — | — | ✅ | — |
| `user.manage` | ✅ (`*`) | — | — | — | — |

\* Granted to Approver Two only (`mockApi.ts:100-101`); in practice this capability is delivered through workflow-step assignment (§4).

> `purchase_order.create` remains seeded to coordinators (`mockApi.ts:74`, `84`) but converting an approved PR to a PO is **not yet an assigned responsibility** — see §9.

---

## 3. Assignment Authority

> **Only the super admin (`org_admin`) may make assignment changes.** Both assignment surfaces require permissions only `org_admin` holds: creation grants need `user.manage` (`AuthContext.tsx:76`), workflow edits need `approval.configure_workflow` (`mockApi.ts:868`, `878`, `894`, `921`). UI note: `ApprovalsWorkflows.tsx:17` gates workflow editing on this permission; read-only otherwise (`ApprovalsWorkflows.tsx:53`).

Two assignments exist:

| Assignment | Answers | Mechanism |
|---|---|---|
| **Creation assignment** (§5) | *"Who may create a purchase request?"* | Super admin grants `purchase_request.create` to a named user |
| **Approval assignment** (§4) | *"Who approves it?"* | Workflow steps — specific user or role |

---

## 4. Assignment 1 — Who Approves a PR

Mechanism: **approval workflows**, per `002-approval-workflow`.

- A workflow is an ordered list of steps. **Each step assigns exactly one of:**
  - a **specific user** (`user_id`) — "this person approves", or
  - a **role** (`role_id`) — "anyone holding this role approves".

  Exactly one of `role_id` / `user_id` per step (`002-approval-workflow/data-model.md:42`; enforced at `mockApi.ts:894-907`). **A specific user wins** when both are somehow present (`mockApi.ts:903-907`).
- Each step carries an optional **`max_amount` authority limit** — a PR exceeding it skips/escalates that step (`002-approval-workflow/research.md:29`).
- A PR is routed to the **first workflow whose matching rules hit** (min/max amount, category, branch, department); **empty rules = default workflow** (`002-approval-workflow/plan.md:10`).
- The demo seeds user-assigned steps: Manager owns step 1 (≤ 500,000), Finance owns step 2 (`mockApi.ts:137-140`).

**Super admin's actions:**

1. Create/activate/deactivate a workflow (requires `approval.configure_workflow`).
2. Add a step: choose *specific person* or *role*, set `max_amount`.
3. Reorder or delete steps (remaining steps re-index, `002-approval-workflow/contracts/api-spec.md:88`).
4. Set matching rules so the right PRs route to the right chain.

After submission, only users whose role/user matches the **current step** see the PR in their queue (`002-approval-workflow/contracts/api-spec.md:18`).

---

## 5. Assignment 2 — Who Can Create a PR

Mechanism: a **per-user creation grant** — the super admin grants or revokes `purchase_request.create` on a **named user**.

- The super admin selects a user and grants `purchase_request.create` — that person may then raise PRs. Revoking removes the ability.
- Gating happens at both layers:
  - **UI**: `PRList.tsx:27` shows **+ New Purchase Request** only when `hasPermission('purchase_request.create')`.
  - **Server**: `mockApi.ts:440` — `requirePermission(user, 'purchase_request.create')`; violation → 403.
- Today the permission is a **static property of the `dept_coordinator` role seed** (`mockApi.ts:68`). Making it an *assignment* means storing the grant per user (§5.1).
- Any active user may be granted creation rights — the role they hold is secondary; `dept_coordinator` remains the conventional home for PR requesters.

**Super admin's actions:**

1. Grant `purchase_request.create` to a named user (requires `user.manage`).
2. Revoke it from a named user.
3. View who currently holds the grant.

### 5.1 Open design decision (ADR candidate)

How the grant is stored:

- **Option A — extend `user.permissions[]`**: write `purchase_request.create` into the user's permission array (the array already exists on `User`, `mockApi.ts:59-61`, and is checked by `hasPermission`, `AuthContext.tsx:59-65`). Minimal change; grant lives and dies with the user record; org-wide only.
- **Option B — `create_grants` table**: a scoped assignment record (user + branch/department). Supports per-branch requester designation; needs a new endpoint + super-admin screen.

Suggested ADR text (not written to a file pending consent):

> **ADR-00X: Creation-grant storage** — Status: Proposed
> Decision: *(Option A or B)*
> Consequences: Option A ships against the existing permission model with no schema change but cannot express per-branch requesters; Option B adds a scoped table and one super-admin screen, matching the multi-branch model implied by `branch_id` on PRs.

---

## 6. Separation of Duties (SoD)

| Rule | Basis |
|---|---|
| **Requester ≠ Approver** — no self-approval at any step | FR-002, enforced `PRDetail.tsx:75` (`canDecide ... && !isCreator`) and `002-approval-workflow/research.md:29` |
| **Authority limit** — approver's PR total ≤ step `max_amount` | `002-approval-workflow/research.md:29` |
| **Only `org_admin` assigns** — no self-service grant or workflow edit | §3 |

Violations surface as typed errors (403/00) and are logged to the audit trail.

---

## 7. Assignment Rules

**Creation grants**

1. **Grant only to active users** — deactivating a user implicitly revokes effective access (`hasPermission` runs against the live `user`, `AuthContext.tsx:59-65`).
2. **Revoke is immediate in intent** — see §8.3: the client holds a permissions snapshot, so a revoke takes effect on the user's next session restore/login.
3. **Everything is audited** — grant/revoke writes an append-only audit event (pattern: `mockApi.ts:706`, viewable at `/audit` per `Layout.tsx:38`).

**Approval assignments**

4. **Designated approver must be active** — steps pointing at a deactivated user/role are skipped with a warning (existing edge-case behavior, `002-approval-workflow/data-model.md:46`).
5. **Reassignment allowed** mid-flight: it affects steps not yet acted on; completed steps are immutable.

**Authority**

6. **Super admin cannot be assigned around** — there is no higher authority; `org_admin` may self-grant creation rights only if SoD in §6 permits (it does — SoD constrains approving, not creating).

---

## 8. Acceptance Checks

**Roles & permissions**

- [ ] Permission matrix in §2 matches the seeded permission arrays exactly (`mockApi.ts:64-116`)
- [ ] `org_admin` retains `['*']` and is the only holder of `user.manage` and `approval.configure_workflow`

**Creation assignment (super admin → creator)**

- [ ] `org_admin` can grant `purchase_request.create` to a specific named user
- [ ] Granted user sees **+ New Purchase Request** on `/purchase-requests` (`PRList.tsx:27`)
- [ ] Granted user can create a PR; server accepts (`mockApi.ts:440`)
- [ ] A user without the grant does **not** see the button, and a direct API call returns 403
- [ ] `org_admin` can revoke the grant; revoked user loses the button and server access
- [ ] Grant/revoke writes an audit event naming actor and target

**Approval assignment (super admin → approver)**

- [ ] `org_admin` can create a workflow and assign a **specific user** to step 1
- [ ] `org_admin` can assign a **role** instead of a user, and exactly-one-of is enforced
- [ ] `org_admin` can set per-step `max_amount` and reorder steps
- [ ] A non-`org_admin` user hitting workflow mutation endpoints gets 403 (no `approval.configure_workflow`)
- [ ] After submission, the PR appears only in the current step's assignee queue

**SoD**

- [ ] Creator of a PR cannot approve it (existing FR-002 — regression)
- [ ] Approver's PR total ≤ step `max_amount` enforced

---

## 9. Future: Purchase Execution (out of scope)

Converting an approved PR into a Purchase Order (`canConvert`, `PRDetail.tsx:73`; guarded by `purchase_order.create`, `mockApi.ts:690`) is **not** an assigned responsibility in this doc. When it becomes one, expect a third assignment ("who executes the purchase") with its own SoD rules (approver ≠ purchaser, requester ≠ purchaser) — drafted material from the earlier revision is available in git history.

---

## Follow-ups & Risks

- **Implementation gap**: §5 requires a grant mechanism (storage decision §5.1) — this doc is the contract, not the implementation.
- **Open decision**: §5.1 Option A vs B needs an ADR before implementation starts.
- **Risk**: §7.2 — revokes are not live for logged-in users; confirm acceptable or add a session refresh (see `auth-context.md` §7.3).
