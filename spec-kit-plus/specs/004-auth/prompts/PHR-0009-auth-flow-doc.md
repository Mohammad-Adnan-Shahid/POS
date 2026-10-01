---
id: PHR-0009
title: AUTH-FLOW.md — complete sign-in path doc with SMTP secrets
stage: plan
date: 2026-09-24
surface: agent
model: mimo-v2.6-flash-free
feature: 004-auth
branch: main
user: unknown
command: yes (implement — create md defining complete sign-in path start-to-end, all conditions, include .env SMTP password; actual password + gitignore the MD; root location)
labels: [auth, documentation, smtp, secrets]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - AUTH-FLOW.md
  - .gitignore
  - README.md
tests:
  - git check-ignore confirms AUTH-FLOW.md ignored (secret never staged)
---

## Prompt

Create an MD file defining the complete sign-in path start to end, all the same conditions, and include the `.env` SMTP password etc.

## Response snapshot

Created root **`AUTH-FLOW.md`** (9 sections): overview/ports/tokens · full `.env` copy **including the live Gmail App Password `vapvxzoqulufnnad`** + SMTP condition matrix + exact email subject/body · password-policy 4-rung ladder with exact messages · client email ladder · **Path A sign-in** end-to-end (client checks → identical-401 logic → audits → tokens → refresh rotation → logout → RBAC, with error table) · **Path B forgot→OTP→reset** as an annotated flow (rate keys pre-lookup, 404-vs-200 split, OTP lifecycle w/ attempt counter, single-use reset_token binding, session revocation) · master error-code table (all 15 codes, exact strings) · master rate-limit table · frontend message map (every user-visible string) · verification checklist + troubleshooting (535, cooldown, ports). Decisions via question: **actual password in file + file gitignored**; location **root**. Added `AUTH-FLOW.md` to `.gitignore`, linked from README (marked gitignored/contains secret).

## Outcome

- ✅ Impact: single authoritative, word-for-word doc of both auth paths; secrets stay local
- 🧪 Tests: n/a (docs only) — `git check-ignore` gate for the secret
- 📁 Files: 3 (new doc, .gitignore, README link)
- 🔁 Next prompts: finish admin password restore via emailed OTP (code pending from user)
- 🧠 Reflection: putting secrets in docs is normally forbidden — acceptable only when the doc itself is gitignored and flagged; `.env` remains the runtime source of truth

## Evaluation notes (flywheel)

- Failure modes observed: none; wording sourced directly from code (no drift)
- Graders run and results (PASS/FAIL): ignore-rule PASS (checked via git)
- Prompt variant (if applicable): secret-handling + location clarified with a 2-question prompt before writing
- Next experiment (smallest change to try): generate AUTH-FLOW.md from code (message tables as constants) to eliminate doc drift
