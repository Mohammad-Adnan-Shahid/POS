# Data Model: Authentication & Signup

**Branch**: `004-auth` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
Derived from Phase 1 of `/sp.plan`; source of truth for entities, fields, and validation.

## Entities

### organizations

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | tenant id (JWT org_id) |
| name | VARCHAR(200) | NOT NULL | display name |
| slug | VARCHAR(100) | UNIQUE, nullable | optional url key |
| is_active | BOOLEAN | default TRUE | soft disable |
| created_at / updated_at | TIMESTAMP | NOT NULL | |

### users

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | JWT `sub` |
| organization_id | UUID | FK → organizations, NOT NULL | tenant boundary |
| name | VARCHAR(200) | NOT NULL | |
| email | VARCHAR(320) | NOT NULL, UNIQUE (global) | login key (FR-004) |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt; never returned (FR-002) |
| role_id | UUID | FK → roles, NOT NULL | |
| is_active | BOOLEAN | default TRUE | |
| is_deleted | BOOLEAN | default FALSE | soft delete (No Silent Deletion) |
| created_at / updated_at | TIMESTAMP | NOT NULL | |

**Validation**
- Password policy at API layer: ≥8 chars, ≥1 letter, ≥1 number, ≥1 special character (FR-005).
- Login rejects `is_deleted OR NOT is_active` (US2 AC4).

### roles

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK → organizations, NOT NULL | |
| name | VARCHAR(50) | NOT NULL, UNIQUE (org, name) | org_admin, dept_coordinator, approver, auditor |
| permissions | JSONB | NOT NULL | e.g. ["user.manage","purchase_request.create",...] |
| created_at | TIMESTAMP | NOT NULL | |

**Seed on signup (FR-012)**
- `org_admin`: ["*"] or full permission list incl. `user.manage`
- `dept_coordinator`: ["purchase_request.view","purchase_request.create","purchase_request.edit","purchase_request.submit","purchase_request.recall","purchase_request.cancel"]
- `approver`: ["purchase_request.view","approval.view","approval.approve","approval.reject","approval.hold"]
- `auditor`: ["purchase_request.view","approval.view","financial.view"] (read-only, BR-004)

### refresh_tokens

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK → users, NOT NULL | |
| organization_id | UUID | FK, NOT NULL | tenant scope on queries |
| token_hash | VARCHAR(64) | NOT NULL, UNIQUE | sha256 of opaque token (never store raw) |
| expires_at | TIMESTAMP | NOT NULL | +14 days |
| revoked_at | TIMESTAMP | nullable | set on logout/rotation |
| created_at | TIMESTAMP | NOT NULL | |

### audit_logs (append-only — Constitution V)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| organization_id | UUID | FK, NOT NULL | tenant-scoped |
| actor_id | UUID | nullable | null for signup pre-user moments → user id after |
| action | VARCHAR(50) | NOT NULL | auth.signup, auth.login, auth.login_failed, auth.logout, user.create |
| entity_type | VARCHAR(50) | NOT NULL | `user`, `organization` |
| entity_id | UUID | nullable | |
| reason | TEXT | nullable | required for override-style actions |
| metadata | JSONB | nullable | ip, email attempted (not password), role ids |
| created_at | TIMESTAMP | NOT NULL | |

**Invariant**: no UPDATE/DELETE statements against audit_logs (Constitution V).

## Cross-cutting references

- 001/002/003 FK `users(id)`, `organizations(id)`, `roles(id)` — this feature creates those tables.
- `deps.get_current_user` produces principal used by all future routers.

## Relationships (summary)

```
organizations 1─N users N─1 roles
organizations 1─N roles
users 1─N refresh_tokens
organizations 1─N audit_logs
```

## Indexing priorities

- `users(email)` UNIQUE — login lookup
- `users(organization_id)` — tenant user lists
- `refresh_tokens(token_hash)` UNIQUE — refresh validation
- `refresh_tokens(user_id, revoked_at)` — session listing
- `audit_logs(organization_id, created_at)` — tenant audit query
