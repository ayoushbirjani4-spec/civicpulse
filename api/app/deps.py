from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AuthSession, User
from app.rate_limit import device_id, enforce
from app.security import decode_token

_bearer = HTTPBearer(auto_error=False)
_UNAUTHENTICATED = HTTPException(
    status_code=401, detail="not_authenticated", headers={"WWW-Authenticate": "Bearer"}
)


def get_current_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> AuthSession:
    """The login session behind the access token. A session ended by logout or a password
    change stops its access tokens at once, not when they expire."""
    claims = decode_token(credentials.credentials, "access") if credentials else None
    session = db.get(AuthSession, claims["sid"]) if claims else None
    if session is None or session.user_id != claims["sub"] or session.revoked_at is not None:
        raise _UNAUTHENTICATED
    return session


def get_current_user(session: AuthSession = Depends(get_current_session), db: Session = Depends(get_db)) -> User:
    """The caller's account. Checked against the database on every request, so disabling
    an account takes effect immediately, and only verified accounts ever get through."""
    user = db.get(User, session.user_id)
    if user is None:
        raise _UNAUTHENTICATED
    if user.status != "active":
        raise HTTPException(status_code=403, detail="account_disabled")
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="email_not_verified")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="admin_only")
    return user


def limit_writes(request: Request, user: User = Depends(get_current_user)) -> None:
    """Per-account and per-device limit shared by authenticated write routes."""
    enforce("write", 60, account=(str(user.id), 30), device=(device_id(request), 30))
