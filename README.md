# POS — Multi-Tenant Procurement & Financial Controls (SaaS)

**Status: UI markup only.**

📖 **How to work in the app — step-by-step guide for every role (create PR, approve, financials): [USER-GUIDE.md](./USER-GUIDE.md)** This project is the clickable front-end markup built from the
requirements in [`spec-kit-plus/specs/`](./spec-kit-plus/specs):

| Spec folder | Feature |
|---|---|
| `spec-kit-plus/specs/001-purchase-request/` | Purchase request create/edit/submit/recall, duplicate detection, PO conversion |
| `spec-kit-plus/specs/002-approval-workflow/` | Multi-step approvals: queue, decisions (approve/reject/hold/exception), workflow config |
| `spec-kit-plus/specs/003-financial-engine/` | Available funds, commitments, budgets, risk levels, financial dashboard |
| `spec-kit-plus/specs/004-auth/` | Login, forgot/reset password, route guards, RBAC (no public signup) |

There is **no backend yet** — the API is mocked in the browser
(`frontend/src/mockApi.ts`) using the field names from each feature's
`contracts/api-spec.md`. The mock implements the spec's business rules so the flows
actually demonstrate the intended behavior (SoD, authority limits, duplicate
detection, optimistic locking, risk escalation, audit logging). All data is stored in
`localStorage` and resets when you clear site data.

> Per `004-auth/quickstart.md` there is **no public signup** — users come from the
> seeded demo accounts (first org would be created by a bootstrap CLI in the real backend).

---

## Run it

Requires **Node.js 18+**.

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**.

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload (port 3000) |
| `npm run build` | Typecheck (`tsc --noEmit`) + production build to `dist/` |
| `npm run preview` | Serve the production build locally |

---

## Demo logins

The Login page has one-click fill buttons for each role:

| Role | Email | Password |
|---|---|---|
| Org Admin (`*` all permissions) | `demo.admin@demoorg.com` | `Secret@123` |
| Dept Coordinator (creates/edits/submits PRs) | `coord.one@demoorg.com` | `Coord@123` |
| Dept Coordinator #2 | `coord.two@demoorg.com` | `Coord@123` |
| Approver — Manager (step 1) | `apr.one@demoorg.com` | `Apr@123456` |
| Approver — Finance (step 2 + exception) | `apr.two@demoorg.com` | `Apr@123456` |
| Finance Manager (funds, commitments, budgets) | `fin.one@demoorg.com` | `Fin@123456` |
| Auditor (read-only) | `aud.one@demoorg.com` | `Aud@123456` |

**Tip — to see the full flow, use three browser tabs:**
1. Tab 1: `coord.one` → create a PR → submit.
2. Tab 2: `apr.one` → Approvals → review → approve (step 1).
3. Tab 3: `apr.two` → Approvals → review → approve at step 2 → commitment appears in
   Financial Dashboard. (If the total exceeds the linked budget line's remaining, step 2 is
   "critical" risk, so plain Approve is refused — use *Approve with exception* with a reason.)

---

## What each page demonstrates (spec traceability)

### Auth (004-auth)
- **`/login`** — US2: 401 `INVALID_CREDENTIALS` on bad credentials; audit `auth.login`.
- **`/forgot-password`, `/reset-password`** — OTP → reset-token → password policy
  (≥8 chars, letter + digit + special char; markup accepts any 6-digit code).
- **Route guard** — all pages behind Bearer-token check; org resolved from the
  session, never from client input (FR-009/FR-010). Navigation is permission-filtered.

### Purchase Requests (001-purchase-request)

A purchase request (PR) is the document a department fills out to ask for a purchase.
It starts as a **draft**, goes through **approval**, and once approved can be turned
into a purchase order.

Status flow: `draft → submitted → under_review / on_hold → approved → purchase_ordered`,
plus `rejected` and `cancelled`.

- **`/purchase-requests` (list)** — shows every request in the org, newest first, 10 per
  page, with a status dropdown (all 8 statuses). The "+ New Purchase Request" button only
  appears for users with the create permission; clicking a row opens that request.

