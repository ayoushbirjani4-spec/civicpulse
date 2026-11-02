import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from geoalchemy2 import WKTElement
from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import images
from app.config import DAILY_UPLOAD_CAP, MAX_UPLOAD_BYTES
from app.db import get_db
from app.deps import get_current_user, limit_writes
from app.models import Category, Image, Pin, Report, User
from app.schemas import CategoryOut, ReportOut, ReportPage

router = APIRouter(tags=["reports"])


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Category).where(Category.active).order_by(Category.sort_order)).all()


def _query():
    return (
        select(
            Report,
            Category.name,
            func.ST_Y(func.geometry(Report.location)),
            func.ST_X(func.geometry(Report.location)),
            Image.storage_name,
        )
        .join(Category, Category.id == Report.category_id)
        .outerjoin(Image, and_(Image.report_id == Report.id, Image.kind == "report"))
    )


def _out(row) -> ReportOut:
    report, category_name, lat, lng, storage_name = row
    return ReportOut(
        id=report.id,
        client_uuid=report.client_uuid,
        pin_id=report.pin_id,
        category_id=report.category_id,
        category_name=category_name,
        description=report.description,
        lat=lat,
        lng=lng,
        accuracy_m=report.accuracy_m,
        is_mocked=report.is_mocked,
        captured_at=report.captured_at,
        created_at=report.created_at,
        state=report.state,
        photo_url=images.url_for(storage_name) if storage_name else None,
    )


def _existing(db: Session, client_uuid: uuid.UUID, user: User) -> ReportOut | None:
    """A repeated client_uuid is the same report, so an upload retried after a lost reply is
    answered with the original instead of creating a second one."""
    row = db.execute(_query().where(Report.client_uuid == client_uuid)).first()
    if row is None:
        return None
    if row[0].user_id != user.id:
        raise HTTPException(status_code=409, detail="client_uuid_conflict")
    return _out(row)


@router.post("/reports", status_code=201, response_model=ReportOut, dependencies=[Depends(limit_writes)])
def create_report(
    response: Response,
    photo: UploadFile = File(...),
    category_id: uuid.UUID = Form(...),
    lat: float = Form(..., ge=-90, le=90),
    lng: float = Form(..., ge=-180, le=180),
    accuracy_m: float = Form(..., gt=0, le=5000),
    captured_at: datetime = Form(...),
    client_uuid: uuid.UUID = Form(...),
    is_mocked: bool = Form(False),
    description: str | None = Form(None, max_length=1000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if (done := _existing(db, client_uuid, user)) is not None:
        response.status_code = 200
        return done

    category = db.get(Category, category_id)
    if category is None or not category.active:
        raise HTTPException(status_code=422, detail="unknown_category")
    if captured_at.tzinfo is None:
        captured_at = captured_at.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    if captured_at > now + timedelta(minutes=10):
        raise HTTPException(status_code=422, detail="captured_at_in_future")

    uploaded_today = db.scalar(
        select(func.count()).where(Image.uploader_id == user.id, Image.created_at > now - timedelta(days=1))
    )
    if uploaded_today >= DAILY_UPLOAD_CAP:
        raise HTTPException(status_code=429, detail="daily_upload_cap")

    # Read one byte past the cap, so an oversized file is refused without reading all of it.
    try:
        cleaned = images.clean(photo.file.read(MAX_UPLOAD_BYTES + 1))
    except images.ImageRejected as e:
        raise HTTPException(status_code=e.status, detail=e.code) from None

    point = WKTElement(f"POINT({lng} {lat})", srid=4326)
    note = (description or "").strip() or None
    name = images.store(cleaned)
    try:
        # Placeholder until M5: one new pin per report, at the report's position.
        pin = Pin(
            category_id=category.id,
            location=point,
            avg_accuracy_m=accuracy_m,
            supporter_count=1,
            first_reported_at=captured_at,
            last_reported_at=captured_at,
        )
        db.add(pin)
        db.flush()
        report = Report(
            client_uuid=client_uuid,
            user_id=user.id,
            pin_id=pin.id,
            category_id=category.id,
            description=note,
            location=point,
            accuracy_m=accuracy_m,
            is_mocked=is_mocked,
            captured_at=captured_at,
            merge_decision={"rule": "placeholder_new_pin_per_report"},
        )
        db.add(report)
        db.flush()
        db.add(
            Image(
                report_id=report.id,
                pin_id=pin.id,
                uploader_id=user.id,
                kind="report",
                storage_name=name,
                sha256=cleaned.sha256,
                phash=cleaned.phash,
                width=cleaned.width,
                height=cleaned.height,
                taken_at=captured_at,
            )
        )
        db.commit()
    except IntegrityError:
        # Two copies of one upload raced past the check above; answer with the winner.
        db.rollback()
        images.delete(name)
        if (done := _existing(db, client_uuid, user)) is not None:
            response.status_code = 200
            return done
        raise
    except Exception:
        images.delete(name)
        raise

    return _out(db.execute(_query().where(Report.id == report.id)).one())


@router.get("/reports/mine", response_model=ReportPage)
def my_reports(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        _query()
        .where(Report.user_id == user.id)
        .order_by(Report.created_at.desc(), Report.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return ReportPage(items=[_out(r) for r in rows], limit=limit, offset=offset)


@router.get("/reports/{report_id}", response_model=ReportOut)
def get_report(report_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(_query().where(Report.id == report_id)).first()
    # Exact coordinates belong to the reporter and admins only; to anyone else it does not exist.
    if row is None or (row[0].user_id != user.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="report_not_found")
    return _out(row)
