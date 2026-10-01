---
id: 002
title: Continue following next steps
stage: misc
date: 2026-09-29
surface: backend
model: big-pickle
feature: '002-approval-workflow, 003-financial-engine'
branch: update-specs-saas-pos
user: moham
command: continue
labels: [notifications, rbac, migrations, tests, general]
links:
  spec: spec-kit-plus/specs/002-approval-workflow/spec.md
  ticket: '-'
  adr: '-'
  pr: '-'
files:
  - backend/app/services/notification_service.py
  - backend/app/api/notifications.py
  - backend/app/services/approval_service.py
  - backend/app/services/rbac_service.py
  - backend/app/database.py
  - backend/app/main.py
  - backend/app/schemas/notification.py
  - backend/alembic/versions/dbdcff75573b_reconcile_existing_role_permissions_.py
  - backend/alembic/versions/3b45edb756c8_grant_notification_view_to_existing_.py
  - backend/tests/integration/test_notifications.py
  - backend/tests/unit/test_auth_service.py
tests:
  - tests/integration/test_notifications.py (3 passed)
  - tests/unit/test_auth_service.py (passed; expects notification.view in all non-admin roles)
  - full suite (142 passed)
---

## Prompt

Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.

## Response snapshot

Proceeded through the remaining deliverables:
1. Migrations: generated 0004 (feature tables) via autogenerate, verified `alembic check`
   drift is limited to the two known unnamed-unique-constraint false positives, removed the
   erroneous `drop_constraint` ops, and upgraded the dev DB on `:5434` to head.
2. Runtime env: `.env` DATABASE_URL corrected from `:5433` to `:5434/pos_auth`.
3. RBAC data migration 0005 (reconcile existing roles with spec 001-003 canonical
   permissions; `approver` gained `approval.approve_with_exception` + `approval.resume`).
4. Notification wiring (002 P3.3 / FR-014): notifications now created in-band in
   `approval_service._record_decision` on the request session (removed the cross-DB
   `register()` startup writer); added `GET /api/v1/notifications`,
   `POST /api/v1/notifications/{id}/read`, `notification.view` on every non-admin role,
   `notification.view` migration 0006, and integration tests.
5. Fixed a latent production bug: `get_db()` never committed; it now commits on success and
   rolls back on error, matching the test override behavior.

## Outcome

- ✅ Impact: existing orgs are reconciled to the current permission model, notifications
  are delivered end-to-end (decision => inbox => mark-read), and runtime writes actually
  persist on the dev DB. Full suite re-ran at 142 passed.
- 🧪 Tests: 142 passed (50 unit, 13 contract, 13 financial-integration, 28 approval,
  25 procurement, 3 notifications + related).
- 📁 Files: notification service/router/schema, RBAC permission grant, two data
  migrations, `database.py` commit fix, `main.py` router registration.
- 🔁 Next prompts: final deliverable is the PHR set for this session (this record +
  #001); remaining optional hardening: `alembic check` in CI, unpack apply of
  `commitment.created` out-of-band subscriber.
- 🧠 Reflection: cross-DB writes when registering the notification writer at startup would
  violate test isolation and tenant correctness; in-request, same-transaction writes are
  the simplest correct design here and mirror the audit path.

## Evaluation notes (flywheel)

- Failure modes observed: `require_permission(...)` used as a callable instead of a
  dependency; non-existent `count_unread` referenced before adding it; `Principal` imported
  from `app.models` instead of `app.deps`.
- Graders run and results (PASS/FAIL): full suite PASS (142).
- Prompt variant (if applicable): -
- Next experiment (smallest change to try): add a CI drift check comparing migrated schema
  vs `create_all` schema.