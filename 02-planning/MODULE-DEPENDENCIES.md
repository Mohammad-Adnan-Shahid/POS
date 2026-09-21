# Module Dependencies

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/001-purchase-request, specs/002-approval-workflow, specs/003-financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. Dependency Graph (In-Scope)

Modules must be implemented in strict dependency order. A module cannot begin development until all modules it depends on are stable.

```
Organization / Tenant (1)
        |
        v
Branches (2)
        |
        v
Departments (3)
        |
        v
Users (4)
        |
        v
Roles & Permissions / RBAC (5)
        |
        v
Purchase Requests (8)
        |
        v
Duplicate Detection (9)
        |
        v
Budget Management (10)
        |
        v
Financial Validation (11)
        |
        v
Approval Workflow (12)
        |
        v
Financial Commitments (13)
        |
        v
Purchase Orders (14)  (PR -> PO conversion, P3.1)
        |
        v
Audit Trail (23)   (cross-cutting, implemented from the start)
Notifications & Alerts (24)   (cross-cutting)
Dashboard (26)     (P3.2)
```

> Deferred modules (retained in roadmap): Platform Admin (0), Module Entitlements (5b), Suppliers (6), Supplier History (7), Receiving (15), Invoices (16), Three-Way Matching (17), Liability Management (18), Recurring Liabilities (19), Accounts Payable (20), Payment Management (21), Cash Flow (22), Reports & Analytics (25), SaaS Subscription (27).

---

## 2. Detailed Dependency Explanations

### Organization / Tenant (1) — Foundation

**Depends on:** Nothing

**Why first:** The organization is the top-level isolation boundary. Every other entity in the system belongs to exactly one organization. Without the organization model, no other module can function because every query, transaction, and API call requires tenant context. The organization record establishes the base currency and fiscal year configuration that all downstream modules depend on.

**Blocks:** Everything

---

### Branches (2)

**Depends on:** Organization

**Why:** Branches represent physical or operational locations within an organization. A branch belongs to exactly one organization. Branches are needed before departments can be created (departments belong to branches), and before any transactions can be scoped to a location. Branch status (active/inactive) controls whether new transactions can reference them.

**Blocks:** Departments, Users (branch assignment), all transaction modules (branch scoping)

---

### Departments (3)

**Depends on:** Organization, Branches

**Why:** Departments are functional units within branches. A department belongs to exactly one branch and transitively one organization. Departments are needed for purchase request routing, budget allocation, approval workflow configuration, and transaction attribution.

**Blocks:** Users (department assignment), Purchase Requests, Budgets, Approval Workflows

---

### Users (4)

**Depends on:** Organization, Branches, Departments

**Why:** Users are individuals within an organization, assigned to branches and departments. Users are needed before RBAC can be implemented because roles and permissions are assigned to users. Users are also required as the actors who create and approve transactions. Without users, no workflow can proceed because every action requires an authenticated actor.

**Blocks:** RBAC, all transaction modules (actor attribution)

---

### Roles & Permissions / RBAC (5)

**Depends on:** Organization, Users

**Why:** RBAC defines what actions each user can perform within the organization. RBAC must be implemented before any business module because every module requires permission checks (who can create, approve, view, etc.). The RBAC system also defines approval authority limits (financial amount thresholds per role) which are critical for the approval workflow.

**Blocks:** All business modules (authorization enforcement)

---

### Purchase Requests (8)

**Depends on:** Organization, Branches, Departments, Users, RBAC

**Why:** Purchase requests are the entry point of the procurement lifecycle. A request captures internal purchasing needs and routes them through review and approval. It depends on departments (attribution and budget linking), branches (location scoping), users (requested-by), and RBAC (create/submit permissions).

**Blocks:** Duplicate Detection, Approval Workflow, Financial Validation, Financial Commitments, Purchase Orders

---

### Duplicate Detection (9)

**Depends on:** Purchase Requests

**Why:** Duplicate detection runs at purchase request submission. It must be implemented before the approval workflow because a purchase request must pass duplicate detection before being marked as submitted. The detection algorithm compares against existing requests to prevent redundant transactions.

**Blocks:** Approval Workflow (prerequisite check)

---

### Budget Management (10)

**Depends on:** Organization, Branches, Departments, RBAC

**Why:** Budgets define spending limits per department, branch, category, and time period. Budget validation is a mandatory check before any purchase can be approved. A purchase request must reference a budget category, and the system must verify that the requested amount, combined with existing commitments, does not exceed the allocated budget.

**Blocks:** Financial Validation (budget check component)

---

### Financial Validation (11)

**Depends on:** Budget Management, Financial Commitments (read-only), RBAC

