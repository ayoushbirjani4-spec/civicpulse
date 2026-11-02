# CivicPulse API

FastAPI, PostgreSQL + PostGIS, SQLAlchemy 2 and Alembic.

## Run it

From the repository root, after copying `.env.example` to `.env` and setting `JWT_SECRET`:

```bash
docker compose up --build
```

Migrations run when the API container starts.

| What | Where |
| --- | --- |
| API docs (the live API contract) | http://localhost:8000/docs |
| Development inbox, for verification codes | http://localhost:8025 |

## Common tasks

Run the tests. They create and use a separate `<db>_test` database:

```bash
docker compose exec api pytest
```

Create the admin account. There is no API route for this, on purpose:

```bash
docker compose exec api python -m app.create_admin admin@example.com "Admin Name"
```

Add a migration after changing `app/models.py`:

```bash
docker compose exec api alembic revision --autogenerate -m "describe the change"
```

## Module 1: authentication

| Route | Purpose | Auth |
| --- | --- | --- |
| `POST /auth/register` | Create an account and email a code | None |
| `POST /auth/verify-email` | Confirm the code | None |
| `POST /auth/resend-code` | Replace an expired or locked code | None |
| `POST /auth/login` | Get access and refresh tokens | None |
| `POST /auth/refresh` | Get a new access token | Refresh token |
| `GET`, `PATCH /me` | Read or edit your profile | User |
| `POST /devices` | Register this phone | User |
| `GET /admin/ping` | Check admin access | Admin |

For new routes, use these from `app/deps.py`:

- `get_current_user`: any verified, active account. Refuses everyone else.
- `require_admin`: admins only. Routes on the `/admin` router get this automatically.
- `limit_writes`: the shared per-account and per-device limit.

For a limit of your own, call `app.rate_limit.enforce`. Clients identify the phone with
an `X-Device-Id` header.

### Status codes

| Code | Meaning |
| --- | --- |
| 400 | Wrong or expired verification code |
| 401 | Not logged in, or wrong password |
| 403 | Wrong role, unverified email or disabled account |
| 409 | Email already registered |
| 422 | Bad input |
| 423 | Code locked after 5 wrong tries; request a new one |
| 429 | Rate limited; see the `Retry-After` header |
