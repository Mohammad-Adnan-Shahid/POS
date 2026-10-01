---
id: PHR-0008
title: Specific password-policy messages (4-rung ladder, API/UI parity)
stage: plan
date: 2026-09-24
surface: agent
model: mimo-v2.6-flash-free
feature: 004-auth
branch: main
user: unknown
command: yes (implement — specific messages for no-special-char and 1–7-char passwords)
labels: [auth, password-policy, validation, api, ux]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/auth_service.py
  - backend/app/api/auth.py
  - frontend/src/pages/ResetPassword.tsx
  - backend/tests/unit/test_auth_service.py
  - backend/tests/integration/test_auth_api.py
tests:
  - backend/tests 46 passed (strengthened unit asserts: length + no-digit; new integration: short pw → envelope "at least 8 characters")
---

## Prompt

Same treatment as the email fix: when a password has no special character, or is only 1–7 characters, show which specific mistake it is — not one combined/technical message.

## Response snapshot

`validate_password_policy` split from one combined sentence into a **first-failure ladder** whose wording is byte-identical to the frontend's `passwordIssue`: length → letter → digit → special (each its own `422 VALIDATION_ERROR`). Removed Pydantic `min_length=8` from `CreateUserRequest.password` and `ResetPasswordRequest.password/confirm_password` (kept `max_length=128`; **login untouched**, still `min_length=1`, no policy at login) so short passwords now reach the friendly ladder instead of "String should have at least 8 characters". Frontend letter/digit messages split for exact parity. Unit test strengthened (`short` → "at least 8 characters", new `Abcdefg!` → "at least one digit"); new integration test asserts the **envelope** (not a pydantic array) for a 4-char reset password. 46/46 pytest, tsc clean, containers rebuilt.

## Outcome

- ✅ Impact: every password-setting path (seed, create-user, reset) says exactly which rule failed; UI and API speak the same words
- 🧪 Tests: 46 passed (2 new/extended); tsc clean
- 📁 Files: 5 source/test + docs untouched
- 🔁 Next prompts: AUTH-FLOW.md doc (PHR-0009); optional shared validation module between FE/BE
- 🧠 Reflection: min_length in the schema and policy in the service are two gates for the same rule — the earlier gate wins with the uglier message; letting the richer validator own the rule fixes UX at the cost of OpenAPI minLength hints

## Evaluation notes (flywheel)

- Failure modes observed: pydantic array shape for <8 chars pre-change (technical message, different envelope)
- Graders run and results (PASS/FAIL): pytest PASS, tsc PASS, live create-user checks pending admin password restore
- Prompt variant (if applicable): none — direct continuation of PHR-0007 pattern
- Next experiment (smallest change to try): extract shared rule definitions consumed by both FE and BE
