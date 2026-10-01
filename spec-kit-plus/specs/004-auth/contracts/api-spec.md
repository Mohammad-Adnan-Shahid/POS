# API Contracts: Authentication & Signup

**Branch**: `004-auth` | **Date**: 2026-09-23 | **Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

Base path: `/api/v1` | Auth: Bearer JWT (tenant resolved from token) | Content-Type: `application/json`

## Conventions

- Response envelope:
  ```json
  { "data": { ... } }
  ```
- Error envelope:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
  ```
- Status codes: `400` invalid payload; `401` auth failure; `403` permission; `404` not found; `409` conflict (duplicate email); `422` schema/password policy; `201` created; `204` no content.
- Passwords accepted only in request bodies, never echoed in responses.

## Endpoints

### POST /auth/signup
Create organization + admin user + role seed; auto-login. Public.
```json
{
  "organization_name": "Acme Corp",
  "name": "Jane Admin",
  "email": "jane@acme.com",
  "password": "Secret@123"
}
```
**201**
```json
{
  "data": {
    "access_token": "jwt...",
    "refresh_token": "opaque...",
    "token_type": "bearer",
    "user": { "id": "uuid", "name": "Jane Admin", "email": "jane@acme.com", "role": "org_admin", "permissions": ["*"] },
    "organization": { "id": "uuid", "name": "Acme Corp" }
  }
}
```
**409** `EMAIL_ALREADY_EXISTS` â€” email already registered.
**422** `VALIDATION_ERROR` â€” weak password / bad email / missing fields.
Audit: `auth.signup`.

### POST /auth/login
Public.
```json
{ "email": "jane@acme.com", "password": "Secret@123" }
```
**200** â†’ same shape as signup `data` (tokens + user + organization).
**401** `INVALID_CREDENTIALS` â€” unknown email, bad password, inactive/deleted user (identical response; no enumeration).
Audit: `auth.login` or `auth.login_failed` (metadata: email attempted; NEVER password).

### POST /auth/refresh
Public (refresh token required).
```json
{ "refresh_token": "opaque..." }
```
**200** â†’ `{ "access_token", "refresh_token", "token_type": "bearer" }` (rotation: old refresh revoked).
**401** `INVALID_REFRESH_TOKEN` â€” unknown, expired, or revoked.

### POST /auth/logout
Authenticated (Bearer access) or body refresh. Revokes refresh token.
Body: `{ "refresh_token": "opaque..." }`
**204** No Content. Audit: `auth.logout`.
**401** if token invalid/expired already revoked â†’ still 204 idempotent preferred; spec: valid refresh â†’ 204; invalid â†’ 401.

### GET /auth/me
Auth: Bearer JWT required.
**200**
```json
{
  "data": {
    "user": { "id", "name", "email", "role", "permissions": [...] },
    "organization": { "id", "name" }
  }
}
```
**401** missing/invalid/expired token (`TOKEN_EXPIRED` when exp claim failed).

### POST /auth/users  (US5, admin only)
Auth: Bearer + permission `user.manage`.
```json
{ "name": "Bob Coord", "email": "bob@acme.com", "password": "Secret@123", "role": "dept_coordinator" }
```
**201** â†’ `{ "data": { "user": {...} } }`; user.organization_id = caller's JWT org (BR-005).
**403** `FORBIDDEN` â€” caller lacks `user.manage`.
**409** `EMAIL_ALREADY_EXISTS`.
**422** policy/validation errors.

## Shared error codes

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 422 | schema or password policy |
| INVALID_CREDENTIALS | 401 | login failed (generic) |
| TOKEN_EXPIRED | 401 | JWT exp passed |
| INVALID_TOKEN | 401 | bad signature/format |
| INVALID_REFRESH_TOKEN | 401 | refresh unknown/revoked/expired |
| EMAIL_ALREADY_EXISTS | 409 | duplicate email |
| FORBIDDEN | 403 | missing permission |
