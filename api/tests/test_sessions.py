from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.db import SessionLocal
from app.models import AuthSession
from tests.conftest import PASSWORD, bearer, tokens


def refresh(client, token):
    return client.post("/auth/refresh", json={"refresh_token": token})


def me(client, access):
    return client.get("/me", headers={"Authorization": f"Bearer {access}"})


def test_login_starts_a_session_for_the_device(client, make_user):
    make_user(email="a@example.com")
    body = client.post(
        "/auth/login", json={"email": "a@example.com", "password": PASSWORD}, headers={"X-Device-Id": "phone-1"}
    ).json()
    with SessionLocal() as db:
        (session,) = db.scalars(select(AuthSession)).all()
    assert session.device_id == "phone-1" and session.revoked_at is None
    assert me(client, body["access_token"]).status_code == 200


def test_refresh_gives_a_new_refresh_token_and_moves_the_deadline(client, make_user):
    _, old = tokens(make_user())
    with SessionLocal() as db:
        db.execute(update(AuthSession).values(expires_at=datetime.now(UTC) + timedelta(days=1)))
        db.commit()
    body = refresh(client, old).json()
    assert body["refresh_token"] != old
    with SessionLocal() as db:
        session = db.scalar(select(AuthSession))
    # A phone in use never reaches the 14-day limit: each refresh restarts it.
    assert session.expires_at > datetime.now(UTC) + timedelta(days=13)
    assert me(client, body["access_token"]).status_code == 200


def test_a_lost_reply_can_be_retried_within_the_grace_period(client, make_user):
    _, old = tokens(make_user())
    refresh(client, old)  # the phone never got this answer
    retry = refresh(client, old)
    assert retry.status_code == 200
    assert me(client, retry.json()["access_token"]).status_code == 200


def test_an_old_refresh_token_after_the_grace_period_ends_the_session(client, make_user):
    _, old = tokens(make_user())
    new = refresh(client, old).json()
    with SessionLocal() as db:
        db.execute(update(AuthSession).values(rotated_at=datetime.now(UTC) - timedelta(minutes=5)))
        db.commit()
    assert refresh(client, old).status_code == 401
    # Someone else held a copy, so the real phone is logged out too and must log in again.
    assert me(client, new["access_token"]).status_code == 401
    assert refresh(client, new["refresh_token"]).status_code == 401


def test_an_idle_session_expires(client, make_user):
    _, token = tokens(make_user())
    with SessionLocal() as db:
        db.execute(update(AuthSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        db.commit()
    assert refresh(client, token).status_code == 401


def test_logout_ends_the_refresh_token_and_the_access_token(client, make_user):
    access, token = tokens(make_user())
    assert client.post("/auth/logout", json={"refresh_token": token}).status_code == 204
    assert me(client, access).status_code == 401
    assert refresh(client, token).status_code == 401


def test_logout_only_ends_this_device(client, make_user):
    user = make_user()
    _, phone = tokens(user, "phone")
    tablet, _ = tokens(user, "tablet")
    client.post("/auth/logout", json={"refresh_token": phone})
    assert me(client, tablet).status_code == 200


def test_logout_with_a_bad_token_still_answers_204(client):
    assert client.post("/auth/logout", json={"refresh_token": "garbage"}).status_code == 204


def test_a_refresh_token_for_another_users_session_is_refused(client, make_user):
    import jwt

    from app.config import JWT_SECRET

    a = make_user(email="a@example.com")
    b = make_user(email="b@example.com")
    _, token = tokens(a)
    claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    claims["sub"] = str(b.id)
    assert refresh(client, jwt.encode(claims, JWT_SECRET, "HS256")).status_code == 401


def test_bearer_helper_still_works(client, make_user):
    assert client.get("/me", headers=bearer(make_user())).status_code == 200