- **`/purchase-requests/new` (create)** — a single form with two parts:
  *Details* (category, priority low/normal/urgent, required-by date, budget category
  picker that shows each line's remaining amount, and a justification) and *Line items*
  (description, quantity, unit price → line total computed for you, add/remove rows,
  live PR total at the bottom). Justification and required-by date are required to save.
  Clicking "Create draft" saves it with an auto-generated number (`PR-` + a zero-padded
  counter, e.g. `PR-000001`) and opens it. Branch and department are fixed demo values on
  this screen.

- **`/purchase-requests/:id` (detail)** — the whole life of one request:
  - **Header + line items** with totals; items at price 0 get a "zero price" badge.
  - **Edit draft** — creator only, and only while in draft: change header fields, add or
    delete line items. Every save bumps the version shown in the header, so two people
    editing the same draft can't silently overwrite each other.
  - **Submit** — refused with an inline warning if there's no budget category linked
    (FR-004) or no line items (FR-003). On submit, duplicate detection (FR-006) compares
    the request against similar ones in the same category within 10%; if it matches you
    get a 409 with a list of the matching request numbers, totals and match score %,
    shown as a warning banner — there is no "submit anyway", so you have to change the
    request (its total or category) until the overlap disappears.
  - **Recall to draft** — only the creator, only from `submitted`, and blocked if any
    approval decision already exists; putting it back in draft makes items editable again.
  - **Cancel** — anyone with cancel permission, requires a reason (blank is rejected) and
    releases any commitment the request had created.
  - **Convert to PO** — enabled only when the request is `approved`; asks for a supplier
    and is idempotent (running it twice doesn't double-count anything).
  - **Financial Impact card** — current funds, commitments, available, projected position
    after this PR (highlighted red if negative), the resulting risk level, and a budget
    check flagging "over budget".
  - **Approval Decision card** — shown only to a different user who holds approval rights
    and only while the request is `submitted`, `under_review` or `on_hold`: Approve,
    Reject, Hold, Resume (from hold), and *Approve with exception* whose reason is
    mandatory (FR-005). Self-approval is never offered.
  - **Approval History timeline** — every decision with approver, step, comment, exception
    reason, and the financial snapshot (available / projected / risk) captured at the
    moment of that decision.

### Approvals (002-approval-workflow)
- **`/approvals`** — US4: queue shows only PRs assigned to the current step (each step is assigned
  to a specific approver *or* to a role; the demo seed assigns step 1 → `apr.one`, step 2 → `apr.two`).
- **`/purchase-requests/:id`** (decision card) — US1: approve/reject/hold/approve-with-exception;
  **SoD blocks self-approval** (FR-002); **authority limits** (FR-003); **critical risk blocks
  normal approval** and requires an exception reason (FR-005); every decision stores a
  financial snapshot (FR-006) in the history timeline (FR-007).
- **`/approvals/workflows`** — US2: ordered steps with max-amount authority, assigned to a
  specific approver or a role, + matching rules (amount range and optional category);
  workflow with no rules = default fallback.

### Financial (003-financial-engine)
- **`/financial`** — US1/US5: `Available = Current − Commitments − Obligations − Pending`
  (obligations/pending return 0 until those modules exist); funds entry with **mandatory
  reason** (FR-012); commitment list with partial/full release (FR-004).
- **`/financial/budgets`** — US4: allocated/used/committed/remaining with warning levels
  (critical <20%, warning 20–50%, safe >50%), derived from `remaining / allocated` on every read
  so badges can't go stale; over-budget PRs escalate to critical (FR-009).

### Governance
- **`/audit`** — append-only audit trail of auth, PR (including every line-item add/edit/delete),
  approval, purchase-order and financial events (001 FR-009 / 004 FR-011 / 003 FR-013).
  Failed logins are audited without the password.

---

## Project structure

```
pos/
├── README.md                  ← this file
├── opencode.md                # SDD agent instructions
├── .opencode/command/         # /sp.* slash commands
├── frontend/                  # the markup (this app)
│   └── src/
│       ├── mockApi.ts         # in-browser mock of the spec'd REST API + business rules
│       ├── types.ts           # field names mirror specs/*/contracts/api-spec.md
│       ├── auth/AuthContext.tsx
│       ├── components/Layout.tsx
│       └── pages/
│           ├── auth/            # Login, ForgotPassword, ResetPassword (004)
│           ├── purchase-requests/ # PRList, PRCreate, PRDetail (001)
│           ├── approvals/         # ApprovalsQueue, ApprovalsWorkflows (002)
│           ├── financial/         # FinancialDashboard, FinancialBudgets (003)
│           ├── Dashboard.tsx
│           └── AuditLog.tsx
└── spec-kit-plus/specs/       # requirements (source of truth — do not edit code from here)
```

## Next steps (real implementation)

1. Backend per `spec-kit-plus/specs/*/plan.md` (FastAPI + PostgreSQL, tenant-scoped by JWT).
2. Swap `mockApi.ts` for a real API client (endpoints already match `contracts/api-spec.md`).
3. Wire SMTP for real OTP emails; first org via `python -m app.bootstrap` CLI.
