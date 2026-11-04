"""Login sessions: start one at login, rotate its refresh token on every refresh, end it on
logout or a password change."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.config import REFRESH_GRACE_SECONDS, REFRESH_TOKEN_DAYS
from app.models import AuthSession, User
from app.security import create_access_token, create_refresh_token


def _now() -> datetime:
    return datetime.now(UTC)


def _tokens(session: AuthSession) -> tuple[str, str]:
    return (
        create_access_token(session.user_id, session.id),
        create_refresh_token(session.user_id, session.id, session.refresh_jti),
    )


def start(db: Session, user: User, device_id: str | None) -> tuple[str, str]:
    """A new session for this login. The caller commits."""
    session = AuthSession(
        user_id=user.id,
        device_id=device_id,
        refresh_jti=secrets.token_hex(16),
        expires_at=_now() + timedelta(days=REFRESH_TOKEN_DAYS),
    )
    db.add(session)
    db.flush()
    return _tokens(session)


def rotate(db: Session, claims: dict) -> tuple[str, str] | None:
    """New tokens for a valid refresh token, or None. A replayed old token ends the session,
    because only a copy held by someone else would still be using it. The caller commits."""
    session = db.get(AuthSession, claims["sid"], with_for_update=True)
    now = _now()
    if session is None or session.user_id != claims["sub"] or session.revoked_at or session.expires_at <= now:
        return None
    jti = claims.get("jti")
    lost_reply = (
        jti is not None
        and jti == session.previous_jti
        and session.rotated_at is not None
        and now - session.rotated_at <= timedelta(seconds=REFRESH_GRACE_SECONDS)
    )
    if jti != session.refresh_jti and not lost_reply:
        session.revoked_at = now
        return None
    if not lost_reply:
        session.previous_jti = session.refresh_jti
        session.rotated_at = now
    session.refresh_jti = secrets.token_hex(16)
    session.last_used_at = now
    session.expires_at = now + timedelta(days=REFRESH_TOKEN_DAYS)
    return _tokens(session)


def end(db: Session, session_id: uuid.UUID) -> None:
    db.execute(
        update(AuthSession)
        .where(AuthSession.id == session_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


def end_all(db: Session, user_id: uuid.UUID, keep: uuid.UUID | None = None) -> None:
    """End every session of the user, except `keep` (the one changing the password)."""
    query = update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    if keep is not None:
        query = query.where(AuthSession.id != keep)
    db.execute(query.values(revoked_at=_now()))
