# Feature Specification: Authentication & Signup

**Feature Branch**: `004-auth`
**Created**: 2026-09-23
**Status**: Draft
**Input**: User description: "Org + admin signup, email/password login, JWT multi-tenant auth for POS procurement SaaS"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organization Signup with Admin (Priority: P1)

As a new organization administrator, I want to sign up with my organization name and admin credentials so that my tenant is provisioned and I can start using the platform.

**Why this priority**: Entry point for every tenant. Without org creation no other feature can operate under tenant isolation.

**Independent Test**: POST signup with org name + admin details → org, admin user, and role seed created; auto-login returns JWT with org claim.

**Acceptance Scenarios**:

1. **Given** no organization exists with that admin email, **When** user signs up with org_name, name, email, password, **Then** organization + admin user + seeded roles are created and 201 with tokens returned.
2. **Given** an email already exists globally, **When** signup is attempted with same email, **Then** 409 EMAIL_ALREADY_EXISTS is returned.
3. **Given** password does not meet policy, **When** signup is attempted, **Then** 422 validation error is returned.
4. **Given** signup succeeds, **When** JWT is decoded, **Then** it contains sub (user id) and org_id claims; org_id came from server-side creation only.

---

### User Story 2 - Login (Priority: P1)

As a registered user, I want to log in with email and password so that I receive a JWT to access protected routes.

**Why this priority**: Required for every session and every API call in the product.

**Independent Test**: Login with valid credentials returns access + refresh tokens and user/org payload; wrong password returns 401.

**Acceptance Scenarios**:

1. **Given** a valid active user, **When** they login with correct email/password, **Then** 200 with access_token, refresh_token, user, org.
2. **Given** wrong password, **When** login attempted, **Then** 401 INVALID_CREDENTIALS (no user-enumeration detail).
3. **Given** unknown email, **When** login attempted, **Then** 401 INVALID_CREDENTIALS (same message as wrong password).
4. **Given** inactive or soft-deleted user, **When** login attempted, **Then** 401.
5. **Given** valid login, **When** audit log written, **Then** login event recorded with organization_id and actor.

---

### User Story 3 - Logout / Refresh (Priority: P2)

As a logged-in user, I want to logout (revoke refresh token) and refresh my access token so sessions are secure.

**Why this priority**: Security lifecycle; depends on login (US2).

**Independent Test**: Refresh with valid token issues new access; logout revokes refresh so subsequent refresh fails 401.

**Acceptance Scenarios**:

1. **Given** a valid refresh token, **When** POST /auth/refresh, **Then** new access token (and rotated refresh) issued.
2. **Given** a revoked refresh token, **When** refresh attempted, **Then** 401.
3. **Given** a logged-in user, **When** POST /auth/logout, **Then** refresh token revoked, 204 returned, audit event logged.

---

### User Story 4 - Protected Route Guard (Priority: P2)

As an API consumer, I want protected endpoints to require a valid JWT so tenant data stays isolated.

**Why this priority**: Foundation for all feature APIs (001/002/003 assume Bearer JWT).

**Independent Test**: Request without token → 401; expired token → 401; valid token → org resolved from token, never from body.

**Acceptance Scenarios**:

1. **Given** no Authorization header, **When** protected endpoint called, **Then** 401.
2. **Given** expired/invalid token, **When** protected endpoint called, **Then** 401.
3. **Given** valid token, **When** GET /auth/me, **Then** current user, organization, and role permissions returned.
4. **Given** client supplies organization_id in body, **When** server processes, **Then** server ignores it and uses JWT org claim.

---

### User Story 5 - Add User by Admin (Priority: P3)

As an org admin, I want to create additional users with a role so my team can log in.

**Why this priority**: Team onboarding after admin signup; not needed for MVP demo.

**Independent Test**: Admin creates user → that user can login; non-admin gets 403.

**Acceptance Scenarios**:

1. **Given** an org admin, **When** they create a user with role, **Then** user created in same organization_id and can login.
2. **Given** a non-admin user, **When** they attempt create user, **Then** 403.
3. **Given** admin of org A, **When** they attempt to target org B, **Then** ignored/rejected — org always from JWT.

---

### Edge Cases

- Duplicate email across orgs → 409 (emails are global login keys).
- Signup with weak password (min 8 chars, letter+number+special char) → 422.
- Login for soft-deleted/inactive user → 401.
- Refresh token reuse after rotation → old token revoked (reuse detection → revoke family).
- Expired access token on protected route → 401 with TOKEN_EXPIRED.
- JWT signed with wrong secret → 401.
- Concurrent logins → multiple refresh tokens allowed per user (logout revokes one).
- Password never returned in any response; hash only stored.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create organization + admin user + seeded roles atomically on signup.
- **FR-002**: System MUST hash passwords with bcrypt (or argon2); never store/return plaintext.
- **FR-003**: System MUST issue JWT access tokens containing `sub` and `org_id` claims; org_id resolved server-side only.
- **FR-004**: System MUST enforce global unique email for login.
- **FR-005**: System MUST validate password strength: ≥8 chars, at least one letter, one number, and one special character.
- **FR-006**: System MUST authenticate login with email + password and return identical 401 for unknown email or bad password.
- **FR-007**: System MUST issue opaque refresh tokens stored hashed in DB with expiry; support rotation on refresh.
- **FR-008**: System MUST revoke refresh tokens on logout.
- **FR-009**: System MUST reject requests to protected routes without valid Bearer JWT (401).
- **FR-010**: System MUST resolve `organization_id` exclusively from JWT — never from client body/header.
- **FR-011**: System MUST write append-only audit events for signup, login success/failure, logout, user create.
- **FR-012**: System MUST seed role templates (org_admin, dept_coordinator, approver, auditor) with permissions on org creation.
- **FR-013**: System MUST allow only org_admin (permission `user.manage`) to create additional users (US5).
- **FR-014**: System MUST support GET /auth/me returning user, org, role, permissions for route guards.

### Business Rules

- **BR-001 (US1)**: First user of a new org is always `org_admin`.
- **BR-002 (US2)**: Failed logins are audited without recording the attempted password.
- **BR-003 (US3)**: Refresh rotates: old refresh invalidated when new one issued.
- **BR-004 (US4)**: Auditor role is read-only (constitution RBAC).
- **BR-005 (US5)**: Users created by admin belong to admin's organization_id from JWT.

### Key Entities

- **Organization**: name, is_active — tenant boundary.
- **User**: name, email, password_hash, role, is_active/is_deleted — belongs to one org.
- **Role**: name + permissions JSONB — seeded per org.
- **Refresh Token**: hashed token, expiry, revoked_at — per user session.
- **Audit Log**: append-only, org-scoped, action + actor + metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Signup → logged-in dashboard in under 60 seconds.
- **SC-002**: Login response (valid creds) under 500ms p95.
- **SC-003**: 100% of protected endpoints reject missing/expired tokens.
- **SC-004**: 0 plaintext passwords in DB or API responses (verified by tests).
- **SC-005**: Cross-tenant access attempts blocked 100% via JWT org claim.
- **SC-006**: 100% of auth state events (signup/login/logout) present in audit_logs.

## Assumptions

- Email/password only for v1 (no OAuth/2FA) — user decision 2026-09-23.
- Password reset email deferred (no SMTP yet); admin can re-issue later.
- Branch/department modules deferred; user has optional branch_id later.
- JWT secret via `.env` only; access TTL 30 min; refresh TTL 14 days.
