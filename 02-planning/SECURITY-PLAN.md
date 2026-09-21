# Security Planning

## POS — Multi-Tenant Procurement & Financial Controls (SaaS)

> Scope: specs/001-purchase-request, specs/002-approval-workflow, specs/003-financial-engine. Canonical plan: SOFTWARE-PLANNING.md.

---

## 1. Security Architecture Overview

### Core Principle

**React is never the security boundary.** All critical authorization decisions must be enforced by FastAPI/backend services. The frontend is a presentation layer only.

### Defense in Depth

```
Layer 1: Authentication (JWT)
Layer 2: Tenant Isolation (org_id from JWT)
Layer 3: Subscription Status Check (is plan active?)          [deferred]
Layer 4: Module Entitlement Check (is module enabled for org?) [deferred]
Layer 5: Authorization (RBAC middleware)
Layer 6: Service-level permission checks
Layer 7: Data-access level tenant isolation
Layer 8: Database-level constraints
Layer 9: Audit logging
```

Layers 3–4 are deferred until subscription/billing is built (SAAS-PLAN §5–§7).

---

## 2. Authentication

### Strategy

- JWT (JSON Web Tokens) for stateless token-based authentication
- Access tokens for API requests (short-lived: 15-30 minutes)
- Refresh tokens for obtaining new access tokens (longer-lived: 7-30 days)
- Secure token storage on the client (httpOnly cookie or secure storage)

### Token Contents

```json
{
  "sub": "user_id",
  "org": "organization_id",
  "roles": ["role_id_1", "role_id_2"],
  "exp": timestamp,
  "iat": timestamp
}
```

### Token Validation

Every API request:

1. Extract JWT from Authorization header or cookie
2. Validate signature against known secret
3. Check expiration
4. Extract user_id and organization_id
5. Resolve user status (active/inactive)
6. Inject tenant context into request state

### Password Strategy

- Passwords hashed using bcrypt or argon2
- Minimum password complexity requirements (configurable per organization)
- Password history prevention (no reuse of last N passwords)
- Account lockout after configurable number of failed attempts
- Password reset via email with time-limited token

### Multi-Organization Sessions

- A user may belong to multiple organizations
- JWT token contains the active organization context
- Switching organizations requires explicit context switch
- Each organization context has its own session state

> Deferred: separate Platform Super Admin token type and `/auth/platform-login` (platform layer not in scope).

---

## 3. Authorization

### RBAC Enforcement

See RBAC-PLAN.md for the complete permission catalog.

### Full Authorization Chain

Every API request must pass through the following checks, in order:

```
Step 1: Authenticate (JWT token valid?)
Step 2: Identify Organization / Tenant (org_id from JWT)
Step 3: Tenant Isolation Check (data belongs to this org?)
Step 4: Subscription Status Check (is plan active?)            [deferred]
Step 5: Module Entitlement Check (is module enabled for org?) [deferred]
Step 6: RBAC Permission Check (does user have required permission?)
Step 7: Branch / Department Scope Check (is user scoped to this location?)
Step 8: Approval Authority Check (can user approve this amount?)
Step 9: Business Rule Check (workflow rules, SoD rules)
→ Allow or Deny
```

Steps 4–5 are deferred until subscription/billing is built.

### Enforcement Points

| Layer | Check | Description |
|---|---|---|
| API Middleware | Full chain | Auth → Tenant → RBAC → Scope |
| Service Layer | Business operation | Does the user have authority for this specific operation (amount, scope, SoD)? |
| Repository Layer | Data access | Is the data being accessed within the user's tenant and scope? |

### Backend Authorization Rules

1. Every API endpoint requires authentication (except login)
2. Every protected endpoint checks RBAC permissions
3. Financial operations check authority limits (amount, branch, department)
4. Separation of duties checks occur at the service layer
5. Tenant isolation is enforced at the data-access layer
6. No API endpoint trusts client-side authorization decisions
7. Workflow permission checks are enforced per assigned step role/user (P2.6)

---

## 4. Tenant Isolation

### Database Level

Every business table has organization_id as a mandatory foreign key. Every query includes:

```sql
WHERE organization_id = :current_org_id
```

This filter is applied at the repository/data-access layer and cannot be bypassed.

### API Level

- Tenant context is resolved from the JWT token at request time
- The organization_id is injected into the service context
- No API endpoint accepts organization_id as a user-provided parameter
- Cross-tenant lookups are impossible by design

### Background Jobs

- Every background job carries tenant context
- Jobs are executed per-tenant, never across tenants
- A job processing tenant A's data never accesses tenant B's data

### Notifications

- Notification content is tenant-isolated
- No notification references or leaks another tenant's data

> Deferred: report/export tenant enforcement (full reporting module not in scope; dashboard queries already org-scoped).

---

## 5. API Security

### Rate Limiting

- Per-tenant rate limits to prevent abuse
- Per-user rate limits for authentication endpoints
- Configurable rate limits per endpoint category
- Rate limit headers returned in responses

### Input Validation

