---
id: PHR-0003
title: Company auth — remove signup + OTP password reset
stage: plan
date: 2026-09-23
surface: agent
model: mimo-v2.6-flash-free
feature: 004-auth
branch: main
user: unknown
command: yes (remove signup + forgot password OTP email flow)
labels: [auth, signup-removed, otp, password-reset, smtp, company]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/auth.py
  - backend/app/services/auth_service.py
  - backend/app/services/mailer.py
  - backend/app/models.py
  - backend/app/config.py
  - backend/app/bootstrap.py
  - backend/alembic/versions/0002_password_reset_otps.py
  - backend/tests/**
  - frontend/src/App.tsx
  - frontend/src/pages/{Login,ForgotPassword,ResetPassword}.tsx
  - frontend/src/auth/AuthContext.tsx
  - docker-compose.yml
  - .env.example
  - README.md
tests:
  - backend/tests (25)
---

## Prompt

Company use: remove public signup. Forgot password → OTP email → verify → set new password → update.

## Response snapshot

Removed POST /auth/signup + Signup UI. Added POST /auth/forgot-password, /auth/verify-otp, /auth/reset-password. New table password_reset_otps (migration 0002), mailer (SMTP or log outbox), bootstrap CLI for first org+admin. Frontend: ForgotPassword + ResetPassword pages, Login link → Forgot password. 25/25 tests. E2E smoke: signup 404, OTP flow full pass (wrong/reuse 401, old pwd rejected, new login OK), pages 200.

## Outcome

- ✅ Impact: Company-ready auth (no self-serve signup; OTP reset)
- 🧪 Tests: 25 passed; E2E OTP via proxy OK
- 📁 Files: 15+ backend/frontend/infra files
- 🔁 Next prompts: SMTP real credentials; admin UI for user create; session list/revoke
- 🧠 Reflection: Empty SMTP_HOST must log OTP to docker logs (print + logger) or flow is untestable in dev

## Evaluation notes (flywheel)

- Failure modes observed: OTP not in logs until print/logger fixed; bootstrap EMAIL_ALREADY_EXISTS expected on re-run
- Graders run and results (PASS/FAIL): signup 404 PASS; forgot/verify/reset PASS; enum-safe PASS; 25 tests PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): rate-limit forgot-password per IP (currently unlimited; OTP single-use + 10m TTL only)
