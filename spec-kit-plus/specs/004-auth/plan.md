# Implementation Plan: Authentication & Signup

**Branch**: `004-auth` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/spec-kit-plus/specs/004-auth/spec.md`

## Summary

Primary requirement: multi-tenant org + admin signup, email/password login, JWT access/refresh lifecycle, logout, protected-route guard, and admin user creation — so every subsequent feature (001/002/003) can authenticate and resolve `organization_id` from token.

Technical approach: FastAPI modular monolith, async SQLAlchemy 2.0 + PostgreSQL 16, bcrypt password hashing, python-jose JWT (access) + opaque hashed refresh tokens in DB, RBAC role seed on org create, append-only audit log, React SPA login/signup pages consuming `/api/v1/auth/*`.

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: FastAPI, SQLAlchemy 2.0 (async, asyncpg), Pydantic v2, python-jose (JWT), passlib[bcrypt]
**Storage**: PostgreSQL 16
**Testing**: pytest + pytest-asyncio; jsonschema contract tests
**Target Platform**: Linux server (Docker)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: login p95 < 500ms; signup → session < 60s UX
**Constraints**: org_id only from JWT (never client); passwords never in logs/responses; audit append-only
**Scale/Scope**: multi-tenant; v1 = email/password only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Tenant isolation**: organizations/users carry organization_id; JWT org claim server-resolved (PASS)
- **Test-first**: unit/contract/integration tests written before implementation (PASS — required)
- **Integration-first**: real PostgreSQL tests for signup/login/tenant isolation (PASS — required)
- **Simplicity (≤3 projects)**: single backend + single frontend (PASS)
- **Anti-abstraction**: direct `auth_service` / `rbac_service` / `audit_service`; no generic entity service (PASS)
- **Audit compliance**: signup/login/logout/user-create → append-only audit_logs (PASS — FR-011)
- **No silent deletion**: users soft-delete via is_deleted/is_active; refresh revoked not hard-deleted (PASS)
- **Financial integrity**: N/A for auth (no financial figures) (PASS)

No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
spec-kit-plus/specs/004-auth/
├── spec.md              # Feature spec (user stories, FRs, success criteria)
├── plan.md              # This file
├── research.md          # Phase 0 research (tech decisions + rationale)
├── data-model.md        # Phase 1 entities, fields, validation
├── quickstart.md        # How to run/validate the feature locally
├── contracts/           # Phase 1 API contracts
│   ├── api-spec.md
│   └── schemas/{signup,login}.schema.json
└── tasks.md             # Phase 2 task list
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── main.py                 # FastAPI app + router mount
│   ├── config.py               # Settings from .env
│   ├── database.py             # async engine/session
│   ├── models/{organization,user,role,refresh_token,audit}.py
│   ├── schemas/auth.py         # signup/login/refresh/me request+response
│   ├── services/
│   │   ├── auth_service.py     # signup, login, refresh, logout, me
│   │   ├── rbac_service.py     # role seed + permission checks
│   │   └── audit_service.py    # append-only audit writes
│   ├── api/auth.py             # /api/v1/auth/* endpoints
│   ├── deps.py                 # get_current_user (JWT → principal)
│   └── security.py             # bcrypt + JWT helpers
├── alembic/versions/
├── requirements.txt
└── tests/
    ├── conftest.py             # test app + PG fixtures
    ├── unit/test_auth_service.py
    ├── contract/test_auth_schemas.py
    └── integration/test_auth_api.py

frontend/
├── package.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx                 # routes: /login /signup /dashboard
    ├── auth/AuthContext.tsx    # token store + /me
    ├── services/api.ts         # fetch wrapper
    └── pages/{Login,Signup,Dashboard}.tsx

docker-compose.yml              # postgres + backend + frontend
.env.example
```

**Structure Decision**: Web application (backend + frontend) per constitution max-3-projects. Feature logic in `auth_service.py`, exposed via `api/auth.py`, consumed by React SPA.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
