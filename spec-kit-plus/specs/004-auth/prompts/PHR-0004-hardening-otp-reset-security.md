---
id: PHR-0004
title: Harden OTP password reset — attempts, single-use token, rate limits
stage: plan
date: 2026-09-24
surface: agent
model: mimo-v2.6-flash-free
feature: 004-auth
branch: main
user: unknown
command: yes (implement secure forgot-password flow per full spec)
labels: [auth, otp, password-reset, rate-limit, security, hardening]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/rate_limit.py
  - backend/app/models.py
  - backend/app/api/auth.py
  - backend/app/services/auth_service.py
  - backend/app/services/mailer.py
  - backend/alembic/versions/0003_password_reset_hardening.py
  - backend/tests/conftest.py
  - backend/tests/unit/test_auth_service.py
  - backend/tests/unit/test_rate_limit.py
  - backend/tests/integration/test_auth_api.py
  - frontend/src/pages/ForgotPassword.tsx
  - frontend/src/pages/ResetPassword.tsx
  - frontend/src/pages/auth.css
  - README.md
tests:
  - backend/tests (expanded: expired OTP, 5-attempt lockout, single-use reset token, confirm mismatch, resend cooldown, IP rate limit, rate_limit unit)
---

## Prompt

Implement secure Forgot Password / Password Reset flow (email → 6-digit OTP → verify → short-lived single-use reset token → new password), reusing the existing architecture: attempt cap (5), distinct error messages, 60s resend cooldown, rate limiting, confirm-password validation, hardened mailer, spec-matching UI copy.

## Response snapshot

Flow already existed from PHR-0003; hardened it instead of rewriting. Migration 0003 adds `attempts`, `reset_token_hash`, `reset_token_used_at` to `password_reset_otps`. `verify_password_reset_otp` now locates the latest active row (not filtered by hash), counts wrong tries (5 → invalidate, `OTP_MAX_ATTEMPTS`), distinguishes `OTP_EXPIRED`, and binds the issued JWT via stored `sha256(reset_token)`. `reset_password` consumes that hash (single-use) and validates `confirm_password`. New in-memory sliding-window limiter (`app/rate_limit.py`): forgot 5/min/IP + 1 per 60s/email (cooldown), verify 10/min/IP+email, reset 10/min/IP → 429 `RATE_LIMITED`, keyed pre-lookup (enumeration-safe). Mailer: SMTP try/except (no 500 leak), OTP print/outbox gated off when `ENV=prod`, spec email copy, sent via `asyncio.to_thread`. Frontend: 60s resend countdown button (calls forgot-password), distinct error messages by code, `confirm_password` payload, spec UI copy. Decisions confirmed by user: custom in-memory limiter (no slowapi); keep existing field names + add `confirm_password`.

## Outcome

- ✅ Impact: spec-complete reset flow; backend fully enforces OTP → token → reset chain
- 🧪 Tests: expanded suite (unit + integration + rate_limit) run via pytest against Postgres
- 📁 Files: 3 new (rate_limit.py, migration 0003, test_rate_limit.py), ~11 edited
- 🔁 Next prompts: production SMTP credentials; optional ADR for in-memory limiter; frontend test infra
- 🧠 Reflection: rate keys must be built from client input before account lookup or cooldowns become an enumeration oracle; stateless JWT reset tokens are not single-use unless bound to DB state

## Evaluation notes (flywheel)

- Failure modes observed: pre-existing gaps — no attempt counter, reusable JWT reset token, sync SMTP without error handling, OTP logged unconditionally
- Graders run and results (PASS/FAIL): pending full pytest run after implementation
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): HMAC-pepper OTP hashes with SECRET_KEY; move limiter to Redis if multi-process
