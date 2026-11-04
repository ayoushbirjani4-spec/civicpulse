from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select, update

from app.config import JWT_SECRET
from app.db import SessionLocal
from app.models import EmailOtp, User
from app.security import hash_otp
from tests.conftest import PASSWORD, tokens

EMAIL = "ayesha@example.com"
SIGNUP = {"email": EMAIL, "password": PASSWORD, "display_name": "Ayesha"}


def wrong_code(code):
    return "000000" if code != "000000" else "111111"


def test_full_journey(client, outbox):
    response = client.post("/auth/register", json=SIGNUP)
    assert response.status_code == 201
    assert client.post("/auth/verify-email", json={"email": EMAIL, "code": outbox[EMAIL]}).status_code == 200

    login = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert login.status_code == 200
    body = login.json()
    assert body["user"]["role"] == "citizen"
    me = client.get("/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["display_name"] == "Ayesha"


def test_duplicate_email_is_rejected_case_insensitively(client, outbox):
    assert client.post("/auth/register", json=SIGNUP).status_code == 201
    again = client.post("/auth/register", json={**SIGNUP, "email": EMAIL.upper()})
    assert again.status_code == 409


def test_register_cannot_choose_role(client, outbox):
    client.post("/auth/register", json={**SIGNUP, "role": "admin", "email_verified": True})
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == EMAIL))
    assert user.role == "citizen"
    assert user.email_verified is False


def test_secrets_are_never_stored_in_plain_text(client, outbox):
    client.post("/auth/register", json=SIGNUP)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == EMAIL))
        otp = db.scalar(select(EmailOtp).where(EmailOtp.user_id == user.id))
    assert user.password_hash.startswith("$argon2")
    assert outbox[EMAIL] not in otp.code_hash


def test_short_password_is_rejected(client, outbox):
    assert client.post("/auth/register", json={**SIGNUP, "password": "short"}).status_code == 422


def test_five_wrong_codes_lock_the_code(client, outbox):
    client.post("/auth/register", json=SIGNUP)
    code = outbox[EMAIL]
    statuses = [
        client.post("/auth/verify-email", json={"email": EMAIL, "code": wrong_code(code)}).status_code
        for _ in range(5)
    ]
    assert statuses == [400, 400, 400, 400, 423]
    # Even the right code is refused now.
    assert client.post("/auth/verify-email", json={"email": EMAIL, "code": code}).status_code == 423


def test_resend_replaces_a_locked_code(client, outbox):
    client.post("/auth/register", json=SIGNUP)
    old = outbox[EMAIL]
    for _ in range(5):
        client.post("/auth/verify-email", json={"email": EMAIL, "code": wrong_code(old)})

    assert client.post("/auth/resend-code", json={"email": EMAIL}).status_code == 202
    new = outbox[EMAIL]
    assert client.post("/auth/verify-email", json={"email": EMAIL, "code": new}).status_code == 200


def test_resend_invalidates_the_old_code(client, outbox):
    client.post("/auth/register", json=SIGNUP)
    old = outbox[EMAIL]
    client.post("/auth/resend-code", json={"email": EMAIL})
    if outbox[EMAIL] != old:
        assert client.post("/auth/verify-email", json={"email": EMAIL, "code": old}).status_code == 400


def test_resend_is_silent_for_unknown_email(client, outbox):
    assert client.post("/auth/resend-code", json={"email": "nobody@example.com"}).status_code == 202
    assert outbox == {}


def test_expired_code_is_refused(client, outbox):
    client.post("/auth/register", json=SIGNUP)
    with SessionLocal() as db:
        db.execute(update(EmailOtp).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        db.commit()
    response = client.post("/auth/verify-email", json={"email": EMAIL, "code": outbox[EMAIL]})
    assert response.status_code == 400
    assert response.json()["detail"] == "code_expired"


def test_unverified_user_cannot_log_in(client, outbox):
    client.post("/auth/register", json=SIGNUP)
    response = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 403
    assert response.json()["detail"] == "email_not_verified"


def test_wrong_password_and_unknown_email_look_the_same(client, make_user):
    make_user(email=EMAIL)
    wrong = client.post("/auth/login", json={"email": EMAIL, "password": "wrong-password"})
    unknown = client.post("/auth/login", json={"email": "no@example.com", "password": "wrong-password"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_disabled_account_cannot_log_in(client, make_user):
    make_user(email=EMAIL, status="disabled")
    assert client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code == 403


def test_refresh_gives_a_working_access_token(client, make_user):
    user = make_user()
    response = client.post("/auth/refresh", json={"refresh_token": tokens(user)[1]})
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_access_token_cannot_refresh_and_refresh_token_cannot_authenticate(client, make_user):
    access, refresh = tokens(make_user())
    response = client.post("/auth/refresh", json={"refresh_token": access})
    assert response.status_code == 401
    headers = {"Authorization": f"Bearer {refresh}"}
    assert client.get("/me", headers=headers).status_code == 401


def test_refresh_is_refused_once_account_is_disabled(client, make_user):
    user = make_user(status="disabled")
    response = client.post("/auth/refresh", json={"refresh_token": tokens(user)[1]})
    assert response.status_code == 401


def test_expired_and_forged_tokens_are_refused(client, make_user):
    user = make_user()
    past = datetime.now(UTC) - timedelta(minutes=1)
    expired = jwt.encode({"sub": str(user.id), "type": "access", "exp": past}, JWT_SECRET, "HS256")
    forged = jwt.encode(
        {"sub": str(user.id), "type": "access", "exp": past + timedelta(hours=1)},
        "not-the-real-secret-but-long-enough-for-hs256",
        "HS256",
    )
    for token in (expired, forged, "garbage"):
        assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_token_lifetimes_match_the_spec(make_user):
    user = make_user()
    pair = tokens(user)
    access = jwt.decode(pair[0], JWT_SECRET, algorithms=["HS256"])
    refresh = jwt.decode(pair[1], JWT_SECRET, algorithms=["HS256"])
    assert access["exp"] - access["iat"] == 15 * 60
    assert refresh["exp"] - refresh["iat"] == 14 * 24 * 3600



def test_newest_code_is_checked_when_two_are_active(client, outbox):
    # Two active codes can exist from before the issuing lock; the newest must be the one that works.
    client.post("/auth/register", json=SIGNUP)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == EMAIL))
        db.add(EmailOtp(user_id=user.id, code_hash=hash_otp(user.id, "111111"),
                        expires_at=datetime.now(UTC) + timedelta(minutes=5)))
        db.add(EmailOtp(user_id=user.id, code_hash=hash_otp(user.id, "222222"),
                        expires_at=datetime.now(UTC) + timedelta(minutes=9, seconds=59)))
        db.query(EmailOtp).filter(EmailOtp.user_id == user.id, EmailOtp.code_hash.notin_(
            [hash_otp(user.id, "111111"), hash_otp(user.id, "222222")])).update({"used_at": datetime.now(UTC)})
        db.commit()
    assert client.post("/auth/verify-email", json={"email": EMAIL, "code": "222222"}).status_code == 200
