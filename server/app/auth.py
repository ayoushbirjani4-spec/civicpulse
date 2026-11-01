from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models import EmailOtp, User
from app.security import (create_token, generate_otp, hash_otp,
                          hash_password, verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str


class VerifyIn(BaseModel):
    email: EmailStr
    code: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@router.post("/register", status_code=201)
@limiter.limit("5/minute")
def register(request: Request, data: RegisterIn, db: Session = Depends(get_db)):
    if len(data.password) < 8:
        raise HTTPException(400, "Password kam az kam 8 characters ka ho")
    if db.query(User).filter_by(email=data.email.lower()).first():
        raise HTTPException(409, "Email pehle se registered hai")
    user = User(email=data.email.lower(), password_hash=hash_password(data.password))
    db.add(user)
    db.flush()
    code = generate_otp()
    db.add(EmailOtp(user_id=user.id, code_hash=hash_otp(code),
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)))
    db.commit()
    print(f"[DEV] OTP for {user.email}: {code}")
    return {"message": "Code email par bhej diya gaya"}


@router.post("/verify-email")
def verify_email(data: VerifyIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=data.email.lower()).first()
    if not user:
        raise HTTPException(400, "Galat code")
    otp = (db.query(EmailOtp).filter_by(user_id=user.id, used=False)
           .order_by(EmailOtp.created_at.desc()).first())
    if not otp or otp.expires_at < datetime.now(timezone.utc) or otp.attempts >= 5:
        raise HTTPException(400, "Code expire ya lock ho gaya")
    otp.attempts += 1
    if otp.code_hash != hash_otp(data.code):
        db.commit()
        raise HTTPException(400, "Galat code")
    otp.used = True
    user.email_verified = True
    db.commit()
    return {"message": "Email verify ho gayi"}


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Email ya password galat hai")
    if not user.email_verified:
        raise HTTPException(403, "Pehle email verify karein")
    uid = str(user.id)
    return {
        "access_token": create_token(uid, user.role, minutes=15),
        "refresh_token": create_token(uid, user.role, days=14, kind="refresh"),
        "token_type": "bearer",
    }
