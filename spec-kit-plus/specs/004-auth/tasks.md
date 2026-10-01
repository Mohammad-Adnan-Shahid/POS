# Tasks: Authentication & Signup

**Input**: Design documents from `/specs/004-auth/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks grouped by user story (US1–US5).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create `backend/` structure per plan.md (app/, tests/, alembic/)
- [ ] T002 `backend/requirements.txt` — fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, pydantic, python-jose, passlib[bcrypt], alembic, pytest, pytest-asyncio, httpx, jsonschema, python-multipart
- [ ] T003 [P] `backend/app/config.py` + `.env.example` (SECRET_KEY, DATABASE_URL, JWT TTLs)
- [ ] T004 [P] `backend/app/database.py` async engine + session
- [ ] T005 [P] Scaffold `frontend/` Vite React-TS with routes /login /signup /dashboard

---

## Phase 2: Foundational (Blocking)

- [ ] T006 Models: `app/models/{organization,user,role,refresh_token,audit}.py` per data-model.md
- [ ] T007 Alembic init + initial migration (5 tables + indexes)
- [ ] T008 `app/security.py` — bcrypt hash/verify, JWT encode/decode (sub, org_id, exp)
- [ ] T009 `app/services/audit_service.py` append-only insert
- [ ] T010 `app/services/rbac_service.py` — seed 4 roles, `has_permission`
- [ ] T011 `app/deps.py` — `get_current_user` (401 on missing/invalid/expired; org from JWT only)
- [ ] T012 `app/main.py` app factory + `/health` + CORS

**Checkpoint**: foundation ready — US1 can start

---

## Phase 3: User Story 1 — Org Signup (P1) 🎯 MVP

### Tests FIRST (must FAIL)

- [ ] T013 [P] [US1] Contract test `tests/contract/test_auth_schemas.py` vs `contracts/schemas/signup.schema.json` (valid + weak-password invalid)
- [ ] T014 [US1] Integration test `tests/integration/test_auth_api.py::test_signup_success` — 201, org+user+roles, tokens returned, audit row
- [ ] T015 [US1] Integration `test_signup_duplicate_email` → 409
- [ ] T016 [US1] Unit `tests/unit/test_auth_service.py::test_signup_seeds_roles_and_admin`

### Implementation

- [ ] T017 [US1] `schemas/auth.py` SignupRequest/TokenResponse matching contracts
- [ ] T018 [US1] `auth_service.signup` — transaction: org + roles seed + admin user + refresh + audit
- [ ] T019 [US1] `POST /api/v1/auth/signup` in `api/auth.py`

**Checkpoint**: US1 independently testable

---

## Phase 4: User Story 2 — Login (P1)

### Tests FIRST

- [ ] T020 [P] [US2] Contract test login schema valid/invalid
- [ ] T021 [US2] Integration `test_login_success` → 200 + tokens + user/org
- [ ] T022 [US2] Integration `test_login_wrong_password` and `test_login_unknown_email` → 401 identical body
- [ ] T023 [US2] Integration `test_login_inactive_user` → 401
- [ ] T024 [US2] Unit `test_password_not_stored_plaintext`

### Implementation

- [ ] T025 [US2] LoginRequest/response schemas
- [ ] T026 [US2] `auth_service.login` — verify bcrypt, issue tokens, audit success/failure (no password in audit)
- [ ] T027 [US2] `POST /api/v1/auth/login`

**Checkpoint**: US1+US2

---

## Phase 5: User Story 3 — Refresh & Logout (P2)

### Tests FIRST

- [ ] T028 [US3] Integration `test_refresh_rotates_token`
- [ ] T029 [US3] Integration `test_refresh_rejected_after_logout`
- [ ] T030 [US3] Integration `test_logout_revokes_and_audits`

### Implementation

- [ ] T031 [US3] `auth_service.refresh` (hash compare, rotate, revoke old)
- [ ] T032 [US3] `auth_service.logout` (revoke + audit)
- [ ] T033 [US3] `POST /auth/refresh`, `POST /auth/logout`

---

## Phase 6: User Story 4 — Protected Guard /me (P2)

### Tests FIRST

- [ ] T034 [US4] Integration `test_me_requires_token` → 401
- [ ] T035 [US4] Integration `test_me_expired_token` → 401 TOKEN_EXPIRED
- [ ] T036 [US4] Integration `test_me_returns_org_and_permissions`
- [ ] T037 [US4] Integration `test_client_org_id_ignored` — body org spoof does not change org

### Implementation

- [ ] T038 [US4] Harden `deps.get_current_user` + error envelope
- [ ] T039 [US4] `GET /api/v1/auth/me`

---

## Phase 7: User Story 5 — Admin Creates User (P3)

### Tests FIRST

- [ ] T040 [US5] Integration `test_admin_creates_user` → 201, same org, can login
- [ ] T041 [US5] Integration `test_non_admin_forbidden` → 403
- [ ] T042 [US5] Integration `test_create_user_duplicate_email` → 409

### Implementation

- [ ] T043 [US5] `auth_service.create_user` (org from JWT, role lookup, audit user.create)
- [ ] T044 [US5] `POST /api/v1/auth/users` + `user.manage` check

---

## Phase 8: Frontend Login & Signup Pages

- [ ] T045 [P] [US1] `frontend/src/services/api.ts` — base fetch, access token in memory, refresh handling
- [ ] T046 [US1] `AuthContext.tsx` — login/signup/me/logout actions
- [ ] T047 [US1] `pages/Signup.tsx` — org name, name, email, password, confirm; client validation (8+, letter+number); errors (409/422); redirect to /dashboard
- [ ] T048 [US2] `pages/Login.tsx` — email, password, show/hide, 401 message, redirect /dashboard
- [ ] T049 [US2] `App.tsx` routes + protected redirect (no token → /login)
- [ ] T050 [P] `pages/Dashboard.tsx` — shows /me user + org + logout button
- [ ] T051 Basic responsive styling (CSS modules or plain CSS) for both pages

---

## Phase 9: Polish & Validation

- [ ] T052 [P] docker-compose.yml — postgres:16 + backend + frontend
- [ ] T053 README quickstart commands in `quickstart.md`
- [ ] T054 Run full test suite green; confirm audit append-only tests
- [ ] T055 Manual validation per quickstart.md scenarios

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 (P1) → US2 (P1) → US3 → US4 → US5 → Frontend (can start after US1+US2 API contracts stable)
- Tests before implementation within each story (Constitution II)
- Parallel: T013∥T014 family; frontend T045∥T046 start after contracts frozen

## Notes

- [P] = parallel-safe (different files)
- Every code commit includes its tests (Constitution)
- PHRs → `specs/004-auth/prompts/`
