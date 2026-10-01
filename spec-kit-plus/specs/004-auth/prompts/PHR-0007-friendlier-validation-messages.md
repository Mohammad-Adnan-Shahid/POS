---
id: PHR-0007
title: Friendlier client-side validation messages (kill "Request failed")
stage: plan
date: 2026-09-24
surface: agent
model: mimo-v2.6-flash-free
feature: 004-auth
branch: main
user: unknown
command: yes (implement — specific email/password errors instead of "Request failed")
labels: [auth, frontend, validation, ux]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/services/validation.ts
  - frontend/src/services/api.ts
  - frontend/src/pages/ForgotPassword.tsx
  - frontend/src/pages/ResetPassword.tsx
  - frontend/src/pages/Login.tsx
tests:
  - npx tsc -b clean; manual browser checks (missing @, spaces, empty password)
---

## Prompt

User: submitting a mistaken email (e.g. no `@`) shows only "Request failed" — unhelpful. Want every mistake shown specifically ("missing @" etc.).

## Response snapshot

Root cause: forms use `noValidate` (browser email bubble suppressed) and Pydantic 422s return `detail` as an **array**, which `parseError` couldn't map — falling back to "Request failed". Fix (frontend-only): new `validation.ts#emailIssue` ladder (required → include @ → no spaces → full-format) runs before any API call on Forgot/Reset/Login, plus `Password is required` on Login; `api.ts#parseError` now handles the Pydantic array shape (code `VALIDATION_ERROR`, first `.msg`) so no endpoint can ever show bare "Request failed" again. Envelope `{detail:{error:…}}` path unchanged. Backend untouched.

## Outcome

- ✅ Impact: specific validation messages for every auth form; global safety net for unknown 422s
- 🧪 Tests: tsc -b clean (no frontend test infra); verified shapes against live 422 responses
- 📁 Files: 5 edited/created + this record
- 🔁 Next prompts: optional backend RequestValidationError → app-envelope handler for fully consistent error shape
- 🧠 Reflection: a parser's default fallback becomes the app's visible error text — default strings must be last resorts, and non-envelope error shapes (Pydantic arrays) need explicit branches

## Evaluation notes (flywheel)

- Failure modes observed: `noValidate` + parser gap hid backend's detailed Pydantic reason entirely
- Graders run and results (PASS/FAIL): tsc PASS; browser ladder pending user retry
- Prompt variant (if applicable): none — complaint mapped 1:1 to parser gap
- Next experiment (smallest change to try): unify backend 422s under the `{detail:{error}}` envelope
