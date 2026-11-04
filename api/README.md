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
| Media origin, for stored photos | http://localhost:8001/media/{name}.jpg |
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
| `POST /auth/login` | Get access and refresh tokens; starts a session | None |
| `POST /auth/refresh` | Get a new access token and a new refresh token | Refresh token |
| `POST /auth/logout` | End this device's session | Refresh token |
| `POST /auth/forgot-password` | Email a reset code (same answer for unknown emails) | None |
| `POST /auth/reset-password` | Set a new password with the code; logs out every device | None |
| `GET`, `PATCH /me` | Read or edit your profile | User |
| `POST /me/password` | Change password; logs out every other device | User |
| `POST /devices` | Register this phone | User |
| `GET /admin/ping` | Check admin access | Admin |

## Module 2: hazard reports

| Route | Purpose | Auth |
| --- | --- | --- |
| `GET /categories` | Active hazard categories | User |
| `POST /reports` | Submit a report (multipart: `photo`, `category_id`, `lat`, `lng`, `accuracy_m`, `is_mocked`, `captured_at`, `client_uuid`, `description`) | User |
| `GET /reports/mine` | Your reports, newest first (`limit`, `offset`) | User |
| `GET /reports/{id}` | One report; others get 404 unless admin | User |

Sending the same `client_uuid` again returns the original report with status 200, so an
upload retried after a lost reply never creates a second report. Until Module 5 adds the
merge engine, every report gets its own new pin.

## Module 4: hazard map

| Route | Purpose | Auth |
| --- | --- | --- |
| `GET /pins` | Pins inside `bbox=minLng,minLat,maxLng,maxLat`, as GeoJSON; filters `category`, `status` (default `open,pending_repair`); at most 500, with `truncated` set when there are more | User |
| `GET /pins/{id}` | One pin with up to 6 recent photo URLs | User |

Public positions are rounded to 4 decimal places (about 11 m), because until Module 5 a pin
sits exactly where its reporter stood. Admins receive the exact position. No pin response
names a reporter.

## Module 3: image handling

`app/images.py` is the only code that writes photo files. Each upload is checked by its
content (JPEG, PNG or WebP, at most 5 MB), decoded, resized to 1600 px on the long side,
re-encoded as a JPEG with no camera data, and saved under a random name. It records the
SHA-256 of the stored bytes and a 64-bit difference hash that still matches after
re-compression. Each account may upload 50 photos a day.

Photos are served by a separate app, `app/media.py`, on port 8001, with `nosniff` and a
locked-down content policy. Set `MEDIA_BASE_URL` in `.env` to your LAN address when
testing on a phone.

### Sessions and passwords

Every login creates a row in `auth_sessions`, and both tokens carry its id. Logging out,
resetting or changing the password ends sessions, which stops their access tokens at once.
Each refresh returns a new refresh token and moves the 14-day deadline, so a phone in use
stays logged in and one left idle for 14 days must log in again. An old refresh token is
accepted once within 60 seconds (a reply lost on a weak connection); after that, using it
ends the session, because only a stolen copy would still have it.

New passwords need 8 to 128 characters and are refused if they are common, a sequence or
repeated characters (`weak_password`), or contain the email name (`password_contains_email`).
Sign-up and reset codes are separate: one never works as the other.

For new routes, use these from `app/deps.py`:

- `get_current_user`: any verified, active account with a live session. Refuses everyone else.
- `get_current_session`: the session behind the request, for routes that end other sessions.
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
