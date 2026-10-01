# Quickstart: Authentication (company — no public signup)

**Branch**: `004-auth`

## Run locally

```bash
# 1. Environment
cp .env.example .env          # set SECRET_KEY, DATABASE_URL, optional SMTP_*

# 2. Database (Docker)
docker compose up -d postgres

# 3. Backend
cd backend
python -m venv .venv && .venv\Scripts\activate   # or source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 4. First org + admin (CLI — replaces public signup)
python -m app.bootstrap --org "Acme" --name "Jane Admin" --email jane@acme.com --password Secret@123

# 5. Frontend
cd ../frontend
npm install
npm run dev                   # http://localhost:3000

# 6. Tests (TDD gate)
cd ../backend
pytest -q
```

## Validation scenarios

| # | Scenario | Expected |
|---|---|---|
| 1 | POST /auth/signup | 404/405 (removed) |
| 2 | Bootstrap CLI | org + roles + admin created; audit `auth.bootstrap` |
| 3 | Login valid | 200 tokens + user/org; audit `auth.login` |
| 4 | Login wrong password / unknown email | 401 INVALID_CREDENTIALS identical |
| 5 | GET /me no token | 401 |
| 6 | GET /me valid token | user + org + permissions |
| 7 | Refresh then logout then refresh | 200 then 401 |
| 8 | POST /auth/users as non-admin | 403 |
| 9 | Password field in any response | absent; DB has bcrypt hash only |
| 10 | Forgot password (known email) | 200 "A verification code has been sent to your email."; OTP emailed (or logged if no SMTP) |
| 11 | Forgot password (unknown email) | 404 `EMAIL_NOT_FOUND` "Invalid email address" (explicit; PHR-0006) |
| 12 | Verify correct OTP | 200 `reset_token` |
| 13 | Verify wrong/reused OTP | 401 INVALID_OTP |
| 14 | Reset with valid token + strong password | 200; old password fails, new works; refresh tokens revoked |
| 15 | Reset weak password | 422 |

## API smoke (curl)

```bash
# Login (after bootstrap)
curl -s -X POST localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@acme.com","password":"Secret@123"}'

# Forgot password → OTP (check backend logs if SMTP empty)
curl -s -X POST localhost:8000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@acme.com"}'

curl -s -X POST localhost:8000/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@acme.com","code":"123456"}'

curl -s -X POST localhost:8000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"reset_token":"<token>","password":"NewPass456"}'
```
