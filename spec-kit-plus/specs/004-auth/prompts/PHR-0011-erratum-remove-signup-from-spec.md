---
id: PHR-0011
title: Erratum — signup removed, but 004-auth spec still models it as P1
stage: spec
date: 2026-10-01
surface: agent
model: mimo-v2.6-flash-free
feature: 004-auth
branch: update-specs-saas-pos
user: unknown
command: no (opened during spec review; not yet executed)
labels: [auth, signup-removed, spec-errata, adr-required, pending]
links:
  spec: spec-kit-plus/specs/004-auth/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - spec-kit-plus/specs/004-auth/spec.md
  - spec-kit-plus/specs/004-auth/contracts/api-spec.md
  - spec-kit-plus/specs/004-auth/contracts/schemas/signup.schema.json
  - spec-kit-plus/specs/004-auth/data-model.md
  - spec-kit-plus/specs/004-auth/plan.md
  - spec-kit-plus/specs/004-auth/quickstart.md
tests:
  - n/a (documentation-only erratum; no backend exists yet)
---

## Prompt

**Context**: `004-auth` is committed as a complete spec folder while `tasks.md` still has 55/55 unchecked. On review, the folder contradicts itself about whether public signup exists.

**The contradiction**:

| Artifact | Evidence |
|---|---|
| `spec.md` | Title "Authentication & Signup"; US1 = Organization Signup **(P1)**; `FR-001` MUST create org+admin on signup; `FR-012` seed on signup |
| `contracts/api-spec.md:22` | `### POST /auth/signup` documented as a live endpoint |
| `data-model.md:46` | `**Seed on signup (FR-012)**` |
| `plan.md:8,52` | "multi-tenant org + admin signup"; `schemas/{signup,login}.schema.json` |
| `contracts/schemas/signup.schema.json` | file exists |
| `quickstart.md:1,38` | "company — **no public signup**"; validation #1 `POST /auth/signup → 404/405 (removed)` |

**Decision evidence that removal is current**: `PHR-0003-company-no-signup-otp-reset.md`
(`date: 2026-09-23`, `command: yes (remove signup + forgot password OTP email flow)`),
`quickstart.md:21` bootstrap CLI ("replaces public signup"), and the shipped markup, which
has no signup UI.

**Task**: reconcile the five stale artifacts with the removal decision. Smallest viable diff —
do not invent new requirements, do not touch `FR-010` (org_id from JWT only) or `FR-006`
(identical 401), which are unaffected.

## Constraints & invariants

- Specs are source of truth — errata go in the spec, code must not be edited to match.
- Preserve `quickstart.md` as the operational truth (`/auth/signup` → 404/405).
- Do not delete `signup.schema.json` until `api-spec.md` stops referencing it, or the
  contract folder becomes internally dangling.
- Keep the P1 story slot: removal leaves US1 vacant, so either backfill with Login (already
  US2) or renumber — do not ship a spec with a missing P1.

## Error paths to document

1. `POST /auth/signup` on a provisioned instance → `404`/`405` (endpoint absent), not `409`.
2. Re-running `python -m app.bootstrap` → `409 EMAIL_ALREADY_EXISTS` (already noted in
   PHR-0003 evaluation) — must appear in `quickstart.md` validation rows.
3. A spec reader implementing FR-001 verbatim would ship a tenant-provisioning endpoint —
   this is the failure this erratum prevents.

## Acceptance criteria

- [ ] `spec.md:1` title no longer advertises signup
- [ ] `spec.md` US1 either removed or backfilled; no orphaned P1
- [ ] `spec.md` FR-001 / FR-012 rewritten or dropped, and a "removed 2026-09-23" decision note added alongside the existing `spec.md:153` password-policy note
- [ ] `api-spec.md` `POST /auth/signup` section removed or marked `404/405 (removed)`
- [ ] `data-model.md:46` seed-on-signup block reworded to seed-on-bootstrap
- [ ] `plan.md` no longer lists `schemas/signup.schema.json`
- [ ] `contracts/schemas/signup.schema.json` deleted **or** retained with an explicit `deprecated` marker
- [ ] `grep -ri signup spec-kit-plus/specs/004-auth` returns only removal/bootstrap context
- [ ] ADR-0001 written and linked from `links.adr` (currently `null`)

## Outcome

- ⏳ Pending — opened 2026-10-01 during pre-deploy spec review; awaiting user consent on ADR-0001 text proposed in review.

## Evaluation notes (flywheel)

- Failure modes observed: P1 user story deleted without renumbering → orphaned priority; deleting the schema before the api-spec → dangling contract reference
- Graders run and results (PASS/FAIL): n/a (not yet run)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after errata, re-run `grep -ri signup` as the binary PASS/FAIL oracle
