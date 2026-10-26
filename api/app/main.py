import os
import psycopg
from fastapi import FastAPI, HTTPException

app = FastAPI(title="CivicPulse API")
DATABASE_URL = os.environ["DATABASE_URL"]


@app.get("/health")
def health():
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=3) as conn:
            postgis = conn.execute("SELECT postgis_version()").fetchone()[0]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"db unavailable: {e}")
    return {"status": "ok", "postgis": postgis}
