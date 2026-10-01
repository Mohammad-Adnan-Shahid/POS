# Research: Authentication & Signup

**Branch**: `004-auth` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)
**Input**: `spec-kit-plus/specs/004-auth/spec.md` — Phase 0 output

## Decision / Rationale / Alternatives considered

### D-001: JWT access + opaque DB-backed refresh (not sessions-only)
- **Decision**: Short-lived JWT access token (30 min) with `sub` + `org_id`; long-lived opaque refresh token (14 days) stored **hashed** in `refresh_tokens`, rotated on use.
- **Rationale**: All existing api-specs (001/002/003) assume `Bearer JWT (tenant resolved)`. Refresh in DB allows revocation on logout (FR-007/FR-008).
- **Alternatives considered**: Server sessions — rejected: breaks stated Bearer JWT contract; pure stateless JWT w/ long TTL — rejected: cannot revoke on logout.

### D-002: `organization_id` claim from server-side creation only
- **Decision**: On signup server creates org, embeds returned id in JWT; every request re-reads org from verified token. Client-supplied org fields ignored.
- **Rationale**: Constitution I (tenant isolation) + D-003 of 001 research.
- **Alternatives considered**: Header X-Org-Id — rejected: spoofable.

### D-003: bcrypt via passlib for password hashing
- **Decision**: passlib `bcrypt` with per-user salt (bcrypt native), verify on login.
- **Rationale**: Constitution tech standards; widely audited; slow hash resists brute force. Argon2id also fine — bcrypt chosen for fewer native deps on Windows dev boxes.
- **Alternatives considered**: PBKDF2-SHA256 via hashlib only — weaker memory hardness; plain SHA — insecure.

### D-004: Global unique email as login key
- **Decision**: `users.email` UNIQUE globally (not per-org); login is email+password without org selector.
- **Rationale**: Simpler UX for v1; FR-004. Multi-org same-email SSO deferred.
- **Alternatives considered**: (org_slug, email) composite — rejected: forces user to know org at login; deferred.

### D-005: Role seed at org creation
- **Decision**: Within signup transaction insert 4 roles (org_admin, dept_coordinator, approver, auditor) with permission JSONB; first user → org_admin.
- **Rationale**: FR-012 + constitution RBAC (Auditor read-only); 002 approval steps assign by role_id.
- **Alternatives considered**: Global static roles without org scope — rejected: breaks per-tenant role edit later.

### D-006: Append-only audit via service, no ORM update/delete
- **Decision**: `audit_service.record(action, ...)` inserts only; table has no UPDATE/DELETE application paths; reason column for manual actions.
- **Rationale**: Constitution V.
- **Alternatives considered**: Reusing structured logging only — rejected: not queryable per tenant.

### D-007: FastAPI dependency `get_current_user` as single guard
- **Decision**: `deps.get_current_user` verifies JWT, loads user, returns principal with org_id + permissions; used by /me and future routers.
- **Rationale**: One enforcement point for FR-009/FR-010; matches 001/002/003 expectations.
- **Alternatives considered**: Middleware-only — rejected: harder to inject into OpenAPI per-route.

### D-008: Refresh rotation + reuse detection
- **Decision**: Refresh endpoint validates hash, marks old token revoked, issues new one. Presenting an already-revoked token → 401 and revoke sibling tokens for that user (optional hardening).
- **Rationale**: FR-007 rotation; limits stolen-token window.
- **Alternatives considered**: Non-rotating refresh — rejected: weaker.

## Adoption / References

- **Input**: `spec-kit-plus/specs/004-auth/spec.md`, `data-model.md`, `contracts/api-spec.md`
- **Stack refs**: `specs/001-purchase-request/plan.md` (JWT, async SQLAlchemy), `memory/constitution.md`
- **Tasks**: materialized in `tasks.md`
