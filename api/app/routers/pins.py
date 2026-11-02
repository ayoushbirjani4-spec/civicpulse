"""M4: hazards on the map.

GET /pins?bbox=minLng,minLat,maxLng,maxLat&category=<uuid>&status=open,pending_repair
GET /pins/{id}

One spatial lookup on the GiST index of pins.location, returned as GeoJSON. Closed pins are
left out unless asked for. Nothing here names who reported a hazard.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from geoalchemy2 import Geography
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session

from app import images
from app.db import get_db
from app.deps import get_current_user
from app.models import Category, Image, Pin, User

router = APIRouter(tags=["pins"])

STATUSES = {"open", "pending_repair", "closed"}
DEFAULT_STATUSES = ["open", "pending_repair"]
MAX_PINS = 500
# About 11 m. Until M5 merges reports, a pin sits exactly where its reporter stood, and the
# proposal keeps exact positions for the reporter and admins only.
PUBLIC_DECIMALS = 4
DETAIL_PHOTOS = 6


def _bbox(raw: str) -> tuple[float, float, float, float]:
    try:
        min_lng, min_lat, max_lng, max_lat = (float(x) for x in raw.split(","))
    except ValueError:
        raise HTTPException(status_code=422, detail="invalid_bbox") from None
    if not (-180 <= min_lng < max_lng <= 180 and -90 <= min_lat < max_lat <= 90):
        raise HTTPException(status_code=422, detail="invalid_bbox")
    return min_lng, min_lat, max_lng, max_lat


def _statuses(raw: str | None) -> list[str]:
    if not raw:
        return DEFAULT_STATUSES
    wanted = [s.strip() for s in raw.split(",") if s.strip()]
    if not wanted or set(wanted) - STATUSES:
        raise HTTPException(status_code=422, detail="invalid_status")
    return wanted


def _position(lng: float, lat: float, user: User) -> list[float]:
    if user.role == "admin":
        return [lng, lat]
    return [round(lng, PUBLIC_DECIMALS), round(lat, PUBLIC_DECIMALS)]


def _newest_photo():
    return (
        select(Image.storage_name)
        .where(Image.pin_id == Pin.id, Image.kind == "report")
        .order_by(Image.created_at.desc())
        .limit(1)
        .correlate(Pin)
        .scalar_subquery()
    )


def _columns():
    return (
        Pin.id,
        Pin.status,
        Pin.severity,
        Pin.supporter_count,
        Pin.category_id,
        Category.name,
        Pin.follows_pin_id,
        Pin.first_reported_at,
        Pin.last_reported_at,
        func.ST_X(func.geometry(Pin.location)),
        func.ST_Y(func.geometry(Pin.location)),
        _newest_photo(),
    )


def _feature(row, user: User) -> dict:
    pin_id, status, severity, supporters, category_id, category_name, follows, first, last, lng, lat, photo = row
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": _position(lng, lat, user)},
        "properties": {
            "id": str(pin_id),
            "status": status,
            "severity": severity,
            "supporter_count": supporters,
            "category_id": str(category_id),
            "category_name": category_name,
            # A new pin where a closed one stood: a failed repair or a returning defect.
            "follows_pin_id": str(follows) if follows else None,
            "first_reported_at": first.isoformat(),
            "last_reported_at": last.isoformat(),
            "thumbnail_url": images.url_for(photo) if photo else None,
        },
    }


@router.get("/pins")
def list_pins(
    bbox: str = Query(..., description="minLng,minLat,maxLng,maxLat"),
    category: uuid.UUID | None = None,
    status: str | None = Query(None, description="Comma list; default open,pending_repair"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    min_lng, min_lat, max_lng, max_lat = _bbox(bbox)
    envelope = cast(
        func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326),
        Geography(geometry_type="POLYGON", srid=4326),
    )
    query = (
        select(*_columns())
        .join(Category, Category.id == Pin.category_id)
        .where(func.ST_Intersects(Pin.location, envelope), Pin.status.in_(_statuses(status)))
        .order_by(Pin.last_reported_at.desc(), Pin.id)
        .limit(MAX_PINS + 1)
    )
    if category is not None:
        query = query.where(Pin.category_id == category)
    rows = db.execute(query).all()
    return {
        "type": "FeatureCollection",
        "features": [_feature(r, user) for r in rows[:MAX_PINS]],
        # Tells the app to zoom in rather than silently showing part of the area.
        "truncated": len(rows) > MAX_PINS,
    }


@router.get("/pins/{pin_id}")
def get_pin(pin_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(
        select(*_columns()).join(Category, Category.id == Pin.category_id).where(Pin.id == pin_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="pin_not_found")
    feature = _feature(row, user)
    photos = db.scalars(
        select(Image.storage_name)
        .where(Image.pin_id == pin_id, Image.kind == "report")
        .order_by(Image.created_at.desc())
        .limit(DETAIL_PHOTOS)
    ).all()
    feature["properties"]["photo_urls"] = [images.url_for(p) for p in photos]
    return feature
