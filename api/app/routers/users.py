from fastapi import APIRouter, Depends, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, limit_writes
from app.models import Device, User
from app.schemas import DeviceIn, ProfilePatch, UserOut

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
