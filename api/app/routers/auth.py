from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import mailer
from app.config import OTP_MAX_ATTEMPTS, OTP_MINUTES
from app.db import get_db
from app.models import EmailOtp, User
from app.rate_limit import client_ip, device_id, enforce
from app.schemas import (
    AccessTokenOut,
    LoginIn,
    LoginOut,
    RefreshIn,
    RegisterIn,
    RegisterOut,
    ResendCodeIn,
    UserOut,
    VerifyEmailIn,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_otp,
    hash_otp,
    hash_password,
    otp_matches,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_otp(db: Session, user: User) -> str:
    """Replace any outstanding code with a new one. The caller commits."""
    # Lock the account first: two resends in the same instant would otherwise each see no
    # other code and both stay active, and verify could then check the wrong one.
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    now = datetime.now(UTC)
    db.execute(
        update(EmailOtp)
        .where(EmailOtp.user_id == user.id, EmailOtp.used_at.is_(None))
        .values(used_at=now)
    )
    code = generate_otp()
    db.add(
        EmailOtp(
            user_id=user.id,
            code_hash=hash_otp(user.id, code),
            expires_at=now + timedelta(minutes=OTP_MINUTES),
        )
    )
    return code


def _find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


@router.post("/register", status_code=201, response_model=RegisterOut)
def register(
    body: RegisterIn,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    enforce("register", 3600, ip=(client_ip(request), 30), device=(device_id(request), 10))

    if _find_user(db, body.email):
        raise HTTPException(status_code=409, detail="email_already_registered")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        # Two registrations for one email raced past the check above.
        db.rollback()
        raise HTTPException(status_code=409, detail="email_already_registered")
    code = _issue_otp(db, user)
    db.commit()

    background.add_task(mailer.send_verification_code, user.email, code)
    return RegisterOut(user_id=user.id)


@router.post("/verify-email")
def verify_email(body: VerifyEmailIn, request: Request, db: Session = Depends(get_db)):
    enforce("verify", 60, account=(body.email, 10), ip=(client_ip(request), 30))

    invalid = HTTPException(status_code=400, detail="invalid_code")
    user = _find_user(db, body.email)
    if user is None:
        raise invalid
    if user.email_verified:
        return {"status": "verified"}

    # The row lock stops parallel guesses from sharing one attempt count.
    otp = db.scalar(
        select(EmailOtp)
        .where(EmailOtp.user_id == user.id, EmailOtp.used_at.is_(None))
        .order_by(EmailOtp.expires_at.desc())
        .limit(1)
        .with_for_update()
    )
    if otp is None:
        raise invalid
    if otp.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=423, detail="code_locked")
    if otp.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=400, detail="code_expired")
    if not otp_matches(user.id, body.code, otp.code_hash):
        otp.attempts += 1
        attempts = otp.attempts
        db.commit()
        if attempts >= OTP_MAX_ATTEMPTS:
            raise HTTPException(status_code=423, detail="code_locked")
        raise invalid

    otp.used_at = datetime.now(UTC)
    user.email_verified = True
    db.commit()
    return {"status": "verified"}


@router.post("/resend-code", status_code=202)
def resend_code(
    body: ResendCodeIn,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    # Tight, because each new code also grants a new set of guesses.
    enforce("resend", 600, account=(body.email, 3), ip=(client_ip(request), 20))

    user = _find_user(db, body.email)
    if user is not None and not user.email_verified:
        code = _issue_otp(db, user)
        db.commit()
        background.add_task(mailer.send_verification_code, user.email, code)
    return {"status": "sent_if_pending"}


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    enforce(
        "login",
        60,
        account=(body.email, 5),
        device=(device_id(request), 5),
        ip=(client_ip(request), 30),
    )

    user = _find_user(db, body.email)
    if not verify_password(body.password, user.password_hash if user else None):
        raise HTTPException(status_code=401, detail="invalid_credentials")
    # Only reached with the right password, so these do not reveal anything to a stranger.
    if user.status != "active":
        raise HTTPException(status_code=403, detail="account_disabled")
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="email_not_verified")

    return LoginOut(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=AccessTokenOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    user_id = decode_token(body.refresh_token, "refresh")
    user = db.get(User, user_id) if user_id else None
    if user is None or user.status != "active" or not user.email_verified:
        raise HTTPException(status_code=401, detail="invalid_refresh_token")
    enforce("refresh", 60, account=(str(user.id), 20))
    return AccessTokenOut(access_token=create_access_token(user.id))
