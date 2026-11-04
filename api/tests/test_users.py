from sqlalchemy import select

from app.create_admin import create_admin
from app.db import SessionLocal
from app.models import Device, User
from tests.conftest import PASSWORD, bearer


def test_me_requires_a_token(client):
    assert client.get("/me").status_code == 401


def test_unverified_token_gets_403(client, make_user):
    # POST /reports (M2) uses this same dependency, so it inherits this refusal.
    user = make_user(verified=False)
    response = client.get("/me", headers=bearer(user))
    assert response.status_code == 403
    assert response.json()["detail"] == "email_not_verified"


def test_disabling_an_account_stops_existing_tokens(client, make_user):
    user = make_user(status="disabled")
    assert client.get("/me", headers=bearer(user)).status_code == 403


def test_update_display_name(client, make_user):
    user = make_user()
    response = client.patch("/me", json={"display_name": "  New Name  "}, headers=bearer(user))
    assert response.status_code == 200
    assert response.json()["display_name"] == "New Name"


def test_profile_patch_cannot_change_role(client, make_user):
    user = make_user()
    client.patch("/me", json={"display_name": "Sneaky", "role": "admin"}, headers=bearer(user))
    assert client.get("/admin/ping", headers=bearer(user)).status_code == 403


def test_citizen_is_refused_on_admin_routes(client, make_user):
    assert client.get("/admin/ping", headers=bearer(make_user())).status_code == 403


def test_admin_is_allowed_on_admin_routes(client, make_user):
    admin = make_user(role="admin")
    assert client.get("/admin/ping", headers=bearer(admin)).status_code == 200


def test_anonymous_is_refused_on_admin_routes(client):
    assert client.get("/admin/ping").status_code == 401


def test_register_device_then_update_token(client, make_user):
    user = make_user()
    headers = bearer(user)
    body = {"device_id": "phone-0001", "push_token": "first"}
    assert client.post("/devices", json=body, headers=headers).status_code == 204
    assert client.post("/devices", json={**body, "push_token": "second"}, headers=headers).status_code == 204

    with SessionLocal() as db:
        devices = db.scalars(select(Device)).all()
    assert [d.push_token for d in devices] == ["second"]


def test_shared_phone_moves_to_the_newest_account(client, make_user):
    first, second = make_user(email="a@example.com"), make_user(email="b@example.com")
    body = {"device_id": "phone-0001", "push_token": "token"}
    client.post("/devices", json=body, headers=bearer(first))
    client.post("/devices", json=body, headers=bearer(second))

    with SessionLocal() as db:
        devices = db.scalars(select(Device)).all()
    assert [d.user_id for d in devices] == [second.id]


def test_create_admin_script(client):
    assert create_admin("Boss@Example.com", "The Boss", PASSWORD) == "created"
    login = client.post("/auth/login", json={"email": "boss@example.com", "password": PASSWORD})
    assert login.status_code == 200
    assert login.json()["user"]["role"] == "admin"


def test_create_admin_promotes_without_changing_password(client, make_user):
    make_user(email="boss@example.com")
    assert create_admin("boss@example.com", "The Boss", "A-Different-Pass-9") == "promoted"
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "boss@example.com"))
    assert user.role == "admin"
    assert client.post("/auth/login", json={"email": "boss@example.com", "password": PASSWORD}).status_code == 200
