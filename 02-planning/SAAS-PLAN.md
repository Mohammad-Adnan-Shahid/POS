# SaaS & Multi-Tenant Planning

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/001-purchase-request, specs/002-approval-workflow, specs/003-financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. Multi-Tenancy Architecture

### Model

Single database, shared schema, with mandatory organization_id column on every business table.

### Tenant Isolation Boundary

The organization is the top-level isolation boundary. Every piece of data in the system belongs to exactly one organization.

### Hierarchy

```
Organization (Tenant)
    |
    v
Branches (physical/operational locations)
    |
    v
Departments (functional units within branches)
    |
    v
Users (individuals with roles and permissions)
    |
    v
Transactions (purchase requests, approvals, commitments, budget lines)
```

### Isolation Rules

An organization must never access, reference, search, aggregate, export, or infer the existence of another organization's:

- Purchase Requests
- Purchase Orders
- Budgets
- Commitments
- Current Funds / Available Funds
- Approval workflows and history
- Duplicate detection records
- Reports and dashboards
- Audit logs
- Employees, Departments, Branches
- Notifications

> Deferred isolation surface (records exist only in future modules): suppliers, invoices, payments, liabilities, accounting records.

### Isolation Enforcement

| Layer | Enforcement |
|---|---|
| Database queries | Mandatory organization_id filter on every query |
| API requests | Tenant context resolved from JWT token |
| Service layer | Tenant ID injected into all service operations |
| Background jobs | Tenant context carried through job execution |
| Reports | All report queries scoped by organization_id |
| Notifications | Notification content tenant-isolated |
| Audit logs | Audit records scoped by organization_id |

---

## 2. Organization Entity

### Required Fields

- Organization ID (tenant key, UUID)
- Legal/trading name
- Industry/type
- Base currency (ISO 4217)
- Fiscal year configuration (start month)
- Status (Active, Trial, Suspended, Expired, Closed)
- Owner/primary contact
- Created date, activation date

### Organization Lifecycle

```
Created (Trial) -> Active -> Suspended -> Expired -> Closed
```

> Deferred: subscription plan reference and plan-driven enforcement (SAAS-PLAN deferred sections).

---

## 3. Branch and Department Model

### Branches

- Belong to exactly one organization
- Support: name, code, status (active/inactive), manager assignment, budget association
- Deactivating a branch must not delete historical transactions
- Deactivation prevents new transactions from being created against the branch

### Departments

- Belong to exactly one branch (and transitively, one organization)
- Support: name, code, status (active/inactive), manager assignment, budget association
- Deactivating a department follows the same rules as branches

---

## 4. User-to-Organization Relationship

- A user account may be linked to multiple organizations (e.g., a consultant serving several tenants)
- Within any given session/context, the user operates strictly within a single active tenant context
- Role and permission assignments are always per organization
- A user's role in Organization A has no bearing on their role or access in Organization B

### Session Isolation

- JWT token contains organization_id claim
- All API requests carry the active organization context
- Switching organizations requires re-authentication or explicit context switch
- Session data is scoped to the active organization

---

## 5. Shared vs. Tenant-Owned Data

### Tenant-Owned Data (Isolated per Organization)

- All business entities (purchase requests, POs, approvals, commitments, budgets, funds)
- All financial records (commitments, budget lines, fund entries)
- All user and role data
- All organization-specific audit logs
- All notifications

### Shared/System Data (Not Tenant-Scoped)

- Permission definitions (codes, entities, actions)
- System configuration templates
- Currency reference data
- Industry/category reference data

### Boundary

Shared data is read-only reference data. It never contains tenant-specific values. Tenant-owned data always carries organization_id.

> Deferred: platform-global data (module catalog, subscription plans, plan-module mappings, platform users, platform audit logs) — outside 3-spec scope (SAAS-PLAN deferred section).

---

## 6. Historical Data Preservation (In-Scope Principles)

### Principles

1. Deactivating a branch or department must not delete historical transactions
2. Financial records are never deleted; only reversed or adjusted
3. Approval history and audit logs remain immutable and retrievable
4. Cancelling a request/PO releases commitments but never deletes transaction history

### Data Retention

- Active data: Full detail in main tables
- Audit logs: Indefinite retention
- Financial records (commitments, fund entries, budget adjustments): Indefinite retention

> Deferred: archival pipeline and subscription-based retention (subscription module not built).

---

## 7. Organization Admin

Organization Admin is a **tenant-level identity** that manages a single organization within the platform.

**Organization Admin Responsibilities:**
1. Manage users (create, edit, deactivate, assign roles)
2. Assign role permissions (including approval amount limits)
3. Manage branches and departments
4. Configure approval workflows (P2.5)
5. Manage organization settings (name, currency, fiscal year)
6. Configure budget lines and financial permissions

**Cannot:**
- Access other organizations
- Manage platform-level entities (deferred until platform layer exists)

---

## 8. Deferred: Subscription, Entitlements, Platform Super Admin (Future Roadmap)

The following SaaS capabilities are **outside the 3-spec scope** and preserved for the future roadmap:

- **Subscription lifecycle** (trial/active/suspended/expired/closed state machine, billing, plan limits)
- **Subscription plans & plan-module mapping** (plan definitions, feature entitlements)
- **Upgrade/downgrade behavior** (freeze over-limit creation, never hide financial data)
- **Module entitlements architecture** (module catalog, per-org module config, entitlement enforcement chain)
- **Platform Super Admin** (cross-tenant management, platform audit logs, analytics)
- **Organization module entitlements / dynamic frontend module visibility** (`GET /organization/modules`)

> Reaffirmed critical principle that carries forward: subscription/billing logic must never compromise financial data integrity — financial records are never deleted, hidden, or corrupted due to billing failure, plan downgrade, or subscription expiry. Any restriction must be a capability restriction, never a data-integrity restriction.

---

*This document defines the SaaS and multi-tenant planning. Implementation will derive the exact configuration and enforcement logic from this plan.*