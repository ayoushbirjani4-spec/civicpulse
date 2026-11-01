import random

from geoalchemy2 import WKTElement
from passlib.hash import argon2

from app.database import SessionLocal
from app.models import Category, Pin, User

CATEGORIES = [("Pothole", "road"), ("Garbage", "trash"), ("Streetlight", "light"),
              ("Water leak", "water"), ("Sewage", "sewage"), ("Other", "other")]

db = SessionLocal()

if db.query(Category).count() == 0:
    db.add_all([Category(name=n, icon=i) for n, i in CATEGORIES])
    db.commit()

if not db.query(User).filter_by(email="admin@civicpulse.com").first():
    db.add(User(email="admin@civicpulse.com",
                password_hash=argon2.hash("ChangeMe123!"),
                role="admin", email_verified=True))
    db.commit()

if db.query(Pin).count() == 0:
    cats = db.query(Category).all()
    for _ in range(20):
        lat = 27.7052 + random.uniform(-0.03, 0.03)
        lon = 68.8574 + random.uniform(-0.03, 0.03)
        db.add(Pin(category_id=random.choice(cats).id,
                   location=WKTElement(f"POINT({lon} {lat})", srid=4326),
                   status=random.choice(["open", "in_progress"]),
                   supporter_count=random.randint(1, 15)))
    db.commit()

print("Seed done")
