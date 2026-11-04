import pytest
from sqlalchemy import select

from app.db import SessionLocal
from app.models import User
from tests.conftest import PASSWORD, tokens

EMAIL = "ayesha@example.com"
NEW = "river-lamp-orange-42"


def login(client, password, email=EMAIL):
    return client.post("/auth/login", json={"email": email, "password": password})


def me(client, access):
    return client.get("/me", headers={"Authorization": f"Bearer {access}"})


@pytest.mark.parametrize(
    "password,problem",
    [
        ("password123", "weak_password"),
        ("12345678", "weak_password"),
        ("aaaaaaaa", "weak_password"),
        ("abababab", "weak_password"),
        ("abcdefghij", "weak_password"),
        ("Ayesha-2026!", "password_contains_email"),
    ],
)
def test_easy_passwords_are_refused_at_sign_up(client, outbox, password, problem):
    response = client.post("/auth/register", json={"email": EMAIL, "password": password, "display_name": "Ayesha"})
    assert (response.status_code, response.json()["detail"]) == (422, problem)


def test_a_reasonable_password_is_accepted(client, outbox):
    response = client.post("/auth/register", json={"email": EMAIL, "password": NEW, "display_name": "Ayesha"})
    assert response.status_code == 201


# ---------- forgot and reset ----------

def test_reset_with_the_emailed_code(client, make_user, outbox):
    make_user(email=EMAIL)
    assert client.post("/auth/forgot-password", json={"email": EMAIL}).status_code == 202
    response = client.post("/auth/reset-password", json={"email": EMAIL, "code": outbox[EMAIL], "new_password": NEW})
    assert response.status_code == 200
    assert login(client, NEW).status_code == 200
    assert login(client, PASSWORD).status_code == 401


def test_reset_logs_out_every_device(client, make_user, outbox):
    user = make_user(email=EMAIL)
    access, refresh = tokens(user)
    client.post("/auth/forgot-password", json={"email": EMAIL})
    client.post("/auth/reset-password", json={"email": EMAIL, "code": outbox[EMAIL], "new_password": NEW})
    assert me(client, access).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_forgot_password_is_silent_for_unknown_email(client, outbox):
    assert client.post("/auth/forgot-password", json={"email": "nobody@example.com"}).status_code == 202
    assert outbox == {}


def test_five_wrong_reset_codes_lock_the_code(client, make_user, outbox):
    make_user(email=EMAIL)
    client.post("/auth/forgot-password", json={"email": EMAIL})
    right = outbox[EMAIL]
    wrong = "000000" if right != "000000" else "111111"
    codes = [
        client.post("/auth/reset-password", json={"email": EMAIL, "code": wrong, "new_password": NEW}).status_code
        for _ in range(5)
    ]
    assert codes == [400, 400, 400, 400, 423]
    locked = client.post("/auth/reset-password", json={"email": EMAIL, "code": right, "new_password": NEW})
    assert locked.status_code == 423


def test_a_reset_code_cannot_verify_an_email_and_the_reverse(client, outbox):
    client.post("/auth/register", json={"email": EMAIL, "password": NEW, "display_name": "Ayesha"})
    signup_code = outbox[EMAIL]
    reset = client.post("/auth/reset-password", json={"email": EMAIL, "code": signup_code, "new_password": NEW + "x"})
    assert reset.status_code == 400

    client.post("/auth/forgot-password", json={"email": EMAIL})
    reset_code = outbox[EMAIL]
    if reset_code != signup_code:
        assert client.post("/auth/verify-email", json={"email": EMAIL, "code": reset_code}).status_code == 400


def test_resetting_also_verifies_an_unverified_account(client, make_user, outbox):
    make_user(email=EMAIL, verified=False)
    client.post("/auth/forgot-password", json={"email": EMAIL})
    client.post("/auth/reset-password", json={"email": EMAIL, "code": outbox[EMAIL], "new_password": NEW})
    assert login(client, NEW).status_code == 200


def test_reset_refuses_a_weak_new_password_without_using_up_the_code(client, make_user, outbox):
    make_user(email=EMAIL)
    client.post("/auth/forgot-password", json={"email": EMAIL})
    code = outbox[EMAIL]
    weak = client.post("/auth/reset-password", json={"email": EMAIL, "code": code, "new_password": "password123"})
    assert weak.status_code == 422
    good = client.post("/auth/reset-password", json={"email": EMAIL, "code": code, "new_password": NEW})
    assert good.status_code == 200


def test_disabled_accounts_get_no_reset_email(client, make_user, outbox):
    make_user(email=EMAIL, status="disabled")
    client.post("/auth/forgot-password", json={"email": EMAIL})
    assert outbox == {}


# ---------- change password ----------

def change(client, access, current, new):
    return client.post(
        "/me/password",
        json={"current_password": current, "new_password": new},
        headers={"Authorization": f"Bearer {access}"},
    )


def test_change_password(client, make_user):
    access, _ = tokens(make_user(email=EMAIL))
    assert change(client, access, PASSWORD, NEW).status_code == 204
    assert login(client, NEW).status_code == 200
    assert login(client, PASSWORD).status_code == 401


def test_change_keeps_this_device_and_logs_out_the_others(client, make_user):
    user = make_user(email=EMAIL)
    here, _ = tokens(user, "phone")
    other, other_refresh = tokens(user, "tablet")
    change(client, here, PASSWORD, NEW)
    assert me(client, here).status_code == 200
    assert me(client, other).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": other_refresh}).status_code == 401


def test_change_needs_the_right_current_password(client, make_user):
    access, _ = tokens(make_user(email=EMAIL))
    response = change(client, access, "not-my-password", NEW)
    assert (response.status_code, response.json()["detail"]) == (400, "wrong_password")


def test_change_refuses_weak_and_unchanged_passwords(client, make_user):
    access, _ = tokens(make_user(email=EMAIL))
    assert change(client, access, PASSWORD, "12345678").json()["detail"] == "weak_password"
    assert change(client, access, PASSWORD, PASSWORD).json()["detail"] == "same_password"


def test_guessing_the_current_password_is_rate_limited(client, make_user, freeze_window):
    access, _ = tokens(make_user(email=EMAIL))
    codes = [change(client, access, f"guess-number-{i}", NEW).status_code for i in range(6)]
    assert codes == [400] * 5 + [429]


def test_change_password_needs_a_login(client):
    assert client.post("/me/password", json={"current_password": PASSWORD, "new_password": NEW}).status_code == 401


def test_password_hash_changes(client, make_user):
    user = make_user(email=EMAIL)
    access, _ = tokens(user)
    with SessionLocal() as db:
        before = db.scalar(select(User.password_hash))
    change(client, access, PASSWORD, NEW)
    with SessionLocal() as db:
        after = db.scalar(select(User.password_hash))
    assert before != after and after.startswith("$argon2")
