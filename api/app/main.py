import os
import psycopg
from fastapi import FastAPI, HTTPException
from app.routers import reports  # <-- Yeh line add karein

app = FastAPI(title="CivicPulse API")
DATABASE_URL = os.environ["DATABASE_URL"]

# Reports router ko yahan include karein
app.include_router(reports.router)


@app.get("/health")
def health_check():
    return {"status": "server OK"}