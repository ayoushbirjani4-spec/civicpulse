from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app import sessions
from app.db import get_db
from app.deps import get_current_session, get_current_user, limit_writes
from app.models import AuthSession, Device, User
from app.rate_limit import enforce
from app.routers.auth import check_password
from app.schemas import ChangePasswordIn, DeviceIn, ProfilePatch, UserOut
from app.security import hash_password, verify_password

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut, dependencies=[Depends(limit_writes)])
def update_me(
    body: ProfilePatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.display_name = body.display_name
    db.add(user)
    db.commit()
    return user


@router.post("/devices", status_code=204, dependencies=[Depends(limit_writes)])
def register_device(
    body: DeviceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statement = insert(Device).values(
        user_id=user.id, device_fingerprint=body.device_id, push_token=body.push_token
    )
    db.execute(
        statement.on_conflict_do_update(
            index_elements=[Device.device_fingerprint],
            set_={
                "user_id": user.id,
                "push_token": statement.excluded.push_token,
                "last_seen": func.now(),
            },
        )
    )
    db.commit()
    return Response(status_code=204)


@router.post("/me/password", status_code=204, dependencies=[Depends(limit_writes)])
def change_password(
    body: ChangePasswordIn,
    user: User = Depends(get_current_user),
    current: AuthSession = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    # A stolen phone that is already logged in must not be able to guess the password here.
    enforce("change_password", 600, account=(str(user.id), 5))
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="wrong_password")
    check_password(body.new_password, user.email)
    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(status_code=422, detail="same_password")
    user.password_hash = hash_password(body.new_password)
    # This phone stays logged in; every other device has to log in with the new password.
    sessions.end_all(db, user.id, keep=current.id)
    db.commit()
    return Response(status_code=204)
