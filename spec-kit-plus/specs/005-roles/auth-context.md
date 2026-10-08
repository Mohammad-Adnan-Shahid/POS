# Auth Context & Frontend Permission Enforcement

**Feature Branch**: `005-roles`
**Created**: 2026-10-07
**Status**: Draft
**Input**: "Specify the file structure of `frontend/src/auth/` — `AuthContext.tsx` — the enforcement half of `roles.md`."

## Purpose & Scope

`roles.md` defines **who may do what**. This doc defines **how the app checks it**: the frontend auth module, its file structure, the `AuthState` contract, and how every rule in `roles.md` flows through a single choke point — `hasPermission`.

**Out of scope**: backend JWT/signup mechanics (owned by `004-auth`), server-side permission enforcement (`mockApi.ts` `requirePermission` guards are the mock equivalent).

---

## 1. File Structure

```
frontend/src/
├── auth/
│   └── AuthContext.tsx          # The auth module — session + permission gate (88 lines)
├── pages/auth/
│   ├── Login.tsx                # Email/password → auth.login()
│   ├── ForgotPassword.tsx       # Password reset request (004-auth OTP flow)
│   └── ResetPassword.tsx        # OTP + new password
├── main.tsx                     # Route guards: Protected (20-32), PublicOnly (27-32)
├── components/Layout.tsx        # Nav-item filtering by permission (60)
├── mockApi.ts                   # Session storage helpers (237-256), login/logout/me (372-410)
└── types.ts                     # User, RoleName (50)
spec-kit-plus/specs/004-auth/    # Backend contract: sessions, roles, refresh_tokens
```

Related but separate: permission-gated UI lives at each call site (`PRDetail.tsx:70-75`, `ApprovalsWorkflows.tsx:17`, `PRList.tsx:27`) — see §7.

---

## 2. `AuthState` Contract

Exposed by `AuthProvider` and consumed via `useAuth()` (`AuthContext.tsx:6-15`, `84-88`):

| Member | Type | Meaning |
|---|---|---|
| `token` | `string \| null` | Access token; `null` = logged out. Mock: token **is** the user id (`mockApi.ts:386`) |
| `user` | `User \| null` | Current user incl. `role` and `permissions[]` |
| `organization` | `Organization \| null` | Current org (multi-tenant scope) |
| `loading` | `boolean` | Session-restore in progress; guards render until resolved |
| `login(email, password)` | `Promise<void>` | Calls `api.login`, sets token/user/organization (`AuthContext.tsx:45-50`) |
| `logout()` | `Promise<void>` | Calls `api.logout`, clears all three (`AuthContext.tsx:52-57`) |
| `hasPermission(permission)` | `boolean` | **The permission gate** — see §5 |
| `isAdmin` | `boolean` | Shortcut: `hasPermission('user.manage')` (`AuthContext.tsx:76`) |

`useAuth()` outside a provider throws (`AuthContext.tsx:84-88`) — `AuthProvider` must wrap the app (`main.tsx:36`).

---

## 3. Lifecycle

### 3.1 Session restore (mount)

`AuthContext.tsx:25-43`:

1. Read `pos-markup-session` + `pos-markup-access` from localStorage (`mockApi.ts:237-238`).
2. Neither present → `loading = false`, logged out.
3. Both present → `api.me(token)` validates (real impl: `GET /auth/me`).
4. Success → sets `user`, `organization`, `token`.
5. Failure → `api.clearSession()` (`mockApi.ts:254-256`) — stale/invalid token dropped.
6. `finally` → `loading = false`.

### 3.2 Login / logout

- `login` → `api.login` (`mockApi.ts:372`) → persists session + token (`mockApi.ts:244-245`) → sets state.
- `logout` → `api.logout` (`mockApi.ts:396-407`) → `clearSession` → state nulled.

### 3.3 Route guarding (`main.tsx:20-32`)

| Guard | While `loading` | No `token` | Has `token` |
|---|---|---|---|
| `Protected` | "Loading…" | redirect `/login` | render inside `Layout` |
| `PublicOnly` | "Loading…" | render page | redirect `/dashboard` |

All non-public routes are wrapped in `Protected` (`main.tsx:39-51`); catch-all `*` → `/dashboard` (`main.tsx:51`).

---

## 4. Session Storage (markup stage)

Keys are `localStorage`-backed and mock-specific (`mockApi.ts:237-256`):

| Key | Content |
|---|---|
| `pos-markup-session` | `{ email, orgId }` — display-only session hint |
| `pos-markup-access` | access token (mock: user id) |

**Limitation**: no expiry or refresh handling client-side; `004-auth` defines real refresh tokens (`data-model.md:52`) that the real implementation must wire in.

---

## 5. Permission Checking — the single choke point

