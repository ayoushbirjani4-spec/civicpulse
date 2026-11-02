"""Tests run against a real PostGIS database, never mocks. They use a separate
<name>_test database, so development data is safe.

    docker compose exec api pytest
"""

import os
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
import pytest

_base_url = os.environ["DATABASE_URL"]
_server_url, _db_name = _base_url.rsplit("/", 1)
_test_db = f"{_db_name}_test"
os.environ["DATABASE_URL"] = f"{_server_url}/{_test_db}"
os.environ.setdefault("JWT_SECRET", "test-secret-with-enough-length-for-hs256")
os.environ["MEDIA_DIR"] = tempfile.mkdtemp(prefix="civicpulse-media-")

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import mailer, rate_limit
from app.db import SessionLocal, engine
from app.main import app
from app.models import User
from app.security import create_access_token, hash_password

API_DIR = Path(__file__).resolve().parent.parent
PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="session", autouse=True)
def database():
    with psycopg.connect(_base_url, autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{_test_db}" WITH (FORCE)')
        conn.execute(f'CREATE DATABASE "{_test_db}"')
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "migrations"))
    command.upgrade(config, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables(database):
    with engine.begin() as conn:
        conn.execute(
            text("TRUNCATE users, devices, email_otps, rate_limit_counters, images, reports, pins CASCADE")
        )


@pytest.fixture
def outbox(monkeypatch):
    """Emails that would have gone out, as {email: latest code}."""
    sent = {}
    monkeypatch.setattr(mailer, "send_verification_code", lambda email, code: sent.update({email: code}))
    return sent


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def make_user():
    def _make(email="user@example.com", role="citizen", verified=True, status="active"):
        with SessionLocal() as db:
            user = User(
                email=email,
                password_hash=hash_password(PASSWORD),
                display_name="Test User",
                role=role,
                email_verified=verified,
                status=status,
            )
            db.add(user)
            db.commit()
            return user

    return _make


class _Clock:
    def __init__(self):
        self.now = datetime(2026, 1, 1, 12, 0, 30, tzinfo=UTC)

    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def freeze_window(monkeypatch):
    """Hold the rate limiter's clock still, so a test can't straddle two windows and flake."""
    clock = _Clock()

    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock.now

    monkeypatch.setattr(rate_limit, "datetime", _FrozenDatetime)
    return clock


def bearer(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}
