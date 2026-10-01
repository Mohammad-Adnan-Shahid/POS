---
id: PHR-0006
title: Explicit forgot-password messages + Gmail SMTP wiring
stage: plan
date: 2026-09-24
surface: agent
model: mimo-v2.6-flash-free
feature: 004-auth
branch: main
user: unknown
command: yes (implement — 200 sent-msg / 404 invalid split + Gmail App Password SMTP)
labels: [auth, forgot-password, smtp, email, enumeration, ux]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/auth_service.py
  - backend/app/services/mailer.py
  - backend/app/api/auth.py
  - frontend/src/pages/ForgotPassword.tsx
  - frontend/src/pages/ResetPassword.tsx
  - backend/tests/integration/test_auth_api.py
  - backend/tests/unit/test_auth_service.py
  - backend/tests/unit/test_mailer.py
  - README.md
  - .env
  - .env.example
  - spec-kit-plus/specs/004-auth/quickstart.md
tests:
  - backend/tests (404 EMAIL_NOT_FOUND split, cooldown ghost 404→429, EMAIL_SEND_FAILED, mailer false/fallback cases)
---

## Prompt

User: the generic "If an account exists with this email…" text is wrong — backend should show "OTP sent" when the email exists and "invalid email" when it doesn't. Also the OTP never actually arrives in their Gmail. Clarified via question: chose **200 sent-msg / 404 EMAIL_NOT_FOUND "Invalid email address"** (drops anti-enumeration wording deliberately) and **Gmail App Password** for real SMTP.

## Response snapshot

`request_password_reset` now returns `bool` (False = no active account) and raises `AuthError("EMAIL_SEND_FAILED", …, 502)` when `send_otp_email` returns False; the route responds 200 `"A verification code has been sent to your email."` or 404 `EMAIL_NOT_FOUND` "Invalid email address" (inactive accounts get the same 404). `send_otp_email` returns `bool`; half-configured SMTP (host+user, no password) counts as unset so a partial `.env` falls back to dev-log delivery instead of breaking the flow. Frontend shows the server's message verbatim on success and `err.message` on failure (Forgot page + Resend). Rate keys still built pre-lookup → ghost cooldown still 429-identical. `.env` prefilled with `smtp.gmail.com` + user/from, `SMTP_PASSWORD=` pending the user's 16-char App Password. Docs (README, quickstart, .env.example) updated.

## Outcome

- ✅ Impact: explicit UX the user asked for; real email delivery one paste away; SMTP failures now surface as 502 instead of silent
- 🧪 Tests: updated flow/cooldown/enumeration tests + new EMAIL_SEND_FAILED unit test + new `unit/test_mailer.py` (3 cases)
- 📁 Files: 13 (4 src, 3 test, 6 config/doc)
- 🔁 Next prompts: paste App Password → recreate backend → live inbox verification
- 🧠 Reflection: intentionally trading enumeration protection for UX is a product call — keep throttling uniform so only the response body leaks, never the rate behavior

## Evaluation notes (flywheel)

- Failure modes observed: half-configured SMTP would have 502'd the whole flow — caught by making "user without password" count as unconfigured
- Graders run and results (PASS/FAIL): pending pytest/tsc + live 404/200 check
- Prompt variant (if applicable): two-question clarify (message shape + SMTP provider) before implementation
- Next experiment (smallest change to try): dedicated provider/HTML templates once Gmail App Password verified
