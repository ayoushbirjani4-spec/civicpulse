import random
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import text

from app.db import engine

_HIT = text(
    """
    INSERT INTO rate_limit_counters (key, window_start, count)
    VALUES (:key, :window_start, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limit_counters.count + 1
    RETURNING count
    """
)
_CLEANUP = text("DELETE FROM rate_limit_counters WHERE window_start < :cutoff")


def device_id(request: Request) -> str | None:
    value = request.headers.get("x-device-id")
    return value[:128] if value else None


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def enforce(action: str, window_seconds: int, **scopes: tuple[str | None, int]) -> None:
    """Count one request against each scope, e.g. account=(email, 5), and raise 429 if
    any scope is over its limit. A scope whose value is None is skipped.

    Uses its own transaction so a request that later fails is still counted.
    """
    now = int(datetime.now(UTC).timestamp())
    start = now - now % window_seconds
    window_start = datetime.fromtimestamp(start, UTC)
    exceeded = False

    with engine.begin() as conn:
        for scope, (value, limit) in scopes.items():
            if value is None:
                continue
            params = {"key": f"{action}:{scope}:{value}"[:255], "window_start": window_start}
            exceeded |= conn.execute(_HIT, params).scalar_one() > limit
        if random.random() < 0.01:
            conn.execute(_CLEANUP, {"cutoff": datetime.now(UTC) - timedelta(days=1)})

    if exceeded:
        raise HTTPException(
            status_code=429,
            detail="rate_limited",
            headers={"Retry-After": str(start + window_seconds - now)},
        )
