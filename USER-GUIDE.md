# User Guide — How to Work in the POS Procurement App

This guide explains **how to actually work** in the markup: who does what, in which
order, and what the system validates at each step. It follows the specs in
`spec-kit-plus/specs/` (001 purchase-request, 002 approval-workflow,
003 financial-engine, 004 auth).

> **Login first** — there is no public signup. Use the one-click demo buttons on the
> Login page or the accounts listed in [README.md](./README.md#demo-logins).

---

## 1. Roles — who can do what

| Role | Login | What they do |
|---|---|---|
| **Department Coordinator** | `coord.one@demoorg.com` / `Coord@123` | Creates PRs, edits drafts, submits, recalls and cancels own PRs, converts approved PRs to PO |
| **Approver (Manager)** | `apr.one@demoorg.com` / `Apr@123456` | Approves/rejects/holds PRs at step 1 |
| **Approver (Finance)** | `apr.two@demoorg.com` / `Apr@123456` | Approves at step 2, final approval, approve-with-exception, resume held PRs |
| **Finance Manager** | `fin.one@demoorg.com` / `Fin@123456` | Enters current funds, releases commitments, manages budget lines |
| **Org Admin** | `demo.admin@demoorg.com` / `Secret@123` | Everything (`*` permission) |
| **Auditor** | `aud.one@demoorg.com` / `Aud@123456` | View-only: PRs, approvals, financials, audit log |

Your **sidebar menu** only shows what your role permits. If a page seems missing,
log in with a different role.

---

## 2. The Purchase Request lifecycle

```
             create        submit          approve step 1     approve step 2 (final)
  (none) ──────────► DRAFT ─────────► SUBMITTED ─────────► UNDER_REVIEW ─────────► APPROVED ──► PURCHASE_ORDERED
                        ▲                   │                   │
                        │ recall            │ hold              │ reject
                        │ (creator only,    ▼                   ▼
                        └──────────── ON_HOLD ─────────────► REJECTED / CANCELLED
                          before any approval)      (resume → back to under_review)
```

### 2.1 Create a draft PR (Coordinator)

1. Log in as **Coordinator** → sidebar → **Purchase Requests** → **+ New Purchase Request**.
2. Fill in:
   - **Category** (e.g. *office supplies*), **Priority**, **Required by** date.
   - **Budget category** — pick one; you *can* save without it, but you **cannot submit**
     without it (FR-004).
   - **Justification** — required.
3. Add **line items**: description, quantity, unit price. Line totals and the PR total
   compute automatically (FR-002).
4. Click **Create draft** → you land on the PR detail page with status `draft` and an
   auto-generated number like `PR-000002` (FR-001).

### 2.2 Edit the draft (Coordinator)

On the PR detail page while status is `draft`:

- **Edit draft** → change category / priority / required-by / budget category / justification → **Save header**.
- **Add item** → fill description + qty + unit price → the total recalculates (BR-010/BR-011).
- **Delete** an item — allowed even if it's the last one, but you can't *submit* with 0 items (FR-003).

Only **you** (the creator) can edit, and only while `draft` (BR-007/BR-008). Every save
increments the **version** — if someone else edited meanwhile you'll get a
`409 version conflict` message (BR-009, optimistic locking).

### 2.3 Submit for approval (Coordinator)

On the draft PR page → **Submit for approval**. The mock runs the spec'd checks in order:

| Order | Check | Failure message |
|---|---|---|
| 1 | Only creator can submit (FR-005) | `Only the PR creator can submit` |
| 2 | Version still current (BR-009) | `409 version conflict` — reload the page |
| 3 | ≥ 1 line item (FR-003) | `At least one line item is required` |
| 4 | Budget category linked (FR-004) | `A budget category must be linked before submission` |
| 5 | Duplicate detection (FR-006) | *Duplicate detected* — shows matching PR numbers, totals and match score (same category, total within ±10%) |

On success → status `submitted`, it enters the approval routing, and the audit trail records it.

### 2.4 Recall a submitted PR (Coordinator)

Made a mistake after submitting? On the PR page → **Recall to draft**.

Works only when:
- You are the **creator** (BR-001) — not even an admin can recall,
- Status is still `submitted` — once **any** approval decision exists it's blocked (BR-003),
- After recall, items are editable again; resubmitting starts a **fresh** approval trail (BR-006).

### 2.5 Approve / Reject / Hold (Approvers)

1. Log in as the approver **assigned to the current step**. In the demo seed each step is
   assigned to a named approver: step 1 → `apr.one` (Manager), step 2 → `apr.two` (Finance).
   If you log in as the wrong approver the PR simply won't be in your queue, and the
   decision card is not rendered on the PR page.
2. Sidebar → **Approvals** — the queue only shows PRs waiting at *your* step (US4).
3. Click **Review** → on the PR page, the **Approval Decision** card appears:

| Action | What happens |
|---|---|
| **Approve** | Records decision + financial snapshot; advances to next step, or → `approved` if final |
| **Reject** | PR → `rejected` (with your comments in the history) |
| **Hold** | PR → `on_hold`; resume later |
| **Approve with exception** | Approves while recording a **mandatory exception reason** (FR-005). Available to `apr.two` / Admin at any time — it is *not* restricted to critical-risk PRs. What is critical-only is the *blocking* of plain **Approve** (see below). |

Built-in guardrails you can trigger:
- Try approving a PR **you created** → `Separation of duties: you cannot approve your own request` (FR-002).
- PR total exceeds your **step authority limit** → `AUTHORITY_INSUFFICIENT` (FR-003).
- Final-step PR with **critical** risk (projected position negative, **or** PR total exceeds the
  linked budget line's remaining) → plain approval is blocked and you must use
  *Approve with exception*. At earlier steps critical risk does not block approval.

### 2.6 Resume a held PR (Approver)

On a `on_hold` PR page → **Resume** → back to `under_review`, current step re-evaluated,
financials recalculated (US5).

### 2.7 Convert to Purchase Order (after final approval)

On an `approved` PR → **Convert to PO** → enter a supplier → status becomes
`purchase_ordered`. The commitment already exists (it was created at final approval) and
items stay attached to the PR — conversion is idempotent, so it is never double-counted
(FR-011/FR-012). Needs `purchase_order.create` — Coordinators and the Org Admin have it.

### 2.8 Cancel

On a PR that isn't `cancelled` yet → **Cancel** → enter a reason (mandatory) →
status `cancelled`; any active commitment is fully released automatically.
Needs `purchase_request.cancel` — Coordinators and the Org Admin have it, approvers do not.

---

## 3. Approval workflow configuration (Org owner)

Sidebar → **Workflow Config**. The page is visible to anyone with `approval.view`, but it is
**read-only** unless you hold `approval.configure_workflow` — only the demo Admin does, so
other roles see a "read-only view" notice instead of the edit controls.

- **Create workflow** — e.g. "Urgent Procurement".
- **Add steps** — each step is an ordered approval level, executed in `step_order`. You assign
  it either to a **specific approver** or to **anyone holding a role**, plus an optional
  **max amount** (authority limit). Exactly one of the two assignment kinds is expected per
  step (002 data-model), and the form rejects a step with neither.
- **Add rules** — amount range and optional **category** that decide *which* workflow a
  submitted PR routes to. A workflow with **no rules is the default** that matches everything else.

In the demo seed:
- **Low Value (< 10k)** — rule: 0–10,000 → single step assigned to `apr.one` (Manager).
- **Standard Procurement** — no rules (default fallback) → `apr.one` (≤ 500,000) → `apr.two` (no limit).

---

## 4. Financial operations (Finance Manager)

### 4.1 Enter / update current funds

Sidebar → **Financial Dashboard** → *Enter / update current funds*:

1. Amount + **mandatory reason** (e.g. "Q1 top-up") → **Record funds** (FR-012).
2. Every entry is audit-logged (FR-013) — check the **Audit Log** page.

### 4.2 Read the dashboard

The four stat cards show the spec formula (FR-001):

```
Available = Current Funds − Commitments − Obligations − Pending Payments
```

Card 3 combines **Obligations and Pending Payments** into one card showing `0` — those
modules aren't built yet (spec assumption).
If **Available** goes negative the card turns red and approvals will demand exceptions.

### 4.3 Release commitments

Commitments are created **automatically** when a PR reaches final approval (FR-003) or is
converted to a PO. To release one (e.g. after a partial payment):

1. **Financial Dashboard** → Commitments table → **Release**.
2. Enter amount (partial or full) + **mandatory reason** → confirm.
3. Status moves `active` → `partially_released` → `fully_released`; Available funds increase immediately.

### 4.4 Budgets

Sidebar → **Budgets** — per-category lines with `allocated / used / committed / remaining`
and a warning badge:

| Remaining | Warning |
|---|---|
| < 20% | 🔴 **critical** — over-budget requests escalate approval risk to critical (FR-009) |
| 20–50% | 🟡 **warning** |
| > 50% | 🟢 **safe** |

The badge is **derived from `remaining / allocated` on every read**, so it always agrees with
the numbers next to it (003 US4 / SC-006) — editing or adding lines can't leave a stale badge.

Finance Manager can **add budget lines** (category + allocated amount).

When a Coordinator links a PR to a budget category, the PR detail page shows the
**Financial Impact** card: current funds, commitments, available, **projected position**
after this PR, and the risk badge — the same data approvers see at decision time.

---

## 5. Audit trail (Auditor / everyone)

Sidebar → **Audit Log** — append-only record of:

- `auth.login` / `auth.login_failed` (never records the password, BR-002) / `auth.logout`
- `purchase_request.created / updated / item_added / item_updated / item_deleted / submitted / recalled / cancelled`
- `approval.approve / approve_with_exception / reject / hold / resume` (with step)
- `purchase_order.created`
- `financial.funds_entered / commitment.released / budget.line_created`
- `approval.workflow_created / workflow_step_added / workflow_rule_added`

This is the compliance view (001 FR-009 / 004 FR-011 / 003 FR-013). Auditors see the whole
system but cannot change anything.

---

## 6. End-to-end walkthrough (5 minutes)

1. **Coordinator** (`coord.one`): New PR → category *office supplies*, budget category
   *office supplies — remaining 37,000*, item "Chairs" qty 10 × 5,000 (total 50,000) →
   **Create draft** → **Submit**.
2. **Approver Manager** (`apr.one`): Approvals → Review → **Approve** (step 1) → PR goes `under_review`.
3. **Approver Finance** (`apr.two`): Approvals → Review. ⚠️ The PR total (50,000) **exceeds the
   37,000 remaining** on that budget line, so FR-009 escalates it to **critical** risk and
   plain **Approve** is refused with `Normal approval blocked — must approve with exception`.
   Use **Approve with exception** with a reason (e.g. "urgent, over remaining budget") →
   PR becomes `approved` and a 50,000 commitment appears under Financial Dashboard.
   *Want a clean happy path instead?* Use 3 × 5,000 = 15,000 and plain **Approve** works.
4. **Finance Manager** (`fin.one`): Financial Dashboard → see Available drop by 50,000 →
   **Release** 10,000 ("partial payment") → Available rises back.
5. **Coordinator**: on the approved PR → **Convert to PO** → supplier "Acme Ltd" → `purchase_ordered`.
6. **Auditor** (`aud.one`): Audit Log shows every one of those events with actor + timestamp.

---

## 7. Tips & troubleshooting

| Situation | What to do |
|---|---|
| Menu items missing | Your role lacks the permission — use a different demo account |
| `version conflict` on save | Another session edited the PR; reload the page and redo your change |
| Submit blocked: duplicate | Real spec behavior — change the total (±10% window) or category, or check the listed matching PR |
| Submit blocked: no budget category | Edit draft → pick a budget category → submit |
| Submit blocked by a duplicate you don't recognise | Duplicate detection also matches **draft** and **approved** PRs in the same category — not just submitted ones |
| Approval button missing on a PR you made | SoD (FR-002) — approvals must come from someone else |
| PR not in your Approvals queue | It isn't assigned to your step — check §3, or wait for the previous step |
| `Normal approval blocked — must approve with exception` | Final step + critical risk. Use *Approve with exception* with a reason, or lower the total / pick a budget line with more remaining |
| `AUTHORITY_INSUFFICIENT` | PR exceeds your step's max amount — needs the next step's approver |
| No **Convert to PO** / **Cancel** button | Needs `purchase_order.create` / `purchase_request.cancel` (Coordinator or Admin) |
| Workflow Config is read-only | You need `approval.configure_workflow` — only the demo Admin has it |
| Want a fresh demo state | DevTools → Application → Local Storage → clear `pos-markup-db-v2`, then reload. (`v1` was an earlier seed; it's ignored.) |
| Forgot password flow | Any 6-digit code works in the markup; real OTP email needs the future backend + SMTP |