```ts
// AuthContext.tsx:59-65
hasPermission(permission) {
  if (!user) return false                                    // logged out → no permissions
  return user.permissions.includes('*') ||                   // wildcard (org_admin)
         user.permissions.includes(permission)               // exact match
}
```

Rules:

1. **Logged out ⇒ always `false`.** No anonymous access.
2. **`'*'` is a wildcard** — `org_admin`'s `['*']` (`mockApi.ts:66`) grants everything.
3. **Exact string match** against the user's `permissions[]` (arrays seeded per role, `mockApi.ts:64-116`).
4. **Client-side convenience only** — the mock mirrors it server-side via `requirePermission` (`mockApi.ts:265-268`), which is the authoritative check in real implementation.
5. `isAdmin = hasPermission('user.manage')` (`AuthContext.tsx:76`) — currently exposed but unused by any UI surface.

---

## 6. Enforcement Map — how `roles.md` rules surface here

Every rule in `roles.md` reaches the UI through `hasPermission`:

| roles.md rule | Check | Location |
|---|---|---|
| §3 Only `org_admin` assigns (both assignments) | `approval.configure_workflow`, `user.manage` | `ApprovalsWorkflows.tsx:17`, server `mockApi.ts:868`; `isAdmin` at `AuthContext.tsx:76` |
| §5 Creator holds the grant | `purchase_request.create` | `PRList.tsx:27`, server `mockApi.ts:440` |
| §6 SoD: requester ≠ approver | `canDecide ... && !isCreator` | `PRDetail.tsx:75` |
| §6 SoD: requester edits own draft only | `canEdit`/`canSubmit`/`canRecall` + `isCreator` | `PRDetail.tsx:70-72` |
| §2 View approvals queue | `approval.view` | `Layout.tsx:25` (nav filter), `ApprovalsQueue.tsx` |
| Nav visibility | per-item `permission` | `Layout.tsx:60` |
| Financial powers | `financial.manage_current_funds`, `commitment.adjust`, `budget.create` | `FinancialDashboard.tsx:17-18`, `FinancialBudgets.tsx:13` |

The pattern: **components never inspect `role` directly for gating** — they ask `hasPermission` (role → permission mapping lives in the seed data / roles.md matrix).

---

## 7. Known Limitations (markup stage)

1. **Token = user id**, no signature/expiry (`mockApi.ts:386`) — mock only.
2. **No refresh flow** — a real `refresh_tokens` implementation (`004-auth/data-model.md:52`) must be wired into §3.1.
3. **Permissions snapshot is static** — set at login/restore; a grant or role change by the super admin requires re-login (or a `refresh()` on `AuthState`) to take effect. *Relevant to roles.md §7.2: a revoked creation grant may persist until the user's next session restore.*
4. **`isAdmin` unused** — no admin-only screen consumes it yet; will matter when the roles.md §5 creation-grant screen is built.
5. **No per-route permission check** — `Protected` checks *authentication* only; unauthorized deep-links render until the component's own gate fires.

---

## 8. Acceptance Checks

**File structure**

- [ ] `frontend/src/auth/` contains exactly `AuthContext.tsx` (module boundary holds)
- [ ] `AuthProvider` wraps the app in `main.tsx` before `BrowserRouter`
- [ ] All auth pages live under `frontend/src/pages/auth/`

**Contract**

- [ ] `useAuth()` throws outside `AuthProvider` (`AuthContext.tsx:84-88`)
- [ ] `AuthState` exposes exactly the 8 members in §2 — no silent additions without updating this doc
- [ ] `loading` gates both `Protected` and `PublicOnly` renders (no redirect flash)

**Lifecycle**

- [ ] Fresh visit with valid stored token → restored session without re-login
- [ ] Tampered/invalid token → `clearSession()` and treated as logged out
- [ ] `logout()` clears state and both localStorage keys
- [ ] Logged-out visit to any `Protected` route → `/login`; logged-in visit to `/login` → `/dashboard`

**Permission enforcement**

- [ ] `hasPermission` returns `false` when `user` is null
- [ ] `'*'` grants any permission; exact match otherwise
- [ ] roles.md §5: user without the creation grant never sees the "+ New Purchase Request" button
- [ ] roles.md §6: PR creator never sees Approve/Reject/Hold buttons
- [ ] Nav items hidden when the user lacks the item's permission (`Layout.tsx:60`)

---

## Follow-ups & Risks

- **Implementation gap**: §7.3 (permission refresh after grant/revoke) — decide whether `AuthState` gains a `refresh()` when the roles.md §5 creation-grant screen is built (roles.md §5.1 Option B).
- **Risk**: doc drift — §2's contract table must be updated whenever `AuthState` changes; acceptance boxes in §8 are the drift detector.
- **Follow-up**: wire real `refresh_tokens` per `004-auth` when moving off the mock.
