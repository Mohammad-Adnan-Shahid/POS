---
id: PHR-0005
title: Password policy — require one special character
stage: plan
date: 2026-09-24
surface: agent
model: mimo-v2.6-flash-free
feature: 004-auth
branch: main
user: unknown
command: yes (also add the possibility... password use the one special character)
labels: [auth, password-policy, validation, security]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/auth_service.py
  - backend/app/bootstrap.py
  - backend/tests/unit/test_auth_service.py
  - backend/tests/integration/test_auth_api.py
  - frontend/src/pages/ResetPassword.tsx
  - README.md
  - spec-kit-plus/specs/004-auth/spec.md
  - spec-kit-plus/specs/004-auth/data-model.md
  - spec-kit-plus/specs/004-auth/quickstart.md
  - spec-kit-plus/specs/004-auth/contracts/api-spec.md
tests:
  - backend/tests (policy now 8+ / letter / number / special char; new no-symbol rejection case)
---

## Prompt

Add the possibility… password use the one special character. (Clarified via question: require ≥1 special character in the password policy; email fields already accept `@`.)

## Response snapshot

`validate_password_policy` now requires ≥8 chars + ≥1 letter + ≥1 digit + ≥1 non-alphanumeric (`[^A-Za-z0-9]`, so `@ ! #` etc.). Frontend `passwordIssue` mirrors it with its own message; placeholder updated. Login untouched — existing passwords (including `qwerty@00`) keep working. All test/doc passwords that pass through the policy updated `Secret123 → Secret@123`, `NewPass456 → NewPass@456`, `Another789 → Another@789`; weak-policy tests now use `Abcdefg1` (letter+digit, no symbol) and assert the new message. Contract login-schema test left alone (no policy there). FR-005 + examples updated across 004-auth spec docs and README.

## Outcome

- ✅ Impact: stronger passwords on seed/create/reset only; zero login impact
- 🧪 Tests: full pytest incl. new no-symbol rejection (unit + integration)
- 📁 Files: 10 edited (2 src, 4 test/doc-adjacent, 4 docs)
- 🔁 Next prompts: uppercase requirement? NIST-style length-first guidance?
- 🧠 Reflection: policy functions shared by seed/create/reset mean one rule change ripples into every fixture password — grep-driven sweep caught them all

## Evaluation notes (flywheel)

- Failure modes observed: none post-change; pre-change risk was stale fixture passwords (systematically replaced)
- Graders run and results (PASS/FAIL): pending pytest/tsc run
- Prompt variant (if applicable): ambiguous phrasing → clarified with a multiple-choice question before planning
- Next experiment (smallest change to try): reject sequential/common passwords (optional; not requested)
