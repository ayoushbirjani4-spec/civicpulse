import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error, InvalidHashError

from app.config import ACCESS_TOKEN_MINUTES, JWT_SECRET, REFRESH_TOKEN_DAYS

_hasher = PasswordHasher()
# Verified against when the email is unknown, so login takes the same time either way.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (Argon2Error, InvalidHashError):
        return False
    return password_hash is not None


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(user_id: uuid.UUID, code: str) -> str:
    # Keyed, because a plain hash of a 6-digit code can be reversed by trying all of them.
    return hmac.new(JWT_SECRET.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def otp_matches(user_id: uuid.UUID, code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(user_id, code), code_hash)


# Short enough to leave out of the list: anything under 8 characters is refused anyway.
_COMMON_PASSWORDS = frozenset(
    [
        "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
        "12345678", "123456789", "1234567890", "0123456789", "87654321", "987654321", "11111111",
        "00000000", "12341234", "11223344", "12121212", "123123123", "147258369", "qwertyui",
        "qwertyuiop", "qwerty123", "qwerty1234", "asdfghjk", "asdfghjkl", "zxcvbnm1", "1q2w3e4r",
        "1q2w3e4r5t", "1qaz2wsx", "q1w2e3r4", "abcd1234", "abc12345", "abcdefgh", "iloveyou",
        "sunshine", "princess", "football", "baseball", "superman", "trustno1", "welcome1",
        "welcome123", "letmein1", "admin123", "administrator", "monkey123", "dragon123", "starwars",
        "whatever", "computer", "internet", "changeme", "changeme123", "default1", "pakistan",
        "pakistan123", "pakistan1", "karachi123", "lahore123", "sukkur123", "islamabad",
        "civicpulse", "civicpulse123",
    ]
)


def password_problem(password: str, email: str) -> str | None:
    """Why a password is too easy to guess, or None. Length is checked by the request schema."""
    lowered = password.lower()
    local = email.split("@", 1)[0].lower()
    if lowered in _COMMON_PASSWORDS or len(set(password)) <= 2:
        return "weak_password"
    if lowered in "01234567890" or lowered in "abcdefghijklmnopqrstuvwxyz":
        return "weak_password"
    if len(local) >= 4 and local in lowered:
        return "password_contains_email"
    if not all(
        any(test(c) for c in password)
        for test in (str.isupper, str.islower, str.isdigit, lambda c: not c.isalnum() and not c.isspace())
    ):
        return "password_too_simple"
    return None


# The same rule the app shows as a checklist, for error messages and documentation.
PASSWORD_RULE = "at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol"


def _create_token(claims: dict, token_type: str, lifetime: timedelta) -> str:
    now = datetime.now(UTC)
    payload = {**claims, "type": token_type, "iat": now, "exp": now + lifetime}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def create_access_token(user_id: uuid.UUID, session_id: uuid.UUID) -> str:
    claims = {"sub": str(user_id), "sid": str(session_id)}
    return _create_token(claims, "access", timedelta(minutes=ACCESS_TOKEN_MINUTES))


def create_refresh_token(user_id: uuid.UUID, session_id: uuid.UUID, jti: str) -> str:
    claims = {"sub": str(user_id), "sid": str(session_id), "jti": jti}
    return _create_token(claims, "refresh", timedelta(days=REFRESH_TOKEN_DAYS))


def decode_token(token: str, expected_type: str) -> dict | None:
    """Return the claims with sub and sid as UUIDs, or None if the token is invalid, expired
    or the wrong type."""
    try:
        payload = jwt.decode(
            token, JWT_SECRET, algorithms=["HS256"], options={"require": ["exp", "sub", "sid"]}
        )
        if payload.get("type") != expected_type:
            return None
        return {**payload, "sub": uuid.UUID(payload["sub"]), "sid": uuid.UUID(payload["sid"])}
    except (jwt.InvalidTokenError, ValueError, TypeError):
        return None