- All API inputs validated via Pydantic models
- Type checking, length limits, format validation
- SQL injection protection via ORM parameterized queries
- XSS protection via proper output encoding

### CORS Configuration

- Configurable allowed origins per environment
- Credentials allowed only for known origins
- Methods and headers restricted to necessary set

### Error Handling

- Consistent error response structure
- No sensitive information leaked in error messages (stack traces, SQL queries)
- Authentication errors return generic messages (no user enumeration)
- Validation errors return field-specific messages
- Ordered error reporting for request items (e.g., item-level validation in PR creation)

---

## 6. Sensitive Financial Operations

### Additional Controls

| Operation | Extra Security |
|---|---|
| Budget adjustment | Approval above threshold |
| Commitment manual adjustment/release (P1.4) | Finance Manager+ with mandatory reason, audit |
| Approval exception | Higher authority level required |
| Duplicate override | Override permission with audit trail |
| Current funds entry (P1.2) | Mandatory reason, audit; Finance Manager+ |
| Request cancellation | Mandatory reason, audit |
| PR edit after submission (P2.2) | Reset to draft + invalidated prior approvals, version bump, audit |

> Deferred: payment execution, payment reversal, journal entry, period closing (payment/invoice/accounting modules not in scope).

### Audit Requirements

Every sensitive financial operation must log:

1. User identity
2. Organization context
3. Action performed
4. Entity affected
5. Previous state (if applicable)
6. New state
7. Financial impact snapshot
8. Timestamp
9. IP address

---

## 7. Audit Logging

### Principles

- Append-only: audit entries are never edited or deleted
- Complete: every meaningful financial and procurement action is logged
- Tenant-isolated: audit records scoped by organization_id
- Tamper-evident: no mechanism to modify audit history

### What Is Audited

| Category | Events |
|---|---|
| Authentication | Login, logout, failed login, password change, token refresh |
| Authorization | Permission denied, role change, RBAC configuration change |
| Procurement | Request create, submit, edit-after-submission, recall, approve, reject, hold, resume, cancel |
| Financial | Commitment create/release, budget adjust/transfer, current funds entry |
| Override | Duplicate override, financial exception, SoD exception |
| Configuration | Workflow change, budget adjustment, role change |

### Audit Record Structure

- id (UUID)
- organization_id
- user_id
- action
- entity_type
- entity_id
- previous_value (JSONB)
- new_value (JSONB)
- context
- ip_address
- timestamp

### Retention

Audit logs are retained indefinitely. They are never deleted, even after organization closure.

---

## 8. Session Management

### Token Lifecycle

1. User authenticates -> access token + refresh token issued
2. Access token used for API requests (short-lived)
3. Access token expired -> use refresh token to obtain new pair
4. Refresh token expired -> user must re-authenticate
5. User logout -> both tokens invalidated (if using refresh token revocation)

### Token Revocation

- Refresh tokens can be revoked (on logout, password change, account deactivation)
- Access tokens are stateless and expire naturally
- Compromised tokens: revoke refresh token to force re-authentication

---

## 9. Data Protection

### At Rest

- Sensitive fields (passwords) are hashed, never stored in plain text
- Financial data stored in PostgreSQL with standard encryption
- File uploads stored with access controls (when document features are added)

### In Transit

- All API communication over HTTPS
- No sensitive data in URL parameters
- Secure WebSocket connections if real-time features are used

### Sensitive Data Handling

- Password fields are never returned in API responses
- Financial amounts are transmitted as numbers, not strings

> Deferred: bank account / tax ID handling (supplier & payment modules deferred), document upload security.

---

## 10. Concurrency and Race Conditions

### Financial Operation Safety

- Optimistic locking (version column) prevents lost updates on status transitions and financial records
- SELECT FOR UPDATE on critical financial records during modification (budget lines, commitments, current funds)
- Advisory lock for available-funds calculation across approvals (P1.3, P2.3)
- In-flight approval tracking prevents concurrent fund over-commitment
- Database transactions ensure atomicity of multi-step operations (approval + commitment creation)

### Conflict Resolution

- Version mismatch returns a clear error to the user
- User can retry the operation with fresh data
- No silent conflict resolution; all conflicts are explicit

---

## 11. Security Testing Plan

| Test Category | Description |
|---|---|
| Authentication testing | Token validation, expiry, revocation, brute force protection |
| Authorization testing | Permission bypass attempts, RBAC escalation, workflow step permission checks (P2.6) |
| Tenant isolation testing | Cross-tenant data access attempts |
| SQL injection testing | Parameterized query verification |
| XSS testing | Output encoding verification |
| CSRF testing | Token-based protection verification |
| Rate limiting testing | Threshold enforcement verification |
| Financial integrity testing | Balance enforcement, duplicate prevention, commitment idempotency (P1.3) |
| Concurrency testing | Simultaneous approvals on same request/funds (P2.3) |
| Audit testing | Audit trail completeness and immutability |

> Deferred: module entitlement testing, platform admin testing (platform layer not in scope).

---

*This document defines the security planning. Implementation will derive the exact security controls and configurations from this plan.*