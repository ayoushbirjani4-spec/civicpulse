"""M4: hazards on the map.

GET /pins?bbox=minLng,minLat,maxLng,maxLat&category=<uuid>&status=open,pending_repair

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
    # Newest report photo of each pin, for the detail sheet.
    thumb = (
        select(Image.storage_name)
        .where(Image.pin_id == Pin.id, Image.kind == "report")
        .order_by(Image.created_at.desc())
        .limit(1)
        .correlate(Pin)
        .scalar_subquery()
    )
    query = (
        select(
            Pin.id,
            Pin.status,
            Pin.severity,
            Pin.supporter_count,
            Pin.category_id,
            Category.name,
            func.ST_X(func.geometry(Pin.location)),
            func.ST_Y(func.geometry(Pin.location)),
            thumb,
        )
        .join(Category, Category.id == Pin.category_id)
        .where(func.ST_Intersects(Pin.location, envelope), Pin.status.in_(_statuses(status)))
        .order_by(Pin.last_reported_at.desc())
        .limit(MAX_PINS)
    )
    if category is not None:
        query = query.where(Pin.category_id == category)

    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {
                "id": str(pin_id),
                "status": pin_status,
                "severity": severity,
                "supporter_count": supporters,
                "category_id": str(category_id),
                "category_name": category_name,
                "thumbnail_url": images.url_for(storage_name) if storage_name else None,
            },
        }
        for pin_id, pin_status, severity, supporters, category_id, category_name, lng, lat, storage_name in db.execute(
            query
        )
    ]
    return {"type": "FeatureCollection", "features": features}
