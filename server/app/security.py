import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from passlib.hash import argon2

from app.config import settings


def hash_password(password: str) -> str:
    return argon2.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return argon2.verify(password, hashed)


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def create_token(user_id: str, role: str, minutes: int = 0, days: int = 0, kind: str = "access") -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes, days=days)
    payload = {"sub": user_id, "role": role, "type": kind, "exp": exp}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])