**Why:** Financial validation is the central integration point that aggregates all financial checks before approval. It calculates available funds (current funds minus commitments), budget availability, and existing commitments. It must exist before the approval workflow because approvers must see a financial impact summary before deciding.

**Blocks:** Approval Workflow (financial check component)

---

### Approval Workflow (12)

**Depends on:** Purchase Requests, Duplicate Detection, Financial Validation, RBAC

**Why:** The approval workflow is the decision gate that controls whether a purchase request proceeds to purchase order creation. It depends on duplicate detection (must pass before submission), financial validation (must be computed before approval decision), and RBAC (determines who can approve and within what authority). The workflow routes through configurable steps, enforces authority limits, handles exceptions, and records every decision permanently.

**Blocks:** Financial Commitments, Purchase Orders

---

### Financial Commitments (13)

**Depends on:** Approval Workflow, RBAC

**Why:** A financial commitment is created automatically when a purchase request reaches approved status. It reserves funds against the organization's available balance. The commitment module is the core financial control that prevents over-spending. It depends on the approval workflow because commitments are only created after approval, and on RBAC for manual adjustment permissions. Commitments feed into financial validation, creating a feedback loop: approval creates commitment, commitment affects future approvals.

**Blocks:** Purchase Orders (commitment validation), Financial Validation (commitment query)

---

### Purchase Orders (14) — PR to PO conversion (P3.1)

**Depends on:** Approval Workflow, Financial Commitments

**Why:** Purchase orders formalize the organization's commitment to buy from a supplier based on an approved purchase request. A PO depends on approval (must be approved first) and financial commitment (funds must be reserved). Supplier is referenced as a link field; the full supplier module is deferred.

**Blocks:** None within current scope (receiving/invoices deferred)

---

### Audit Trail (23) — Cross-Cutting

**Depends on:** All modules (cross-cutting concern)

**Why:** The audit trail is an append-only log that records every meaningful financial and procurement action. It is a cross-cutting concern that observes events from all modules. It is implemented from the start because every module needs to log its actions.

**Blocks:** Compliance testing

---

### Notifications & Alerts (24) — Cross-Cutting

**Depends on:** All modules (cross-cutting concern)

**Why:** Notifications inform the right people of required actions and financial risks. They are triggered by state changes across nearly every module. They must be tenant-isolated and respect RBAC routing.

**Blocks:** Dashboard (notification counts)

---

### Dashboard (26) — Consolidation (P3.2)

**Depends on:** Financial Commitments, Budget Management, Purchase Requests, Notifications

**Why:** The dashboard is a real-time composition of data from multiple financial and procurement modules. It displays current funds, available-to-spend, committed funds, total pending approvals, budget utilization, and financial warnings. It depends on the modules that provide these figures.

**Blocks:** None (leaf module)

---

## 3. Implementation Order Summary

| Order | Module | Phase |
|---|---|---|
| 1 | Organization / Tenant | Phase 1 — Foundation |
| 2 | Branches | Phase 1 — Foundation |
| 3 | Departments | Phase 1 — Foundation |
| 4 | Users | Phase 1 — Foundation |
| 5 | Roles & Permissions (RBAC) | Phase 1 — Foundation |
| 8 | Purchase Requests | Phase 1 — Procurement |
| 9 | Duplicate Detection | Phase 1 — Procurement |
| 10 | Budget Management | Phase 1 — Financial Controls |
| 11 | Financial Validation | Phase 1 — Financial Controls |
| 12 | Approval Workflow | Phase 1 — Procurement |
| 13 | Financial Commitments | Phase 1 — Financial Controls |
| 14 | Purchase Orders (conversion) | Phase 1 — Procurement |
| 23 | Audit Trail | Phase 1 — Foundation |
| 24 | Notifications & Alerts | Phase 1 — Cross-Cutting |
| 26 | Dashboard | Phase 2 — Reporting (P3.2) |

---

## 4. Dependency Rules

1. **No module may be developed before its dependencies are stable.** A module at a given position depends on all modules above it.
2. **Financial modules have a strict dependency chain.** Financial validation, commitment, and budget modules must be implemented in order relative to the approval workflow.
3. **Audit trail is a cross-cutting concern** that must be integrated into every module from the beginning.
4. **Notifications are event-driven** and can be added incrementally as modules are developed, but the notification service framework must exist early.
5. **Deferred modules** (suppliers, receiving, invoices, matching, liabilities, AP, payments, cash flow, reports, subscription, platform admin, entitlements) enter the graph only when their phases begin.

---

*This document defines the strict implementation dependency order. No module should be developed out of this order.*