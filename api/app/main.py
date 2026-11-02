import logging

from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db import engine
from app.routers import admin, auth, users

logger = logging.getLogger(__name__)
app = FastAPI(title="CivicPulse API")
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            postgis = conn.execute(text("SELECT postgis_version()")).scalar_one()
    except SQLAlchemyError:
        # The raw error names internal hosts, so it goes to the log, not the response.
        logger.exception("health check could not reach the database")
        raise HTTPException(status_code=503, detail="db_unavailable") from None
    return {"status": "ok", "postgis": postgis}
