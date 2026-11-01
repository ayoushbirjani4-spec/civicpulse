import uuid

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.limiter import limiter
from app.main import app
from app.models import User

client = TestClient(app)


def setup_function():
    limiter.reset()


def new_email():
    return f"t{uuid.uuid4().hex[:8]}@example.com"


def register(email):
    return client.post("/auth/register", json={"email": email, "password": "Test12345"})


def test_duplicate_email():
    e = new_email()
    assert register(e).status_code == 201
    assert register(e).status_code == 409


def test_wrong_code():
    e = new_email()
    register(e)
    r = client.post("/auth/verify-email", json={"email": e, "code": "000000"})
    assert r.status_code == 400


def test_unverified_cannot_login():
    e = new_email()
    register(e)
    r = client.post("/auth/login", json={"email": e, "password": "Test12345"})
    assert r.status_code == 403


def test_citizen_cannot_access_admin():
    e = new_email()
    register(e)
    db = SessionLocal()
    db.query(User).filter_by(email=e).update({"email_verified": True})
    db.commit()
    db.close()
    token = client.post("/auth/login", json={"email": e, "password": "Test12345"}).json()["access_token"]
    r = client.get("/admin/ping", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_admin_can_access_admin():
    r = client.post("/auth/login", json={"email": "admin@civicpulse.com", "password": "ChangeMe123!"})
    token = r.json()["access_token"]
    r = client.get("/admin/ping", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200


def test_sixth_login_blocked():
    limiter.reset()
    codes = []
    for _ in range(6):
        r = client.post("/auth/login", json={"email": "x@example.com", "password": "wrongpass1"})
        codes.append(r.status_code)
    print(codes)
    assert codes[-1] == 429
